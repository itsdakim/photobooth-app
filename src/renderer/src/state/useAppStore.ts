import { create } from 'zustand'
import type { AppSettings, LayoutTemplate, PrinterInfo } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export type Screen =
  | 'attract'
  | 'layoutSelect'
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
  activeLayout: LayoutTemplate | null
  editingLayout: LayoutTemplate | null
  /** data URLs of raw captured photos for the in-progress session */
  capturedPhotos: string[]
  /** the final composed print-ready image as a data URL */
  composedImage: string | null
  currentSessionId: string | null

  setScreen: (screen: Screen) => void
  setSettings: (settings: AppSettings) => void
  setLayouts: (layouts: LayoutTemplate[]) => void
  setPrinters: (printers: PrinterInfo[]) => void
  setActiveLayout: (layout: LayoutTemplate | null) => void
  setEditingLayout: (layout: LayoutTemplate | null) => void
  addCapturedPhoto: (dataUrl: string) => void
  resetCapturedPhotos: () => void
  setComposedImage: (dataUrl: string | null) => void
  setCurrentSessionId: (id: string | null) => void
  resetSession: () => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'attract',
  settings: DEFAULT_SETTINGS,
  layouts: [],
  printers: [],
  activeLayout: null,
  editingLayout: null,
  capturedPhotos: [],
  composedImage: null,
  currentSessionId: null,

  setScreen: (screen) => set({ screen }),
  setSettings: (settings) => set({ settings }),
  setLayouts: (layouts) => set({ layouts }),
  setPrinters: (printers) => set({ printers }),
  setActiveLayout: (activeLayout) => set({ activeLayout }),
  setEditingLayout: (editingLayout) => set({ editingLayout }),
  addCapturedPhoto: (dataUrl) =>
    set((s) => ({ capturedPhotos: [...s.capturedPhotos, dataUrl] })),
  resetCapturedPhotos: () => set({ capturedPhotos: [] }),
  setComposedImage: (composedImage) => set({ composedImage }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  resetSession: () =>
    set({
      capturedPhotos: [],
      composedImage: null,
      currentSessionId: null,
      activeLayout: null
    })
}))
