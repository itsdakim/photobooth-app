import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AppSettings, LayoutTemplate, PhotoboothEvent, PhotoboothSession } from '@shared/types'
import { DEFAULT_CLOUD_SETTINGS, DEFAULT_SETTINGS, safeFolderName } from '@shared/types'

function dataRoot(): string {
  return app.getPath('userData')
}

export function layoutsDir(): string {
  return path.join(dataRoot(), 'layouts')
}

export function eventsDir(): string {
  return path.join(dataRoot(), 'events')
}

export function assetsDir(): string {
  return path.join(dataRoot(), 'assets')
}

const settingsFile = (): string => path.join(dataRoot(), 'settings.json')

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function initStorage(): Promise<void> {
  await ensureDir(layoutsDir())
  await ensureDir(eventsDir())
  await ensureDir(assetsDir())
  try {
    await fs.access(settingsFile())
  } catch {
    await fs.writeFile(settingsFile(), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  }
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsFile(), 'utf-8')
    const saved = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...saved, cloud: { ...DEFAULT_CLOUD_SETTINGS, ...saved.cloud } }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function listLayouts(): Promise<LayoutTemplate[]> {
  const dir = layoutsDir()
  const files = await fs.readdir(dir).catch(() => [])
  const layouts: LayoutTemplate[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      layouts.push(JSON.parse(raw))
    } catch {
      // skip corrupt file
    }
  }
  layouts.sort((a, b) => a.name.localeCompare(b.name))
  return layouts
}

export async function saveLayout(layout: LayoutTemplate): Promise<void> {
  await ensureDir(layoutsDir())
  await fs.writeFile(path.join(layoutsDir(), `${layout.id}.json`), JSON.stringify(layout, null, 2), 'utf-8')
}

export async function deleteLayout(id: string): Promise<void> {
  await fs.rm(path.join(layoutsDir(), `${id}.json`), { force: true })
}

// ---- Events ----
// Each event owns a folder (events/<eventId>/) that holds its metadata plus
// every guest session's photos underneath it, so a whole gig's output stays
// together on disk.

export function eventDir(eventId: string): string {
  return path.join(eventsDir(), eventId)
}

export function eventFile(eventId: string): string {
  return path.join(eventDir(eventId), 'event.json')
}

export async function listEvents(): Promise<PhotoboothEvent[]> {
  const dir = eventsDir()
  const ids = await fs.readdir(dir).catch(() => [])
  const events: PhotoboothEvent[] = []
  for (const id of ids) {
    try {
      const raw = await fs.readFile(eventFile(id), 'utf-8')
      events.push(JSON.parse(raw))
    } catch {
      // skip corrupt/non-event entries
    }
  }
  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return events
}

export async function saveEvent(event: PhotoboothEvent): Promise<void> {
  await ensureDir(eventDir(event.id))
  await fs.writeFile(eventFile(event.id), JSON.stringify(event, null, 2), 'utf-8')
}

export async function deleteEvent(id: string): Promise<void> {
  await fs.rm(eventDir(id), { recursive: true, force: true })
}

// ---- Sessions (nested under their event) ----
// Session metadata lives in sessions/, but the actual photo media is split
// into three sibling folders so a photographer browsing the event folder in
// Finder/Explorer can go straight to what they want.

export function eventSessionsDir(eventId: string): string {
  return path.join(eventDir(eventId), 'sessions')
}

export function eventCompletedDir(eventId: string): string {
  return path.join(eventDir(eventId), 'Completed Photos')
}

export function eventIndividualDir(eventId: string): string {
  return path.join(eventDir(eventId), 'Individual Photos')
}

export function eventGifsDir(eventId: string): string {
  return path.join(eventDir(eventId), 'GIFs')
}

// ---- Optional export folder ----
// When the operator picks a save location in Photobooth Setup, every finished
// photo and GIF is also copied to <folder>/<event name>/Photos or /GIFs, so the
// files are easy to find on disk without opening the app. This is best-effort:
// a missing/unwritable folder must never break a guest's session.

const exportStamps = new Map<string, string>()

/** The time-stamped name a session's files share everywhere they're copied — the
 *  save location and the online bucket — fixed by the session's first saved file. */
