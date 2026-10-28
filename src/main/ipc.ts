import { ipcMain, BrowserWindow, dialog, net, shell } from 'electron'
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
  deleteSession,
  saveComposedPhoto,
  saveRawPhoto,
  saveGif,
  deleteGif,
  addPrintCount,
  copyAsset
} from './storage'
import { listPrinters, printImage } from './printer'
import { startShareServer, stopShareServer, getLocalNetworkUrl } from './shareServer'
import {
  albumUrlFor,
  cloudStatus,
  publishSession,
  resumeUploads,
  retryNow,
  syncEvent,
  testCloudConnection
} from './cloud'
import type {
  AppSettings,
  CloudSettings,
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
    // Anything that couldn't upload before (online sharing wasn't set up yet) can go now.
    void resumeUploads()
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
    // Keeps an already-uploaded event's album title and keep-online timing current.
    void syncEvent(event.id)
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
  ipcMain.handle('sessions:delete', async (_e, eventId: string, sessionId: string) => {
    await deleteSession(eventId, sessionId)
    return true
  })

  ipcMain.handle(
    'sessions:saveRawPhoto',
    async (_e, eventId: string, sessionId: string, index: number, dataUrl: string) => {
      const { buffer } = dataUrlToBuffer(dataUrl)
      return saveRawPhoto(eventId, sessionId, index, buffer)
    }
  )

  ipcMain.handle(
    'sessions:saveComposedPhoto',
    async (_e, eventId: string, sessionId: string, dataUrl: string) => {
      const { buffer } = dataUrlToBuffer(dataUrl)
      return saveComposedPhoto(eventId, sessionId, buffer)
    }
  )

  ipcMain.handle(
    'sessions:saveGif',
    async (_e, eventId: string, sessionId: string, arrayBuffer: ArrayBuffer) =>
      saveGif(eventId, sessionId, Buffer.from(arrayBuffer))
  )

  ipcMain.handle('sessions:addPrints', async (_e, eventId: string, sessionId: string, copies: number) => {
    await addPrintCount(eventId, sessionId, copies)
    return true
  })

  ipcMain.handle('sessions:deleteGif', async (_e, eventId: string, sessionId: string) => {
    await deleteGif(eventId, sessionId)
    return true
  })

  // ---- Export folder (where finished photos/GIFs are also copied) ----
  ipcMain.handle('settings:pickExportFolder', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose where to save photos and GIFs',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('files:openFolder', async (_e, folderPath: string) => {
    const error = await shell.openPath(folderPath)
    return error === ''
  })

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

  // ---- Internet check (Home status) ----
  // Being on wifi doesn't mean the internet works, so ask a Cloudflare endpoint.
  ipcMain.handle('net:check', async () => {
    try {
      const request = net.fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' })
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
      const res = await Promise.race([request, timeout])
      return Boolean(res && res.ok)
    } catch {
      return false
    }
  })

  // ---- Online sharing (Cloudflare R2) ----
  ipcMain.handle('cloud:test', async (_e, cfg: CloudSettings) => testCloudConnection(cfg))
  ipcMain.handle('cloud:publishSession', async (_e, eventId: string, sessionId: string) =>
    publishSession(eventId, sessionId)
  )
  ipcMain.handle('cloud:albumUrl', async (_e, eventId: string) => albumUrlFor(eventId))
  ipcMain.handle('cloud:status', async () => cloudStatus())
  ipcMain.handle('cloud:retry', async () => {
    await retryNow()
    return true
  })

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
