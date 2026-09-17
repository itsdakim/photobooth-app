import { create } from 'zustand'
import type { AppSettings, LayoutTemplate, PhotoboothEvent, PrinterInfo } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export type Screen =
  | 'home'
  | 'eventList'
  | 'eventSetup'
  | 'attract'
  | 'capture'
  | 'review'
  | 'output'
  | 'settings'
  | 'layoutEditor'
  | 'gallery'

interface AppState {
  screen: Screen
  settings: AppSettings
  layouts: LayoutTemplate[]
  printers: PrinterInfo[]
  events: PhotoboothEvent[]
  activeEvent: PhotoboothEvent | null
  editingEvent: PhotoboothEvent | null
  viewingEventId: string | null
  activeLayout: LayoutTemplate | null
  editingLayout: LayoutTemplate | null
  /** which screen the layout editor should return to when done */
  layoutEditorReturnScreen: Screen
  /** data URLs of raw captured photos for the in-progress session */
  capturedPhotos: string[]
  /** the final composed print-ready image as a data URL */
  composedImage: string | null
  currentSessionId: string | null

  setScreen: (screen: Screen) => void
  setSettings: (settings: AppSettings) => void
  setLayouts: (layouts: LayoutTemplate[]) => void
  setPrinters: (printers: PrinterInfo[]) => void
  setEvents: (events: PhotoboothEvent[]) => void
  setActiveEvent: (event: PhotoboothEvent | null) => void
  setEditingEvent: (event: PhotoboothEvent | null) => void
  setViewingEventId: (id: string | null) => void
  setActiveLayout: (layout: LayoutTemplate | null) => void
  setEditingLayout: (layout: LayoutTemplate | null, returnScreen?: Screen) => void
  addCapturedPhoto: (dataUrl: string) => void
  resetCapturedPhotos: () => void
  setComposedImage: (dataUrl: string | null) => void
  setCurrentSessionId: (id: string | null) => void
  /** clears only the in-progress capture state; keeps the active event/layout
   *  so the next guest session reuses the same setup */
  resetSession: () => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  settings: DEFAULT_SETTINGS,
  layouts: [],
  printers: [],
  events: [],
  activeEvent: null,
  editingEvent: null,
  viewingEventId: null,
  activeLayout: null,
  editingLayout: null,
  layoutEditorReturnScreen: 'settings',
  capturedPhotos: [],
  composedImage: null,
  currentSessionId: null,

  setScreen: (screen) => set({ screen }),
  setSettings: (settings) => set({ settings }),
  setLayouts: (layouts) => set({ layouts }),
  setPrinters: (printers) => set({ printers }),
  setEvents: (events) => set({ events }),
  setActiveEvent: (activeEvent) => set({ activeEvent }),
  setEditingEvent: (editingEvent) => set({ editingEvent }),
  setViewingEventId: (viewingEventId) => set({ viewingEventId }),
  setActiveLayout: (activeLayout) => set({ activeLayout }),
  setEditingLayout: (editingLayout, returnScreen) =>
    set((s) => ({ editingLayout, layoutEditorReturnScreen: returnScreen ?? s.layoutEditorReturnScreen })),
  addCapturedPhoto: (dataUrl) =>
    set((s) => ({ capturedPhotos: [...s.capturedPhotos, dataUrl] })),
  resetCapturedPhotos: () => set({ capturedPhotos: [] }),
  setComposedImage: (composedImage) => set({ composedImage }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  resetSession: () =>
    set({
      capturedPhotos: [],
      composedImage: null,
      currentSessionId: null
    })
}))