export function exportStamp(sessionId: string): string {
  let stamp = exportStamps.get(sessionId)
  if (!stamp) {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
    exportStamps.set(sessionId, stamp)
  }
  return stamp
}

export async function copyToExportFolder(
  eventId: string,
  sessionId: string,
  subfolder: 'Photos' | 'Individual Photos' | 'GIFs' | 'QR Codes',
  suffix: string,
  extension: string,
  buffer: Buffer
): Promise<void> {
  try {
    // Set even without a save location, so online uploads can reuse the same name.
    const stamp = exportStamp(sessionId)
    const { exportFolder } = await readSettings()
    if (!exportFolder) return
    const event = JSON.parse(await fs.readFile(eventFile(eventId), 'utf-8')) as PhotoboothEvent
    const dir = path.join(exportFolder, safeFolderName(event.name), subfolder)
    await ensureDir(dir)
    await fs.writeFile(path.join(dir, `${stamp}${suffix}.${extension}`), buffer)
  } catch (err) {
    console.warn('Could not copy to the export folder:', err)
  }
}

export async function saveComposedPhoto(eventId: string, sessionId: string, buffer: Buffer): Promise<string> {
  await ensureDir(eventCompletedDir(eventId))
  const filePath = path.join(eventCompletedDir(eventId), `${sessionId}.png`)
  await fs.writeFile(filePath, buffer)
  await copyToExportFolder(eventId, sessionId, 'Photos', '', 'png', buffer)
  return filePath
}

export async function saveRawPhoto(
  eventId: string,
  sessionId: string,
  index: number,
  buffer: Buffer
): Promise<string> {
  const dir = path.join(eventIndividualDir(eventId), sessionId)
  await ensureDir(dir)
  const filePath = path.join(dir, `photo_${index}.jpg`)
  await fs.writeFile(filePath, buffer)
  await copyToExportFolder(eventId, sessionId, 'Individual Photos', `_${index}`, 'jpg', buffer)
  return filePath
}

export async function saveGif(eventId: string, sessionId: string, buffer: Buffer): Promise<string> {
  await ensureDir(eventGifsDir(eventId))
  const filePath = path.join(eventGifsDir(eventId), `${sessionId}.gif`)
  await fs.writeFile(filePath, buffer)
  await copyToExportFolder(eventId, sessionId, 'GIFs', '', 'gif', buffer)
  return filePath
}

/** Removes just the GIF for a session, leaving its photos in place. */
export async function deleteGif(eventId: string, sessionId: string): Promise<void> {
  await fs.rm(path.join(eventGifsDir(eventId), `${sessionId}.gif`), { force: true })
}

export async function listSessions(eventId: string): Promise<PhotoboothSession[]> {
  const dir = eventSessionsDir(eventId)
  const files = await fs.readdir(dir).catch(() => [])
  const sessions: PhotoboothSession[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      const session = JSON.parse(raw) as PhotoboothSession
      // The GIF is written after the session record, so look for it on disk.
      const gifPath = path.join(eventGifsDir(eventId), `${session.id}.gif`)
      session.gifPath = (await fs.access(gifPath).then(() => true).catch(() => false)) ? gifPath : null
      sessions.push(session)
    } catch {
      // skip corrupt file
    }
  }
  sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return sessions
}

export async function saveSession(session: PhotoboothSession): Promise<void> {
  await ensureDir(eventSessionsDir(session.eventId))
  await fs.writeFile(
    path.join(eventSessionsDir(session.eventId), `${session.id}.json`),
    JSON.stringify(session, null, 2),
    'utf-8'
  )
}

export async function deleteSession(eventId: string, sessionId: string): Promise<void> {
  await fs.rm(path.join(eventSessionsDir(eventId), `${sessionId}.json`), { force: true })
  await fs.rm(path.join(eventCompletedDir(eventId), `${sessionId}.png`), { force: true })
  await fs.rm(path.join(eventIndividualDir(eventId), sessionId), { recursive: true, force: true })
  await fs.rm(path.join(eventGifsDir(eventId), `${sessionId}.gif`), { force: true })
}

export async function copyAsset(sourcePath: string, filename: string): Promise<string> {
  await ensureDir(assetsDir())
  const dest = path.join(assetsDir(), filename)
  await fs.copyFile(sourcePath, dest)
  return dest
}
