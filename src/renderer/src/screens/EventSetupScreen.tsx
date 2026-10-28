import { useRef, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import LayoutThumb from '../components/LayoutThumb'
import PrintPreview from '../components/PrintPreview'
import { createBlankLayout } from '../lib/defaultLayouts'
import {
  clampPrintQuantity,
  DEFAULT_KEEP_ONLINE_DAYS,
  KEEP_ONLINE_OPTIONS,
  cloudConfigured,
  eventForLayout,
  eventKeepOnlineDays,
  eventLayoutIds,
  eventNameTaken,
  isStripPaperSize,
  uniqueEventName
} from '@shared/types'
import type { LayoutTemplate, PhotoboothEvent } from '@shared/types'
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconSliders } from '../components/Icon'

const FALLBACK_EVENT: PhotoboothEvent = {
  id: '',
  name: '',
  layoutId: '',
  layoutIds: [],
  paperSizeId: '4x6',
  printQuantity: 1,
  countdownSeconds: 5,
  shotsToCapture: 1,
  keepOnlineDays: DEFAULT_KEEP_ONLINE_DAYS,
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
  const setEditingEvent = useAppStore((s) => s.setEditingEvent)
  const setScreen = useAppStore((s) => s.setScreen)
  const cloud = useAppStore((s) => s.settings.cloud)

  const [event, setEvent] = useState<PhotoboothEvent>(() => {
    const base = editingEvent ?? FALLBACK_EVENT
    // Drop templates that have since been deleted; an event always keeps at
    // least one, falling back to its main template or the first available.
    let layoutIds = eventLayoutIds(base).filter((id) => layouts.some((l) => l.id === id))
    if (layoutIds.length === 0 && layouts[0]) layoutIds = [layouts.some((l) => l.id === base.layoutId) ? base.layoutId : layouts[0].id]
    const layoutId = layoutIds.includes(base.layoutId) ? base.layoutId : layoutIds[0] ?? base.layoutId
    // Events saved before "photos to capture" existed won't have it on disk,
    // and the layout it points to may have gained slots since — never let
    // the stored value sit below what the layout actually requires.
    const layoutSlots = layouts.find((l) => l.id === layoutId)?.slots.length ?? 1
    const shotsToCapture = Math.max(base.shotsToCapture ?? layoutSlots, layoutSlots)
    return { ...base, layoutId, layoutIds, shotsToCapture }
  })
  const [saving, setSaving] = useState(false)
  const [nameConflict, setNameConflict] = useState<{ name: string; suggestion: string } | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // selectedLayout is the template shown in the preview (the one last clicked);
  // layoutIds is the set guests can choose from after pressing Start.
  const selectedLayout = layouts.find((l) => l.id === event.layoutId) ?? layouts[0] ?? null
  const offeredIds = event.layoutIds ?? []
  const minShots = selectedLayout?.slots.length ?? 1

  /** Previews `layout` and makes sure guests are offered it. Extra shots and
   *  print copies carry over from the previous template. */
  function focusLayout(e: PhotoboothEvent, layout: LayoutTemplate): PhotoboothEvent {
    const ids = e.layoutIds ?? []
    return {
      ...eventForLayout(e, layouts, layout),
      layoutIds: ids.includes(layout.id) ? ids : [...ids, layout.id]
    }
  }

  function selectLayout(id: string): void {
    const layout = layouts.find((l) => l.id === id)
    if (!layout) return
    setEvent((e) => focusLayout(e, layout))
  }

  // The tick toggles whether guests are offered a template. At least one stays
  // selected, and unticking the previewed one moves the preview to another.
  function toggleLayout(id: string): void {
    const layout = layouts.find((l) => l.id === id)
    if (!layout) return
    setEvent((e) => {
      const ids = e.layoutIds ?? []
      if (!ids.includes(id)) return focusLayout(e, layout)
      if (ids.length <= 1) return e
      const remaining = ids.filter((x) => x !== id)
      const next = { ...e, layoutIds: remaining }
      if (e.layoutId !== id) return next
      const fallback = layouts.find((l) => l.id === remaining[0])
      return fallback ? { ...eventForLayout(next, layouts, fallback), layoutIds: remaining } : next
    })
  }

  // The editor is a separate screen, so park the draft in the store first —
  // otherwise coming back would rebuild the form from the last saved event.
  function customizeSelectedLayout(): void {
    setEditingEvent(event)
    setEditingLayout(selectedLayout, 'eventSetup')
    setScreen('layoutEditor')
  }

  async function createNewLayout(): Promise<void> {
    const blank = createBlankLayout(event.paperSizeId)
    await window.api.saveLayout(blank)
    setLayouts(await window.api.listLayouts())
    const ids = event.layoutIds ?? []
    setEditingEvent({
      ...eventForLayout(event, layouts, blank),
      layoutIds: ids.includes(blank.id) ? ids : [...ids, blank.id]
    })
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
        layoutIds: offeredIds.includes(selectedLayout.id) ? offeredIds : [selectedLayout.id, ...offeredIds],
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
              <p className="layout-pick-hint">
                Tick every template guests can choose from after pressing Start. Click a template to preview it.
                {offeredIds.length > 1 ? ` ${offeredIds.length} selected.` : ''}
              </p>
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
                  const offered = offeredIds.includes(l.id)
                  return (
                    <div
                      key={l.id}
                      className={`layout-pick-card ${offered ? 'offered' : ''} ${l.id === selectedLayout?.id ? 'selected' : ''}`}
                      onClick={() => selectLayout(l.id)}
                    >
                      <button
                        type="button"
                        className={`layout-pick-check ${offered ? 'on' : ''}`}
                        role="checkbox"
                        aria-checked={offered}
                        aria-label={`Offer ${l.name} to guests`}
                        title={offered ? 'Offered to guests — click to remove' : 'Click to offer to guests'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLayout(l.id)
                        }}
                      >
                        {offered && <IconCheck size={13} strokeWidth={3} />}
                      </button>
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
                  {offeredIds.length > 1 &&
                    ' Other templates take their own number of photos, plus the same extra shots to choose from.'}
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
              <div className="field">
                <label>Keep photos online for</label>
                <select
                  value={String(eventKeepOnlineDays(event))}
                  disabled={!cloudConfigured(cloud)}
                  onChange={(e) =>
                    setEvent((ev) => ({
                      ...ev,
                      keepOnlineDays: e.target.value === 'null' ? null : Number(e.target.value)
                    }))
                  }
                >
                  {KEEP_ONLINE_OPTIONS.map((o) => (
                    <option key={String(o.days)} value={String(o.days)}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                  {cloudConfigured(cloud)
                    ? 'How long guests can use their QR code link and the event album. After this the online copies are deleted automatically (your saved copies stay).'
                    : 'Turn on Online Sharing in Photobooth Setup to give guests links that last.'}
                </p>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                Printer and camera are configured once in Photobooth Setup and shared across all events.
              </p>
            </div>
          </div>

          <div className="preview-column">
            <h3>Print Preview{offeredIds.length > 1 && selectedLayout ? ` · ${selectedLayout.name}` : ''}</h3>
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
