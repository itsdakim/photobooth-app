import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { IconCalendar, IconChevronRight, IconLayout, IconSliders } from '../components/Icon'
import { DoodleFlower, DoodleHeart, DoodleSparkle, DoodleSquiggle } from '../components/Doodles'

export default function HomeScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const settings = useAppStore((s) => s.settings)
  const [cameraReady, setCameraReady] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setCameraReady(devices.some((d) => d.kind === 'videoinput')))
      .catch(() => setCameraReady(false))
  }, [])

  const printerReady = Boolean(settings.selectedPrinterName)

  return (
    <div className="screen home">
      <DoodleSparkle size={34} style={{ top: 30, left: '47%' }} />
      <DoodleSquiggle size={52} style={{ top: 34, left: 'calc(47% + 48px)', transform: 'rotate(-8deg)' }} />
      <DoodleHeart size={34} style={{ bottom: 44, right: 150, transform: 'rotate(10deg)' }} />
      <DoodleFlower size={62} style={{ bottom: 34, right: 64 }} />
      <div className="home-topbar">
        <div className={`home-brand ${settings.businessName ? '' : 'placeholder'}`}>
          {settings.businessName || 'Photobooth Name'}
        </div>
        <button className="btn primary" onClick={() => setScreen('eventList')}>
          Start Photobooth
          <IconChevronRight size={16} />
        </button>
      </div>

      {activeEvent && (
        <div className="home-active-event">
          <div>
            <div className="eyebrow">Active Event</div>
            <div className="title">{activeEvent.name}</div>
            <div className="subtitle">{new Date(activeEvent.updatedAt).toLocaleDateString()}</div>
          </div>
          <button className="btn secondary" onClick={() => setScreen('attract')}>
            Resume Booth
          </button>
        </div>
      )}

      <div className="home-grid">
        <div className="home-card" onClick={() => setScreen('eventList')}>
          <div>
            <div className="home-card-icon">
              <IconCalendar size={22} strokeWidth={1.6} />
            </div>
            <h2>Events</h2>
            <p>Create a new event or resume one — each keeps its own photos, layout, and branding.</p>
          </div>
          <IconChevronRight size={18} className="chevron" />
        </div>
        <div className="home-stack">
          <div className="home-card" onClick={() => setScreen('templates')}>
            <div>
              <div className="home-card-icon">
                <IconLayout size={22} strokeWidth={1.6} />
              </div>
              <h2>Templates</h2>
              <p>Design photo strip and print layouts — upload artwork, place and resize photo areas.</p>
            </div>
            <IconChevronRight size={18} className="chevron" />
          </div>
          <div className="home-card" onClick={() => setScreen('settings')}>
            <div>
              <div className="home-card-icon">
                <IconSliders size={22} strokeWidth={1.6} />
              </div>
              <h2>Photobooth Setup</h2>
              <p>Business name, printer, camera, and sharing — shared across all events.</p>
            </div>
            <IconChevronRight size={18} className="chevron" />
          </div>
        </div>
      </div>

      <div className="status-row">
        <div className="status-item">
          <span className={`status-dot ${cameraReady ? '' : 'off'}`} />
          <div>
            <div className="caption">Camera</div>
            <div className="value">{cameraReady === null ? 'Checking…' : cameraReady ? 'Ready' : 'Not detected'}</div>
          </div>
        </div>
        <div className="status-item">
          <span className={`status-dot ${printerReady ? '' : 'off'}`} />
          <div>
            <div className="caption">Printer</div>
            <div className="value">{printerReady ? settings.selectedPrinterName : 'Not configured'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
