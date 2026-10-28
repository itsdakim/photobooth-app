import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  DeleteBucketLifecycleCommand
} from '@aws-sdk/client-s3'
import type { LifecycleRule } from '@aws-sdk/client-s3'
import type { CloudSettings } from '@shared/types'

// Everything that talks to the bucket, kept free of Electron so it can run
// against any S3-compatible endpoint. The bucket mirrors the save location on
// the computer — one folder per event, named after the event in the app:
//
//   v.html                               the guest/album page (shared by all events)
//   <Event Name>/Photos/<stamp>.png      finished prints
//   <Event Name>/Individual Photos/<stamp>_<n>.jpg
//   <Event Name>/GIFs/<stamp>.gif
//   <Event Name>/_thumbs/<stamp>.jpg     small previews for the album grid
//   <Event Name>/album.json              what the album page reads
//
// Everything for an event sits under its own folder so one lifecycle rule can
// expire the whole event.

export interface AlbumSession {
  /** the session's time stamp — also its file name and its guest page link */
  id: string
  createdAt: string
  photo: string | null
  gif: string | null
  thumb: string | null
  landscape: boolean
}

export interface AlbumData {
  v: 1
  eventId: string
  /** the event's folder in the bucket */
  folder: string
  name: string
  createdAt: string
  /** when the event's files are scheduled to disappear, or null if kept indefinitely */
  expiresAt: string | null
  sessions: AlbumSession[]
}

export interface SessionFiles {
  folder: string
  stamp: string
  createdAt: string
  photo: Buffer | null
  gif: Buffer | null
  thumb: Buffer | null
  /** each individual shot, numbered the way the save location numbers them */
  shots: Array<{ n: number; data: Buffer }>
  landscape: boolean
}

const MEDIA_CACHE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'

