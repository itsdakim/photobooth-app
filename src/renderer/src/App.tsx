import { useEffect, useState } from 'react'
import { useAppStore } from './state/useAppStore'
import { createDefaultLayouts } from './lib/defaultLayouts'
import AttractScreen from './screens/AttractScreen'
import LayoutSelectScreen from './screens/LayoutSelectScreen'
import CaptureScreen from './screens/CaptureScreen'
import ReviewScreen from './screens/ReviewScreen'
import OutputScreen from './screens/OutputScreen'
import SettingsScreen from './screens/SettingsScreen'
import LayoutEditorScreen from './screens/LayoutEditorScreen'
import GalleryScreen from './screens/GalleryScreen'

export default function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const screen = useAppStore((s) => s.screen)
  const setSettings = useAppStore((s) => s.setSettings)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setPrinters = useAppStore((s) => s.setPrinters)

  useEffect(() => {
    async function boot(): Promise<void> {
      await window.api.init()
      const settings = await window.api.getSettings()
      setSettings(settings)

      let layouts = await window.api.listLayouts()
      if (layouts.length === 0) {
        const defaults = createDefaultLayouts()
        for (const l of defaults) await window.api.saveLayout(l)
        layouts = defaults
      }
      setLayouts(layouts)

      const printers = await window.api.listPrinters()
      setPrinters(printers)

      setReady(true)
    }
    boot()
  }, [setSettings, setLayouts, setPrinters])

  if (!ready) {
    return (
      <div className="boot-screen">
        <p>Starting Photobooth…</p>
      </div>
    )
  }

  switch (screen) {
    case 'attract':
      return <AttractScreen />
    case 'layoutSelect':
      return <LayoutSelectScreen />
    case 'capture':
      return <CaptureScreen />
    case 'review':
      return <ReviewScreen />
    case 'output':
      return <OutputScreen />
    case 'settings':
      return <SettingsScreen />
    case 'layoutEditor':
      return <LayoutEditorScreen />
    case 'gallery':
      return <GalleryScreen />
    default:
      return <AttractScreen />
  }
}
