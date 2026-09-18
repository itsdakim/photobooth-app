import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './state/useAppStore'
import { createDefaultLayouts } from './lib/defaultLayouts'
import HomeScreen from './screens/HomeScreen'
import EventListScreen from './screens/EventListScreen'
import EventSetupScreen from './screens/EventSetupScreen'
import AttractScreen from './screens/AttractScreen'
import CaptureScreen from './screens/CaptureScreen'
import PhotoSelectionScreen from './screens/PhotoSelectionScreen'
import ReviewScreen from './screens/ReviewScreen'
import OutputScreen from './screens/OutputScreen'
import SettingsScreen from './screens/SettingsScreen'
import LayoutEditorScreen from './screens/LayoutEditorScreen'
import GalleryScreen from './screens/GalleryScreen'

export default function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const bootedRef = useRef(false)
  const screen = useAppStore((s) => s.screen)
  const setSettings = useAppStore((s) => s.setSettings)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setPrinters = useAppStore((s) => s.setPrinters)
  const setEvents = useAppStore((s) => s.setEvents)

  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invocation of effects,
    // which would otherwise race two concurrent "seed default layouts" calls.
    if (bootedRef.current) return
    bootedRef.current = true

    async function boot(): Promise<void> {
      await window.api.init()
      const settings = await window.api.getSettings()
      setSettings(settings)

      let layouts = await window.api.listLayouts()
      const existingNames = new Set(layouts.map((l) => l.name))
      const missingDefaults = createDefaultLayouts().filter((l) => !existingNames.has(l.name))
      for (const l of missingDefaults) await window.api.saveLayout(l)
      if (missingDefaults.length > 0) layouts = await window.api.listLayouts()
      setLayouts(layouts)

      const printers = await window.api.listPrinters()
      setPrinters(printers)

      const events = await window.api.listEvents()
      setEvents(events)

      setReady(true)
    }
    boot()
  }, [setSettings, setLayouts, setPrinters, setEvents])

  if (!ready) {
    return (
      <div className="boot-screen">
        <p>Starting Photobooth…</p>
      </div>
    )
  }

  switch (screen) {
    case 'home':
      return <HomeScreen />
    case 'eventList':
      return <EventListScreen />
    case 'eventSetup':
      return <EventSetupScreen />
    case 'attract':
      return <AttractScreen />
    case 'capture':
      return <CaptureScreen />
    case 'photoSelection':
      return <PhotoSelectionScreen />
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
      return <HomeScreen />
  }
}
