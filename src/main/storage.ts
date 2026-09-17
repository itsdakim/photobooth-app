import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AppSettings, LayoutTemplate, PhotoboothEvent, PhotoboothSession } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
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

function eventDir(eventId: string): string {
  return path.join(eventsDir(), eventId)
}

function eventFile(eventId: string): string {
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

function eventSessionsDir(eventId: string): string {
  return path.join(eventDir(eventId), 'sessions')
}

export function eventSessionMediaDir(eventId: string, sessionId: string): string {
  return path.join(eventSessionsDir(eventId), sessionId)
}

export async function ensureEventSessionMediaDir(eventId: string, sessionId: string): Promise<string> {
  const dir = eventSessionMediaDir(eventId, sessionId)
  await ensureDir(dir)
  return dir
}

export async function listSessions(eventId: string): Promise<PhotoboothSession[]> {
  const dir = eventSessionsDir(eventId)
  const files = await fs.readdir(dir).catch(() => [])
  const sessions: PhotoboothSession[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      sessions.push(JSON.parse(raw))
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

export async function copyAsset(sourcePath: string, filename: string): Promise<string> {
  await ensureDir(assetsDir())
  const dest = path.join(assetsDir(), filename)
  await fs.copyFile(sourcePath, dest)
  return dest
}
