import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { PAPER_SIZES, PRINT_DPI } from '@shared/types'
import type { LayoutTemplate } from '@shared/types'

export default function SettingsScreen(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const printers = useAppStore((s) => s.printers)
  const setPrinters = useAppStore((s) => s.setPrinters)
  const layouts = useAppStore((s) => s.layouts)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setEditingLayout = useAppStore((s) => s.setEditingLayout)
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

  async function createLayout(): Promise<void> {
    const timestamp = new Date().toISOString()
    const paper = PAPER_SIZES.find((p) => p.id === settings.paperSizeId) ?? PAPER_SIZES[1]
    const newLayout: LayoutTemplate = {
      id: uuid(),
      name: 'New Layout',
      paperSizeId: paper.id,
      canvasWidth: Math.round(paper.widthIn * PRINT_DPI),
      canvasHeight: Math.round(paper.heightIn * PRINT_DPI),
      backgroundColor: '#ffffff',
      backgroundImage: null,
      slots: [
        {
          id: uuid(),
          x: Math.round(0.25 * PRINT_DPI),
          y: Math.round(0.25 * PRINT_DPI),
          width: Math.round((paper.widthIn - 0.5) * PRINT_DPI),
          height: Math.round((paper.heightIn - 1) * PRINT_DPI),
          rotation: 0
        }
      ],
      textElements: [],
      imageElements: [],
      createdAt: timestamp,
      updatedAt: timestamp
    }
    await window.api.saveLayout(newLayout)
    setLayouts(await window.api.listLayouts())
    setEditingLayout(newLayout)
    setScreen('layoutEditor')
  }

  async function editLayout(layout: LayoutTemplate): Promise<void> {
    setEditingLayout(layout)
    setScreen('layoutEditor')
  }

  async function deleteLayoutById(id: string): Promise<void> {
    await window.api.deleteLayout(id)
    setLayouts(await window.api.listLayouts())
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('attract')}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <button className="btn ghost" onClick={() => setScreen('gallery')}>
          🖼 Past Sessions
        </button>
      </div>
      <div className="content">
        <div className="settings-grid">
          <div className="panel-section">
            <h3>Event</h3>
            <div className="field">
              <label>Event Name</label>
              <input value={settings.eventName} onChange={(e) => update('eventName', e.target.value)} />
            </div>
            <div className="field">
              <label>Shots per session (used when a layout defines none)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.shotsPerSession}
                onChange={(e) => update('shotsPerSession', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Countdown seconds</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.countdownSeconds}
                onChange={(e) => update('countdownSeconds', Number(e.target.value))}
              />
            </div>
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
          </div>

          <div className="panel-section">
            <h3>Printing (DNP DS620A / DS-RX1HS)</h3>
            <div className="field">
              <label>Printer</label>
              <select
                value={settings.selectedPrinterName ?? ''}
                onChange={(e) => update('selectedPrinterName', e.target.value || null)}
              >
                <option value="">Select a printer…</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName} {p.isDefault ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default paper size</label>
              <select value={settings.paperSizeId} onChange={(e) => update('paperSizeId', e.target.value)}>
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default print quantity</label>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.defaultPrintQuantity}
                onChange={(e) => update('defaultPrintQuantity', Number(e.target.value))}
              />
            </div>
            <p style={{ fontSize: 12, color: '#9aa0ae' }}>
              Install the official DNP driver for your printer first, then it will appear in this list as a
              normal system printer.
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

          <div className="panel-section" style={{ gridColumn: '1 / -1' }}>
            <h3>Layouts</h3>
            {layouts.map((l) => (
              <div key={l.id} className="layout-manage-row">
                <span>
                  {l.name} — {l.slots.length} photo{l.slots.length > 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn ghost" onClick={() => editLayout(l)}>
                    Edit
                  </button>
                  <button className="btn ghost" onClick={() => deleteLayoutById(l.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <button className="btn secondary" onClick={createLayout}>
              + New Layout
            </button>
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
