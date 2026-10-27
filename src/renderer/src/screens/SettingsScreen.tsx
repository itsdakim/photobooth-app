import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { PAPER_SIZES } from '@shared/types'
import { IconChevronLeft } from '../components/Icon'

export default function SettingsScreen(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const printers = useAppStore((s) => s.printers)
  const setPrinters = useAppStore((s) => s.setPrinters)
  const setScreen = useAppStore((s) => s.setScreen)

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setCameras(devices.filter((d) => d.kind === 'videoinput')))
      .catch(() => setCameras([]))
    window.api.listPrinters().then(setPrinters)
  }, [setPrinters])

  async function persist(next = settings): Promise<void> {
    await window.api.setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void {
    const next = { ...settings, [key]: value }
    setSettings(next)
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={() => setScreen('home')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Photobooth Setup</h2>
        <div style={{ width: 36 }} />
      </div>
      <div className="content">
        <div className="settings-grid">
          <div className="panel-section">
            <h3>Business</h3>
            <div className="field">
              <label>Business Name</label>
              <input
                placeholder="Photobooth Name"
                value={settings.businessName}
                onChange={(e) => update('businessName', e.target.value)}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Shown on the Home screen.
            </p>
          </div>

          <div className="panel-section">
            <h3>Camera &amp; Booth Defaults</h3>
            <div className="field">
              <label>Camera</label>
              <select
                value={settings.cameraDeviceId ?? ''}
                onChange={(e) => update('cameraDeviceId', e.target.value || null)}
              >
                <option value="">System Default</option>
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || 'Camera'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default countdown seconds (for new events)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.countdownSeconds}
                onChange={(e) => update('countdownSeconds', Number(e.target.value))}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Print copies default to 2 for photo strips and 1 for every other format, set automatically
              per event based on the chosen layout.
            </p>
          </div>

          <div className="panel-section">
            <h3>Printing (DNP DS620A / DS-RX1HS)</h3>
            <div className="field">
              <label>Printer</label>
              <select
                value={settings.selectedPrinterName ?? ''}
                onChange={(e) => update('selectedPrinterName', e.target.value || null)}
              >
                <option value="">Select a printer...</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName} {p.isDefault ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default paper size (for new layouts)</label>
              <select value={settings.paperSizeId} onChange={(e) => update('paperSizeId', e.target.value)}>
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Install the official DNP driver for your printer first, then it will appear in this list as
              a normal system printer.
            </p>
          </div>

          <div className="panel-section">
            <h3>Sharing</h3>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={settings.shareServerEnabled}
                  onChange={(e) => update('shareServerEnabled', e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Enable local QR sharing (same wifi network)
              </label>
            </div>
            <div className="field">
              <label>Share server port</label>
              <input
                type="number"
                value={settings.shareServerPort}
                onChange={(e) => update('shareServerPort', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn primary" onClick={() => persist()}>
            Save Settings
          </button>
          {saved && <span className="status-msg success">Saved!</span>}
        </div>
      </div>
    </div>
  )
}
