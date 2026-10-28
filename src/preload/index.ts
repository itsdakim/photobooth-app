import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  LayoutTemplate,
  PhotoboothEvent,
  PhotoboothSession,
  PrintJobOptions
} from '@shared/types'

const api = {
  init: (): Promise<boolean> => ipcRenderer.invoke('app:init'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AppSettings): Promise<boolean> =>
    ipcRenderer.invoke('settings:set', settings),

  listLayouts: (): Promise<LayoutTemplate[]> => ipcRenderer.invoke('layouts:list'),
  saveLayout: (layout: LayoutTemplate): Promise<boolean> =>
    ipcRenderer.invoke('layouts:save', layout),
  deleteLayout: (id: string): Promise<boolean> => ipcRenderer.invoke('layouts:delete', id),

  pickImage: (): Promise<string | null> => ipcRenderer.invoke('assets:pickImage'),

  listEvents: (): Promise<PhotoboothEvent[]> => ipcRenderer.invoke('events:list'),
  saveEvent: (event: PhotoboothEvent): Promise<boolean> => ipcRenderer.invoke('events:save', event),
  deleteEvent: (id: string): Promise<boolean> => ipcRenderer.invoke('events:delete', id),

  listSessions: (eventId: string): Promise<PhotoboothSession[]> =>
    ipcRenderer.invoke('sessions:list', eventId),
  saveSession: (session: PhotoboothSession): Promise<boolean> =>
    ipcRenderer.invoke('sessions:save', session),
  deleteSession: (eventId: string, sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('sessions:delete', eventId, sessionId),
  saveRawPhoto: (eventId: string, sessionId: string, index: number, dataUrl: string): Promise<string> =>
    ipcRenderer.invoke('sessions:saveRawPhoto', eventId, sessionId, index, dataUrl),
  saveComposedPhoto: (eventId: string, sessionId: string, dataUrl: string): Promise<string> =>
    ipcRenderer.invoke('sessions:saveComposedPhoto', eventId, sessionId, dataUrl),
  saveGif: (eventId: string, sessionId: string, arrayBuffer: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('sessions:saveGif', eventId, sessionId, arrayBuffer),
  deleteGif: (eventId: string, sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('sessions:deleteGif', eventId, sessionId),
  pickExportFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:pickExportFolder'),
  openFolder: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('files:openFolder', folderPath),
  revealInFolder: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('sessions:revealInFolder', filePath),
  exportCopy: (sourcePath: string): Promise<string | null> =>
    ipcRenderer.invoke('sessions:exportCopy', sourcePath),

  listPrinters: (): Promise<import('@shared/types').PrinterInfo[]> =>
    ipcRenderer.invoke('printers:list'),
  printImage: (options: PrintJobOptions): Promise<import('@shared/types').PrintJobResult> =>
    ipcRenderer.invoke('print:image', options),

  startShareServer: (port: number): Promise<string> => ipcRenderer.invoke('share:start', port),
  stopShareServer: (): Promise<boolean> => ipcRenderer.invoke('share:stop')
}

export type PhotoboothApi = typeof api

contextBridge.exposeInMainWorld('api', api)
