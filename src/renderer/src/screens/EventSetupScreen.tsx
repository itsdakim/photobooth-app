import { useRef, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import LayoutThumb from '../components/LayoutThumb'
import PrintPreview from '../components/PrintPreview'
import { createBlankLayout } from '../lib/defaultLayouts'
import {
  clampPrintQuantity,
  defaultPrintQuantityForPaperSize,
  eventNameTaken,
  isStripPaperSize,
  uniqueEventName
} from '@shared/types'
import type { PhotoboothEvent } from '@shared/types'
import { IconChevronLeft, IconChevronRight, IconPlus, IconSliders } from '../components/Icon'

const FALLBACK_EVENT: PhotoboothEvent = {
  id: '',
  name: '',
  layoutId: '',
  paperSizeId: '4x6',
  printQuantity: 1,
  countdownSeconds: 5,
  shotsToCapture: 1,
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

  const [event, setEvent] = useState<PhotoboothEvent>(() => {
    const base = editingEvent ?? FALLBACK_EVENT
    // Events saved before "photos to capture" existed won't have it on disk,
    // and the layout it points to may have gained slots since — never let
    // the stored value sit below what the layout actually requires.
    const layoutSlots = layouts.find((l) => l.id === base.layoutId)?.slots.length ?? 1
    const shotsToCapture = Math.max(base.shotsToCapture ?? layoutSlots, layoutSlots)
    return { ...base, shotsToCapture }
  })
  const [saving, setSaving] = useState(false)
  const [nameConflict, setNameConflict] = useState<{ name: string; suggestion: string } | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const selectedLayout = layouts.find((l) => l.id === event.layoutId) ?? layouts[0] ?? null
  const minShots = selectedLayout?.slots.length ?? 1

  function selectLayout(id: string): void {
    const layout = layouts.find((l) => l.id === id)
    if (!layout) return
    setEvent((e) => ({
      ...e,
      layoutId: layout.id,
      paperSizeId: layout.paperSizeId,
      printQuantity: defaultPrintQuantityForPaperSize(layout.paperSizeId),
      shotsToCapture: layout.slots.length
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
    setEvent((e) => ({ ...e, layoutId: blank.id, paperSizeId: blank.paperSizeId, shotsToCapture: blank.slots.length }))
    setEditingLayout(blank, 'eventSetup')
    setScreen('layoutEditor')
  }

  // Every event gets its own folder named after it when a save location is
  // set, so two events can't share a name. On a clash, ask the operator to
  // rename or accept the next free "name 2", "name 3", …
  async function startPhotobooth(): Promise<void> {
    if (!selectedLayout) return
    const name = event.name.trim() || 'Untitled Event'
    const others = (await window.api.listEvents()).filter((e) => e.id !== event.id).map((e) => e.name)
    if (eventNameTaken(name, others)) {
      setNameConflict({ name, suggestion: uniqueEventName(name, others) })
      return
    }
    await saveAndStart(name)
  }

  function renameAfterConflict(): void {
    setNameConflict(null)
    requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  async function useSuggestedName(): Promise<void> {
    if (!nameConflict) return
    const suggestion = nameConflict.suggestion
    setNameConflict(null)
    setEvent((ev) => ({ ...ev, name: suggestion }))
    await saveAndStart(suggestion)
  }

  async function saveAndStart(name: string): Promise<void> {
    if (!selectedLayout) return
    setSaving(true)
    try {
      const finalEvent: PhotoboothEvent = {
        ...event,
        name,
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
                ref={nameInputRef}
                autoFocus
                placeholder="e.g. Smith Wedding"
                value={event.name}
                onChange={(e) => setEvent((ev) => ({ ...ev, name: e.target.value }))}
              />
            </div>

            <div className="panel-section">
              <h3>Layout &amp; Branding</h3>
              <div className="layout-pick-grid">
                {layouts.map((l) => {
                  // Contain-fit within the card's thumb slot so a landscape
                  // layout (e.g. Single Photo Horizontal) scales down to fit
                  // instead of overflowing a height-only sizing.
                  const slotWidth = 100
                  const slotHeight = 100
                  const canvasRatio = l.canvasWidth / l.canvasHeight
                  const slotRatio = slotWidth / slotHeight
                  const thumbHeight = canvasRatio > slotRatio ? slotWidth / canvasRatio : slotHeight
                  return (
                    <div
                      key={l.id}
                      className={`layout-pick-card ${l.id === event.layoutId ? 'selected' : ''}`}
                      onClick={() => selectLayout(l.id)}
                    >
                      <div className="layout-pick-thumb-slot">
                        <LayoutThumb layout={l} displayHeight={thumbHeight} />
                      </div>
                      <span>{l.name}</span>
                    </div>
                  )
                })}
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
                  <button
                    onClick={() =>
                      setEvent((e) => ({
                        ...e,
                        printQuantity: clampPrintQuantity(
                          e.printQuantity - (isStripPaperSize(e.paperSizeId) ? 2 : 1),
                          e.paperSizeId
                        )
                      }))
                    }
                  >
                    −
                  </button>
                  <span>{event.printQuantity}</span>
                  <button
                    onClick={() =>
                      setEvent((e) => ({
                        ...e,
                        printQuantity: clampPrintQuantity(
                          e.printQuantity + (isStripPaperSize(e.paperSizeId) ? 2 : 1),
                          e.paperSizeId
                        )
                      }))
                    }
                  >
                    +
                  </button>
                </div>
                {isStripPaperSize(event.paperSizeId) && (
                  <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                    Strips print two-up and get cut apart, so copies must be even.
                  </p>
                )}
              </div>
              <div className="field">
                <label>Photos to capture</label>
                <div className="qty-stepper">
                  <button
                    onClick={() =>
                      setEvent((e) => ({ ...e, shotsToCapture: Math.max(minShots, e.shotsToCapture - 1) }))
                    }
                  >
                    −
                  </button>
                  <span>{event.shotsToCapture}</span>
                  <button
                    onClick={() => setEvent((e) => ({ ...e, shotsToCapture: Math.min(20, e.shotsToCapture + 1) }))}
                  >
                    +
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                  {minShots === event.shotsToCapture
                    ? `This layout needs exactly ${minShots} photo${minShots > 1 ? 's' : ''}.`
                    : `Guests pick their favorite ${minShots} of ${event.shotsToCapture} shots to fill the layout.`}
                </p>
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
              <PrintPreview layout={selectedLayout} />
            ) : (
              <p>Create a layout to see a preview.</p>
            )}
          </div>
        </div>
      </div>

      {nameConflict && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Name already used</h3>
            <p>
              You already have an event called “{nameConflict.name}”. Each event keeps its photos in its own
              folder, so names need to be different.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={renameAfterConflict}>
                Rename
              </button>
              <button className="btn primary" onClick={useSuggestedName}>
                Save as “{nameConflict.suggestion}”
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
