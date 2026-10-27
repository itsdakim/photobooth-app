import { create } from 'zustand'
import type { AppSettings, LayoutTemplate, PhotoboothEvent, PrinterInfo } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export type Screen =
  | 'home'
  | 'eventList'
  | 'eventSetup'
  | 'attract'
  | 'capture'
  | 'photoSelection'
  | 'review'
  | 'output'
  | 'settings'
  | 'templates'
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
  /** data URLs of raw captured photos for the in-progress session, in
   *  capture order — may be more than the layout has slots for */
  capturedPhotos: string[]
  /** data URLs finalized for composition, one per layout slot in slot order.
   *  Set directly from capturedPhotos when the counts match, or by the
   *  guest via the Photo Selection screen when there are extra shots. */
  slotPhotos: string[] | null
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
  setSlotPhotos: (photos: string[] | null) => void
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
  layoutEditorReturnScreen: 'templates',
  capturedPhotos: [],
  slotPhotos: null,
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
  setSlotPhotos: (slotPhotos) => set({ slotPhotos }),
  setComposedImage: (composedImage) => set({ composedImage }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  resetSession: () =>
    set({
      capturedPhotos: [],
      slotPhotos: null,
      composedImage: null,
      currentSessionId: null
    })
}))
