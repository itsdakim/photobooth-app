import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  initStorage,
  readSettings,
  writeSettings,
  listLayouts,
  saveLayout,
  deleteLayout,
  listEvents,
  saveEvent,
  deleteEvent,
  listSessions,
  saveSession,
  ensureEventSessionMediaDir,
  copyAsset
} from './storage'
import { listPrinters, printImage } from './printer'
import { startShareServer, stopShareServer, getLocalNetworkUrl } from './shareServer'
import type {
  AppSettings,
  LayoutTemplate,
  PhotoboothEvent,
  PhotoboothSession,
  PrintJobOptions
} from '@shared/types'

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Unsupported image data URL')
  const ext = match[1] === 'jpg' ? 'jpeg' : match[1]
  return { buffer: Buffer.from(match[2], 'base64'), ext }
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:init', async () => {
    await initStorage()
    return true
  })

  // ---- Settings ----
  ipcMain.handle('settings:get', async () => readSettings())
  ipcMain.handle('settings:set', async (_e, settings: AppSettings) => {
    await writeSettings(settings)
    return true
  })

  // ---- Layouts ----
  ipcMain.handle('layouts:list', async () => listLayouts())
  ipcMain.handle('layouts:save', async (_e, layout: LayoutTemplate) => {
    await saveLayout(layout)
    return true
  })
  ipcMain.handle('layouts:delete', async (_e, id: string) => {
    await deleteLayout(id)
    return true
  })

  // ---- Assets (background image uploads) ----
  ipcMain.handle('assets:pickImage', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const src = result.filePaths[0]
    const ext = path.extname(src)
    const dest = await copyAsset(src, `${randomUUID()}${ext}`)
    return dest
  })

  // ---- Events ----
  ipcMain.handle('events:list', async () => listEvents())
  ipcMain.handle('events:save', async (_e, event: PhotoboothEvent) => {
    await saveEvent(event)
    return true
  })
  ipcMain.handle('events:delete', async (_e, id: string) => {
    await deleteEvent(id)
    return true
  })

  // ---- Sessions ----
  ipcMain.handle('sessions:list', async (_e, eventId: string) => listSessions(eventId))
  ipcMain.handle('sessions:save', async (_e, session: PhotoboothSession) => {
    await saveSession(session)
    return true
  })

  ipcMain.handle(
    'sessions:savePhoto',
    async (_e, eventId: string, sessionId: string, dataUrl: string, filename: string) => {
      const dir = await ensureEventSessionMediaDir(eventId, sessionId)
      const { buffer } = dataUrlToBuffer(dataUrl)
      const filePath = path.join(dir, filename)
      await fs.writeFile(filePath, buffer)
      return filePath
    }
  )

  ipcMain.handle(
    'sessions:saveGif',
    async (_e, eventId: string, sessionId: string, arrayBuffer: ArrayBuffer, filename: string) => {
      const dir = await ensureEventSessionMediaDir(eventId, sessionId)
      const filePath = path.join(dir, filename)
      await fs.writeFile(filePath, Buffer.from(arrayBuffer))
      return filePath
    }
  )

  ipcMain.handle('sessions:revealInFolder', async (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
    return true
  })

  ipcMain.handle('sessions:exportCopy', async (_e, sourcePath: string) => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: 'Save photo as',
      defaultPath: path.basename(sourcePath)
    })
    if (result.canceled || !result.filePath) return null
    await fs.copyFile(sourcePath, result.filePath)
    return result.filePath
  })

  // ---- Printing ----
  ipcMain.handle('printers:list', async () => {
    const win = getMainWindow()
    if (!win) return []
    return listPrinters(win)
  })

  ipcMain.handle('print:image', async (_e, options: PrintJobOptions) => printImage(options))

  // ---- Sharing (local QR download server) ----
  ipcMain.handle('share:start', async (_e, port: number) => {
    const actualPort = await startShareServer(port)
    return getLocalNetworkUrl(actualPort)
  })
  ipcMain.handle('share:stop', async () => {
    stopShareServer()
    return true
  })
}
