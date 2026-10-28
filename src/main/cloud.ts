import { nativeImage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { cloudConfigured, eventKeepOnlineDays } from '@shared/types'
import type { CloudPublishResult, CloudSettings, CloudStatus, PhotoboothEvent } from '@shared/types'
import {
  copyToExportFolder,
  eventCompletedDir,
  eventDir,
  eventFile,
  eventGifsDir,
  eventSessionsDir,
  eventsDir,
  readSettings
} from './storage'
import { VIEWER_HTML, VIEWER_VERSION } from './cloudViewer'
import {
  albumPageUrl,
  applyRetention,
  describeError,
  makeClient,
  putAlbum,
  putViewer,
  sessionPageUrl,
  testConnection,
  uploadSessionFiles
} from './cloudCore'
import type { AlbumData, AlbumSession, ConnectionResult } from './cloudCore'

// Uploads each finished session to the bucket in the background. A session
// gets its link the moment it's published (the link is predictable), while the
// files follow as soon as there's a connection — failed uploads are retried and
// anything left over is picked up again the next time the app starts.

interface SessionState {
  createdAt: string
  /** the link this session's QR code points at, fixed when it was published */
  url: string
  landscape: boolean
  done: boolean
  photo: string | null
  gif: string | null
  thumb: string | null
}

interface EventCloudState {
  firstUploadAt: string
  /** the public address in use when the event first published */
  publicUrl: string
  /** the keep-online days last applied to the bucket, or 'unset' if never applied */
  retentionApplied: number | null | 'unset'
  sessions: Record<string, SessionState>
}

interface Job {
  eventId: string
  /** absent for event-level refreshes (album details, keep-online timing) */
  sessionId?: string
}

const THUMB_WIDTH = 480
const RETRY_START_MS = 15_000
const RETRY_MAX_MS = 5 * 60_000

const queue: Job[] = []
let pumping = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = RETRY_START_MS
let lastError: string | null = null
let lastWarning: string | null = null
let viewerSentFor = ''

// ---- Per-event state (events/<id>/cloud.json) ----

const stateFile = (eventId: string): string => path.join(eventDir(eventId), 'cloud.json')

async function readState(eventId: string): Promise<EventCloudState | null> {
  try {
    return JSON.parse(await fs.readFile(stateFile(eventId), 'utf-8')) as EventCloudState
  } catch {
    return null
  }
}

async function writeState(eventId: string, state: EventCloudState): Promise<void> {
  await fs.writeFile(stateFile(eventId), JSON.stringify(state, null, 2), 'utf-8')
}

// State is read-modify-written from several places (publishing while the
// worker is mid-upload), so those short sections run one at a time.
let stateChain: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = stateChain.then(fn, fn)
  stateChain = run.catch(() => undefined)
  return run
}

async function readEvent(eventId: string): Promise<PhotoboothEvent | null> {
  try {
    return JSON.parse(await fs.readFile(eventFile(eventId), 'utf-8')) as PhotoboothEvent
  } catch {
    return null
  }
}

async function readIfExists(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file)
  } catch {
    return null
  }
}

// ---- Public API (called from IPC) ----

export function testCloudConnection(cfg: CloudSettings): Promise<ConnectionResult> {
  return testConnection(makeClient(cfg), cfg.bucket.trim())
}

/**
 * Gives a finished session its permanent link (and saves its QR code to the
 * save location) and queues the upload. Returns right away — the page the QR
 * opens says "on its way" until the files land. Null when online sharing is off.
 */
export async function publishSession(eventId: string, sessionId: string): Promise<CloudPublishResult | null> {
  const { cloud } = await readSettings()
  if (!cloudConfigured(cloud)) return null

  const state = await exclusive(async () => {
    const current = (await readState(eventId)) ?? {
      firstUploadAt: new Date().toISOString(),
      publicUrl: cloud.publicUrl.trim().replace(/\/+$/, ''),
      retentionApplied: 'unset' as const,
      sessions: {}
    }
    if (!current.sessions[sessionId]) {
      current.sessions[sessionId] = {
        createdAt: await sessionCreatedAt(eventId, sessionId),
        url: sessionPageUrl(cloud.publicUrl, eventId, sessionId),
        landscape: false,
        done: false,
        photo: null,
        gif: null,
        thumb: null
      }
      await writeState(eventId, current)
    }
    return current
  })

  const sessionUrl = state.sessions[sessionId].url
  saveQrToExportFolder(eventId, sessionId, sessionUrl)
  enqueue({ eventId, sessionId })
  return { sessionUrl, albumUrl: albumPageUrl(state.publicUrl, eventId) }
}

async function sessionCreatedAt(eventId: string, sessionId: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(eventSessionsDir(eventId), `${sessionId}.json`), 'utf-8')
    return (JSON.parse(raw) as { createdAt?: string }).createdAt ?? new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function saveQrToExportFolder(eventId: string, sessionId: string, url: string): void {
  QRCode.toBuffer(url, { width: 600, margin: 2 })
    .then((png) => copyToExportFolder(eventId, sessionId, 'QR Codes', '', 'png', png))
    .catch((err) => console.warn('Could not save the QR code:', err))
}

/** The event's album page, or null if online sharing is off. */
export async function albumUrlFor(eventId: string): Promise<string | null> {
  const { cloud } = await readSettings()
  if (!cloudConfigured(cloud)) return null
  const state = await readState(eventId)
  return albumPageUrl(state?.publicUrl ?? cloud.publicUrl, eventId)
}

/** An event was saved: refresh its album title and keep-online timing if it has been uploaded before. */
export async function syncEvent(eventId: string): Promise<void> {
  if (await readState(eventId)) {
    enqueue({ eventId })
  }
}

