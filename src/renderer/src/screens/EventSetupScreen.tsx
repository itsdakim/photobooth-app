import { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import LayoutThumb from '../components/LayoutThumb'
import PrintPreview from '../components/PrintPreview'
import { createBlankLayout } from '../lib/defaultLayouts'
import { defaultPrintQuantityForPaperSize } from '@shared/types'
import type { PhotoboothEvent } from '@shared/types'
import { IconChevronLeft, IconChevronRight, IconPlus, IconSliders } from '../components/Icon'

const FALLBACK_EVENT: PhotoboothEvent = {
  id: '',
  name: '',
  layoutId: '',
  paperSizeId: '4x6',
  printQuantity: 1,
  countdownSeconds: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

export default function EventSetupScreen(): JSX.Element {
  const editingEvent = useAppStore((s) => s.editingEvent)
  const layouts = useAppStore((s) => s.layouts)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setEvents = useAppStore((s) => s.setEvents)
  const setActiveEvent = useAppStore((s) => s.setActiveEvent)
  const setActiveLayout = useAppStore((s) => s.setActiveLayout)
  const setEditingLayout = useAppStore((s) => s.setEditingLayout)
  const setScreen = useAppStore((s) => s.setScreen)

  const [event, setEvent] = useState<PhotoboothEvent>(editingEvent ?? FALLBACK_EVENT)
  const [saving, setSaving] = useState(false)

  const selectedLayout = layouts.find((l) => l.id === event.layoutId) ?? layouts[0] ?? null

  function selectLayout(id: string): void {
    const layout = layouts.find((l) => l.id === id)
    if (!layout) return
    setEvent((e) => ({
      ...e,
      layoutId: layout.id,
      paperSizeId: layout.paperSizeId,
      printQuantity: defaultPrintQuantityForPaperSize(layout.paperSizeId)
    }))
  }

  function customizeSelectedLayout(): void {
    setEditingLayout(selectedLayout, 'eventSetup')
    setScreen('layoutEditor')
  }

  async function createNewLayout(): Promise<void> {
    const blank = createBlankLayout(event.paperSizeId)
    await window.api.saveLayout(blank)
    setLayouts(await window.api.listLayouts())
    setEvent((e) => ({ ...e, layoutId: blank.id, paperSizeId: blank.paperSizeId }))
    setEditingLayout(blank, 'eventSetup')
    setScreen('layoutEditor')
  }

  async function startPhotobooth(): Promise<void> {
    if (!selectedLayout) return
    setSaving(true)
    try {
      const finalEvent: PhotoboothEvent = {
        ...event,
        name: event.name.trim() || 'Untitled Event',
        layoutId: selectedLayout.id,
        paperSizeId: selectedLayout.paperSizeId,
        updatedAt: new Date().toISOString()
      }
      await window.api.saveEvent(finalEvent)
      setEvents(await window.api.listEvents())
      setActiveEvent(finalEvent)
      setActiveLayout(selectedLayout)
      setScreen('attract')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={() => setScreen('eventList')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Event Setup</h2>
        <button className="btn primary" disabled={!selectedLayout || saving} onClick={startPhotobooth}>
          {saving ? 'Saving…' : 'Start Photobooth'}
          {!saving && <IconChevronRight size={16} />}
        </button>
      </div>
      <div className="content">
        <div className="event-setup-layout">
          <div className="side-panel">
            <div className="panel-section">
              <h3>Event Name</h3>
              <input
                autoFocus
                placeholder="e.g. Smith Wedding"
                value={event.name}
                onChange={(e) => setEvent((ev) => ({ ...ev, name: e.target.value }))}
              />
            </div>

            <div className="panel-section">
              <h3>Layout &amp; Branding</h3>
              <div className="layout-pick-grid">
                {layouts.map((l) => (
                  <div
                    key={l.id}
                    className={`layout-pick-card ${l.id === event.layoutId ? 'selected' : ''}`}
                    onClick={() => selectLayout(l.id)}
                  >
                    <LayoutThumb layout={l} displayHeight={110} />
                    <span>{l.name}</span>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn secondary" disabled={!selectedLayout} onClick={customizeSelectedLayout}>
                  <IconSliders size={15} />
                  Customize Selected
                </button>
                <button className="btn secondary" onClick={createNewLayout}>
                  <IconPlus size={15} />
                  New Layout
                </button>
              </div>
            </div>

            <div className="panel-section">
              <h3>Booth Defaults</h3>
              <div className="field">
                <label>Default print copies</label>
                <div className="qty-stepper">
                  <button onClick={() => setEvent((e) => ({ ...e, printQuantity: Math.max(1, e.printQuantity - 1) }))}>
                    −
                  </button>
                  <span>{event.printQuantity}</span>
                  <button onClick={() => setEvent((e) => ({ ...e, printQuantity: Math.min(20, e.printQuantity + 1) }))}>
                    +
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Countdown seconds</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={event.countdownSeconds}
                  onChange={(e) =>
                    setEvent((ev) => ({ ...ev, countdownSeconds: Number(e.target.value) }))
                  }
                />
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                Printer and camera are configured once in Photobooth Setup and shared across all events.
              </p>
            </div>
          </div>

          <div className="preview-column">
            <h3>Print Preview</h3>
            {selectedLayout ? (
              <PrintPreview layout={selectedLayout} height={480} />
            ) : (
              <p>Create a layout to see a preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
