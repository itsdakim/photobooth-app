import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  DeleteBucketLifecycleCommand
} from '@aws-sdk/client-s3'
import type { LifecycleRule } from '@aws-sdk/client-s3'
import type { CloudSettings } from '@shared/types'

// Everything that talks to the bucket, kept free of Electron so it can run
// against any S3-compatible endpoint. Bucket layout:
//
//   v.html                                   the guest/album page (shared by all events)
//   events/<eventId>/album.json              the event's list of sessions
//   events/<eventId>/s/<sessionId>/photo.png | animation.gif | thumb.jpg
//
// Everything for an event lives under its own prefix so one lifecycle rule can
// expire the whole event.

export interface AlbumSession {
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
  name: string
  createdAt: string
  /** when the event's files are scheduled to disappear, or null if kept indefinitely */
  expiresAt: string | null
  sessions: AlbumSession[]
}

export interface SessionFiles {
  eventId: string
  sessionId: string
  createdAt: string
  photo: Buffer | null
  gif: Buffer | null
  thumb: Buffer | null
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

export function sessionPageUrl(publicUrl: string, eventId: string, sessionId: string): string {
  return `${normalizePublicUrl(publicUrl)}/v.html?e=${encodeURIComponent(eventId)}&s=${encodeURIComponent(sessionId)}`
}

export function albumPageUrl(publicUrl: string, eventId: string): string {
  return `${normalizePublicUrl(publicUrl)}/v.html?e=${encodeURIComponent(eventId)}`
}

export function eventPrefix(eventId: string): string {
  return `events/${eventId}/`
}

function sessionKey(eventId: string, sessionId: string, file: string): string {
  return `${eventPrefix(eventId)}s/${sessionId}/${file}`
}

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
  const { eventId, sessionId } = files
  const entry: AlbumSession = {
    id: sessionId,
    createdAt: files.createdAt,
    photo: null,
    gif: null,
    thumb: null,
    landscape: files.landscape
  }
  if (files.photo) {
    entry.photo = sessionKey(eventId, sessionId, 'photo.png')
    await put(s3, bucket, entry.photo, files.photo, 'image/png', MEDIA_CACHE)
  }
  if (files.thumb) {
    entry.thumb = sessionKey(eventId, sessionId, 'thumb.jpg')
    await put(s3, bucket, entry.thumb, files.thumb, 'image/jpeg', MEDIA_CACHE)
  }
  if (files.gif) {
    entry.gif = sessionKey(eventId, sessionId, 'animation.gif')
    await put(s3, bucket, entry.gif, files.gif, 'image/gif', MEDIA_CACHE)
  }
  return entry
}

export async function putAlbum(s3: S3Client, bucket: string, album: AlbumData): Promise<void> {
  await put(
    s3,
    bucket,
    `${eventPrefix(album.eventId)}album.json`,
    JSON.stringify(album),
    'application/json; charset=utf-8',
    NO_CACHE
  )
}

export async function putViewer(s3: S3Client, bucket: string, html: string): Promise<void> {
  await put(s3, bucket, 'v.html', html, 'text/html; charset=utf-8', NO_CACHE)
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
 * Makes the event's files expire `days` days after upload, or removes the rule
 * when `days` is null (kept indefinitely). The lifecycle API replaces the whole
 * configuration, so other events' rules are read back and kept.
 */
export async function applyRetention(
  s3: S3Client,
  bucket: string,
  eventId: string,
  days: number | null
): Promise<void> {
  const id = ruleId(eventId)
  const rules = await readRules(s3, bucket)
  const others = rules.filter((r) => r.ID !== id)
  const hadRule = others.length !== rules.length
  if (days === null && !hadRule) return

  const next: LifecycleRule[] = [...others]
  if (days !== null) {
    next.push({ ID: id, Status: 'Enabled', Filter: { Prefix: eventPrefix(eventId) }, Expiration: { Days: days } })
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
