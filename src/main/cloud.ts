import { nativeImage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { cloudConfigured, eventKeepOnlineDays, safeFolderName } from '@shared/types'
import type { CloudPublishResult, CloudSettings, CloudStatus, PhotoboothEvent } from '@shared/types'
import {
  copyToExportFolder,
  eventCompletedDir,
  eventDir,
  eventFile,
  eventGifsDir,
  eventIndividualDir,
  eventSessionsDir,
  eventsDir,
  exportStamp,
  readSettings
} from './storage'
import { VIEWER_HTML, VIEWER_VERSION } from './cloudViewer'
import {
  albumPageUrl,
  applyRetention,
  claimFolder,
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
//
// The bucket mirrors the save location: <Event Name>/Photos, /Individual Photos
// and /GIFs, with the same time-stamped file names (see cloudCore.ts).

interface SessionState {
  createdAt: string
  /** the time-stamped file name shared with the save location; absent on sessions
   *  uploaded before the bucket mirrored it */
  stamp?: string
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
  /** the event's folder in the bucket, fixed when it first published so the album
   *  and every link keep working if the event is renamed later. Absent on events
   *  uploaded before folders were named after the event. */
  folder?: string
  /** the keep-online days last applied to the bucket, or 'unset' if never applied */
  retentionApplied: number | null | 'unset'
  /** the folder that rule covers */
  retentionFolder?: string
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
const FOLDER_CHECK_TIMEOUT_MS = 3_000

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

/** The event's individual shots on disk, numbered the way the save location numbers them. */
async function readShots(eventId: string, sessionId: string): Promise<Array<{ n: number; data: Buffer }>> {
  const dir = path.join(eventIndividualDir(eventId), sessionId)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const shots: Array<{ n: number; data: Buffer }> = []
  for (const name of names) {
    const match = /^photo_(\d+)\.jpg$/.exec(name)
    if (!match) continue
    const data = await readIfExists(path.join(dir, name))
    if (data) shots.push({ n: Number(match[1]), data })
  }
  return shots.sort((a, b) => a.n - b.n)
}

// ---- Public API (called from IPC) ----

export function testCloudConnection(cfg: CloudSettings): Promise<ConnectionResult> {
  return testConnection(makeClient(cfg), cfg.bucket.trim())
}

/**
 * The event's folder name: its name in the app, made unique against what's
 * already in the bucket when that can be checked quickly. Offline, the plain
 * name is used — the QR code has to be shown right away.
 */
async function chooseFolder(cloud: CloudSettings, event: PhotoboothEvent | null, eventId: string): Promise<string> {
  const desired = safeFolderName(event?.name ?? '')
  try {
    return await claimFolder(
      makeClient(cloud),
      cloud.bucket.trim(),
      desired,
      eventId,
      AbortSignal.timeout(FOLDER_CHECK_TIMEOUT_MS)
    )
  } catch {
    return desired
  }
}

/**
 * Gives a finished session its permanent link (and saves its QR code to the
 * save location) and queues the upload. Returns right away — the page the QR
 * opens says "on its way" until the files land. Null when online sharing is off.
 */
export async function publishSession(eventId: string, sessionId: string): Promise<CloudPublishResult | null> {
  const { cloud } = await readSettings()
  if (!cloudConfigured(cloud)) return null

  const known = await readState(eventId)
  const folder = known?.folder ?? (await chooseFolder(cloud, await readEvent(eventId), eventId))

  const state = await exclusive(async () => {
    const current = (await readState(eventId)) ?? {
      firstUploadAt: new Date().toISOString(),
      publicUrl: cloud.publicUrl.trim().replace(/\/+$/, ''),
      retentionApplied: 'unset' as const,
      sessions: {}
    }
    if (!current.folder) current.folder = folder
    if (!current.sessions[sessionId]) {
      const stamp = exportStamp(sessionId)
      current.sessions[sessionId] = {
        createdAt: await sessionCreatedAt(eventId, sessionId),
        stamp,
        url: sessionPageUrl(cloud.publicUrl, current.folder, stamp),
        landscape: false,
        done: false,
        photo: null,
        gif: null,
        thumb: null
      }
    }
    await writeState(eventId, current)
    return current
  })

  const sessionUrl = state.sessions[sessionId].url
  saveQrToExportFolder(eventId, sessionId, sessionUrl)
  enqueue({ eventId, sessionId })
  return { sessionUrl, albumUrl: albumPageUrl(state.publicUrl, state.folder as string) }
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
  const folder = state?.folder ?? safeFolderName((await readEvent(eventId))?.name ?? '')
  return albumPageUrl(state?.publicUrl ?? cloud.publicUrl, folder)
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
  if (!state?.folder || !entry || entry.done) return

  const photo = await readIfExists(path.join(eventCompletedDir(eventId), `${sessionId}.png`))
  const gif = await readIfExists(path.join(eventGifsDir(eventId), `${sessionId}.gif`))
  const shots = await readShots(eventId, sessionId)

  // Nothing left locally (deleted before it could upload): drop it instead of publishing an empty entry.
  if (!photo && !gif && shots.length === 0) {
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

  const stamp = entry.stamp ?? exportStamp(sessionId)
  const uploaded: AlbumSession = await uploadSessionFiles(s3, bucket, {
    folder: state.folder,
    stamp,
    createdAt: entry.createdAt,
    photo,
    gif,
    thumb,
    shots,
    landscape
  })

  await exclusive(async () => {
    const current = await readState(eventId)
    if (!current?.sessions[sessionId]) return
    Object.assign(current.sessions[sessionId], {
      done: true,
      stamp,
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
  const event = await readEvent(eventId)
  let state = await readState(eventId)
  if (!state || !event) return

  // Events uploaded before folders were named after the event get one now.
  if (!state.folder) {
    state = await exclusive(async () => {
      const current = (await readState(eventId)) as EventCloudState
      current.folder = current.folder ?? safeFolderName(event.name)
      await writeState(eventId, current)
      return current
    })
  }
  const folder = state.folder as string

  const keepDays = eventKeepOnlineDays(event)
  const album: AlbumData = {
    v: 1,
    eventId,
    folder,
    name: event.name || 'Photo Album',
    createdAt: state.firstUploadAt,
    expiresAt:
      keepDays === null ? null : new Date(Date.parse(state.firstUploadAt) + keepDays * 86_400_000).toISOString(),
    sessions: Object.entries(state.sessions)
      .filter(([, s]) => s.done)
      .map(([id, s]) => ({
        id: s.stamp ?? id,
        createdAt: s.createdAt,
        photo: s.photo,
        gif: s.gif,
        thumb: s.thumb,
        landscape: s.landscape
      }))
  }
  await putAlbum(s3, bucket, album)

  if (state.retentionApplied === keepDays && state.retentionFolder === folder) return
  try {
    await applyRetention(s3, bucket, eventId, folder, keepDays)
    lastWarning = null
    await exclusive(async () => {
      const current = await readState(eventId)
      if (!current) return
      current.retentionApplied = keepDays
      current.retentionFolder = folder
      await writeState(eventId, current)
    })
  } catch (err) {
    // Photos still upload; only the automatic deletion couldn't be scheduled.
    if (keepDays !== null) {
      lastWarning = `Couldn’t set “keep online for” on the bucket (${describeError(err)}). Use an Admin Read & Write key to enable it.`
    }
  }
}
