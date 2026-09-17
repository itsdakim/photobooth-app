import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AppSettings, LayoutTemplate, PhotoboothSession } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

function dataRoot(): string {
  return app.getPath('userData')
}

export function layoutsDir(): string {
  return path.join(dataRoot(), 'layouts')
}

export function sessionsDir(): string {
  return path.join(dataRoot(), 'sessions')
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
  await ensureDir(sessionsDir())
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

export async function listSessions(): Promise<PhotoboothSession[]> {
  const dir = sessionsDir()
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
  await ensureDir(sessionsDir())
  await fs.writeFile(
    path.join(sessionsDir(), `${session.id}.json`),
    JSON.stringify(session, null, 2),
    'utf-8'
  )
}

export function sessionMediaDir(sessionId: string): string {
  return path.join(sessionsDir(), sessionId)
}

export async function ensureSessionMediaDir(sessionId: string): Promise<string> {
  const dir = sessionMediaDir(sessionId)
  await ensureDir(dir)
  return dir
}

export async function copyAsset(sourcePath: string, filename: string): Promise<string> {
  await ensureDir(assetsDir())
  const dest = path.join(assetsDir(), filename)
  await fs.copyFile(sourcePath, dest)
  return dest
}