export async function cloudStatus(): Promise<CloudStatus> {
  const { cloud } = await readSettings()
  return {
    configured: cloudConfigured(cloud),
    pending: (await findPending()).length,
    lastError,
    warning: lastWarning
  }
}

/** Retries everything that hasn't uploaded yet, right now. */
export async function retryNow(): Promise<void> {
  retryDelay = RETRY_START_MS
  await resumeUploads()
}

/** Queues every session that still needs uploading (startup, settings saved, manual retry). */
export async function resumeUploads(): Promise<void> {
  const { cloud } = await readSettings()
  if (!cloudConfigured(cloud)) return
  for (const job of await findPending()) enqueue(job)
}

async function findPending(): Promise<Job[]> {
  const jobs: Job[] = []
  const ids = await fs.readdir(eventsDir()).catch(() => [] as string[])
  for (const eventId of ids) {
    const state = await readState(eventId)
    if (!state) continue
    for (const [sessionId, s] of Object.entries(state.sessions)) {
      if (!s.done) jobs.push({ eventId, sessionId })
    }
  }
  return jobs
}

// ---- Upload worker ----

function enqueue(job: Job): void {
  if (!queue.some((j) => j.eventId === job.eventId && j.sessionId === job.sessionId)) queue.push(job)
  void pump()
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0) {
      const job = queue[0]
      try {
        await processJob(job)
        queue.shift()
        lastError = null
        retryDelay = RETRY_START_MS
      } catch (err) {
        lastError = describeError(err)
        console.warn('Online upload failed, will retry:', err)
        scheduleRetry()
        return
      }
    }
  } finally {
    pumping = false
  }
}

function scheduleRetry(): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void pump()
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
}

async function processJob(job: Job): Promise<void> {
  const { cloud } = await readSettings()
  // Left unsent (still marked pending) until online sharing is set up and saved.
  if (!cloudConfigured(cloud)) return
  const s3 = makeClient(cloud)
  const bucket = cloud.bucket.trim()

  const viewerKey = `${cloud.accountId}/${bucket}/${VIEWER_VERSION}`
  if (viewerSentFor !== viewerKey) {
    await putViewer(s3, bucket, VIEWER_HTML)
    viewerSentFor = viewerKey
  }

  if (job.sessionId) await uploadSession(s3, bucket, job.eventId, job.sessionId)
  await refreshEvent(s3, bucket, job.eventId)
}

async function uploadSession(
  s3: ReturnType<typeof makeClient>,
  bucket: string,
  eventId: string,
  sessionId: string
): Promise<void> {
  const state = await readState(eventId)
  const entry = state?.sessions[sessionId]
  if (!entry || entry.done) return

  const photo = await readIfExists(path.join(eventCompletedDir(eventId), `${sessionId}.png`))
  const gif = await readIfExists(path.join(eventGifsDir(eventId), `${sessionId}.gif`))

  // Nothing left locally (deleted before it could upload): drop it instead of publishing an empty entry.
  if (!photo && !gif) {
    await exclusive(async () => {
      const current = await readState(eventId)
      if (!current) return
      delete current.sessions[sessionId]
      await writeState(eventId, current)
    })
    return
  }

  let thumb: Buffer | null = null
  let landscape = entry.landscape
  if (photo) {
    const image = nativeImage.createFromBuffer(photo)
    const { width, height } = image.getSize()
    if (width > 0 && height > 0) {
      landscape = width > height
      thumb = image.resize({ width: Math.min(THUMB_WIDTH, width), quality: 'good' }).toJPEG(82)
    }
  }

  const uploaded: AlbumSession = await uploadSessionFiles(s3, bucket, {
    eventId,
    sessionId,
    createdAt: entry.createdAt,
    photo,
    gif,
    thumb,
    landscape
  })

  await exclusive(async () => {
    const current = await readState(eventId)
    if (!current?.sessions[sessionId]) return
    Object.assign(current.sessions[sessionId], {
      done: true,
      landscape,
      photo: uploaded.photo,
      gif: uploaded.gif,
      thumb: uploaded.thumb
    })
    await writeState(eventId, current)
  })
}

/** Rewrites the event's album.json from what's uploaded so far, and keeps its auto-delete timing current. */
async function refreshEvent(s3: ReturnType<typeof makeClient>, bucket: string, eventId: string): Promise<void> {
  const state = await readState(eventId)
  const event = await readEvent(eventId)
  if (!state || !event) return

  const keepDays = eventKeepOnlineDays(event)
  const album: AlbumData = {
    v: 1,
    eventId,
    name: event.name || 'Photo Album',
    createdAt: state.firstUploadAt,
    expiresAt:
      keepDays === null ? null : new Date(Date.parse(state.firstUploadAt) + keepDays * 86_400_000).toISOString(),
    sessions: Object.entries(state.sessions)
      .filter(([, s]) => s.done)
      .map(([id, s]) => ({
        id,
        createdAt: s.createdAt,
        photo: s.photo,
        gif: s.gif,
        thumb: s.thumb,
        landscape: s.landscape
      }))
  }
  await putAlbum(s3, bucket, album)

  if (state.retentionApplied === keepDays) return
  try {
    await applyRetention(s3, bucket, eventId, keepDays)
    lastWarning = null
    await exclusive(async () => {
      const current = await readState(eventId)
      if (!current) return
      current.retentionApplied = keepDays
      await writeState(eventId, current)
    })
  } catch (err) {
    // Photos still upload; only the automatic deletion couldn't be scheduled.
    if (keepDays !== null) {
      lastWarning = `Couldn’t set “keep online for” on the bucket (${describeError(err)}). Use an Admin Read & Write key to enable it.`
    }
  }
}