export function makeClient(cfg: CloudSettings, endpointOverride?: string): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: endpointOverride ?? `https://${cfg.accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId.trim(), secretAccessKey: cfg.secretAccessKey.trim() },
    forcePathStyle: true,
    // R2 doesn't accept the extra checksum headers newer SDK versions add by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  })
}

/** Trailing slashes removed so paths can be appended safely. */
export function normalizePublicUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** The page a guest's QR code opens. Folder and stamp are readable, so the link says what it is. */
export function sessionPageUrl(publicUrl: string, folder: string, stamp: string): string {
  return `${normalizePublicUrl(publicUrl)}/v.html?f=${encodeURIComponent(folder)}&s=${encodeURIComponent(stamp)}`
}

export function albumPageUrl(publicUrl: string, folder: string): string {
  return `${normalizePublicUrl(publicUrl)}/v.html?f=${encodeURIComponent(folder)}`
}

export function folderPrefix(folder: string): string {
  return `${folder}/`
}

const photoKey = (folder: string, stamp: string): string => `${folder}/Photos/${stamp}.png`
const gifKey = (folder: string, stamp: string): string => `${folder}/GIFs/${stamp}.gif`
const thumbKey = (folder: string, stamp: string): string => `${folder}/_thumbs/${stamp}.jpg`
const shotKey = (folder: string, stamp: string, n: number): string =>
  `${folder}/Individual Photos/${stamp}_${n}.jpg`
const albumKey = (folder: string): string => `${folder}/album.json`

async function put(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer | string,
  contentType: string,
  cacheControl: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl })
  )
}

/** Uploads one session's files and returns its album entry. Files that don't exist are skipped. */
export async function uploadSessionFiles(s3: S3Client, bucket: string, files: SessionFiles): Promise<AlbumSession> {
  const { folder, stamp } = files
  const entry: AlbumSession = {
    id: stamp,
    createdAt: files.createdAt,
    photo: null,
    gif: null,
    thumb: null,
    landscape: files.landscape
  }
  if (files.photo) {
    entry.photo = photoKey(folder, stamp)
    await put(s3, bucket, entry.photo, files.photo, 'image/png', MEDIA_CACHE)
  }
  if (files.thumb) {
    entry.thumb = thumbKey(folder, stamp)
    await put(s3, bucket, entry.thumb, files.thumb, 'image/jpeg', MEDIA_CACHE)
  }
  if (files.gif) {
    entry.gif = gifKey(folder, stamp)
    await put(s3, bucket, entry.gif, files.gif, 'image/gif', MEDIA_CACHE)
  }
  for (const shot of files.shots) {
    await put(s3, bucket, shotKey(folder, stamp, shot.n), shot.data, 'image/jpeg', MEDIA_CACHE)
  }
  return entry
}

export async function putAlbum(s3: S3Client, bucket: string, album: AlbumData): Promise<void> {
  await put(s3, bucket, albumKey(album.folder), JSON.stringify(album), 'application/json; charset=utf-8', NO_CACHE)
}

export async function putViewer(s3: S3Client, bucket: string, html: string): Promise<void> {
  await put(s3, bucket, 'v.html', html, 'text/html; charset=utf-8', NO_CACHE)
}

/**
 * Picks the event's folder name: its name in the app, or "name 2", "name 3", …
 * if a different event already uses that folder in the bucket (say, an older
 * event of the same name that was since deleted from the app). Throws if the
 * bucket can't be reached — callers fall back to the plain name.
 */
export async function claimFolder(
  s3: S3Client,
  bucket: string,
  desired: string,
  eventId: string,
  signal?: AbortSignal
): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? desired : `${desired} ${n}`
    let existing: { eventId?: string } | null = null
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: albumKey(candidate) }), {
        abortSignal: signal
      })
      existing = JSON.parse((await res.Body?.transformToString()) ?? '{}')
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e?.name !== 'NoSuchKey' && e?.$metadata?.httpStatusCode !== 404) throw err
    }
    if (!existing || existing.eventId === eventId) return candidate
  }
  return `${desired} ${eventId.slice(0, 8)}`
}

function ruleId(eventId: string): string {
  return `pb-${eventId}`
}

async function readRules(s3: S3Client, bucket: string): Promise<LifecycleRule[]> {
  try {
    const res = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
    return res.Rules ?? []
  } catch (err) {
    if (isMissingLifecycle(err)) return []
    throw err
  }
}

function isMissingLifecycle(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  return (
    e?.name === 'NoSuchLifecycleConfiguration' ||
    e?.Code === 'NoSuchLifecycleConfiguration' ||
    e?.$metadata?.httpStatusCode === 404
  )
}

/**
 * Makes the event's folder expire `days` days after upload, or removes the rule
 * when `days` is null (kept indefinitely). The lifecycle API replaces the whole
 * configuration, so other events' rules are read back and kept. A rule is
 * identified by the event, so calling this again with a different folder moves it.
 */
export async function applyRetention(
  s3: S3Client,
  bucket: string,
  eventId: string,
  folder: string,
  days: number | null
): Promise<void> {
  const id = ruleId(eventId)
  const rules = await readRules(s3, bucket)
  const others = rules.filter((r) => r.ID !== id)
  const hadRule = others.length !== rules.length
  if (days === null && !hadRule) return

  const next: LifecycleRule[] = [...others]
  if (days !== null) {
    next.push({ ID: id, Status: 'Enabled', Filter: { Prefix: folderPrefix(folder) }, Expiration: { Days: days } })
  }
  if (next.length === 0) {
    await s3.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }))
  } else {
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: next } })
    )
  }
}

export interface ConnectionResult {
  ok: boolean
  /** set when uploads work but something optional (auto-delete timing) won't */
  warning?: string
  error?: string
}

/** Writes and removes a tiny file to prove the keys work, then checks the key may manage auto-delete. */
export async function testConnection(s3: S3Client, bucket: string): Promise<ConnectionResult> {
  try {
    const key = '.photobooth-connection-test'
    await put(s3, bucket, key, 'ok', 'text/plain', NO_CACHE)
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
  try {
    await readRules(s3, bucket)
  } catch (err) {
    return {
      ok: true,
      warning:
        'Uploads work, but this key can’t manage the bucket’s auto-delete rules, so the “keep online for” ' +
        'setting won’t take effect. Create the key with Admin Read & Write permission to enable it. ' +
        `(${describeError(err)})`
    }
  }
  return { ok: true }
}

export function describeError(err: unknown): string {
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
  const status = e?.$metadata?.httpStatusCode
  if (e?.name === 'NoSuchBucket') return 'That bucket name wasn’t found in this Cloudflare account.'
  if (e?.name === 'InvalidAccessKeyId' || e?.name === 'SignatureDoesNotMatch') {
    return 'Cloudflare rejected the access keys — check the Access Key ID and Secret Access Key.'
  }
  if (e?.name === 'AccessDenied' || status === 403) {
    return 'Cloudflare said access was denied — the key needs permission for this bucket.'
  }
  return `${e?.name ?? 'Error'}${status ? ` (${status})` : ''}: ${e?.message ?? String(err)}`
}
