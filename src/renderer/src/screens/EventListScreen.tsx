import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { DEFAULT_KEEP_ONLINE_DAYS, defaultPrintQuantityForPaperSize } from '@shared/types'
import type { PhotoboothEvent } from '@shared/types'
import { IconChevronLeft, IconEdit, IconImage, IconPlay, IconPlus, IconTrash } from '../components/Icon'

export default function EventListScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const events = useAppStore((s) => s.events)
  const setEvents = useAppStore((s) => s.setEvents)
  const layouts = useAppStore((s) => s.layouts)
  const setActiveEvent = useAppStore((s) => s.setActiveEvent)
  const setActiveLayout = useAppStore((s) => s.setActiveLayout)
  const setEditingEvent = useAppStore((s) => s.setEditingEvent)
  const setViewingEventId = useAppStore((s) => s.setViewingEventId)
  const settings = useAppStore((s) => s.settings)

  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    window.api.listEvents().then(setEvents)
  }, [setEvents])

  useEffect(() => {
    Promise.all(events.map((e) => window.api.listSessions(e.id).then((s) => [e.id, s.length] as const))).then(
      (pairs) => setSessionCounts(Object.fromEntries(pairs))
    )
  }, [events])

  function createNewEvent(): void {
    const defaultLayout = layouts[0]
    const paperSizeId = defaultLayout?.paperSizeId ?? settings.paperSizeId
    const draft: PhotoboothEvent = {
      id: uuid(),
      name: '',
      layoutId: defaultLayout?.id ?? '',
      layoutIds: defaultLayout ? [defaultLayout.id] : [],
      paperSizeId,
      printQuantity: defaultPrintQuantityForPaperSize(paperSizeId),
      countdownSeconds: settings.countdownSeconds,
      shotsToCapture: defaultLayout?.slots.length ?? 1,
      keepOnlineDays: DEFAULT_KEEP_ONLINE_DAYS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setEditingEvent(draft)
    setScreen('eventSetup')
  }

  function editEvent(event: PhotoboothEvent): void {
    setEditingEvent(event)
    setScreen('eventSetup')
  }

  function startBooth(event: PhotoboothEvent): void {
    const layout = layouts.find((l) => l.id === event.layoutId)
    setActiveEvent(event)
    setActiveLayout(layout ?? null)
    setScreen('attract')
  }

  function viewPhotos(event: PhotoboothEvent): void {
    setViewingEventId(event.id)
    setScreen('gallery')
  }

  async function removeEvent(id: string): Promise<void> {
    await window.api.deleteEvent(id)
    setEvents(await window.api.listEvents())
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={() => setScreen('home')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Events</h2>
        <button className="btn primary" onClick={createNewEvent}>
          <IconPlus size={16} />
          New Event
        </button>
      </div>
      <div className="content">
        {events.length === 0 && <p>No events yet. Create one to start a photobooth session.</p>}
        <div className="event-list">
          {events.map((e) => (
            <div key={e.id} className="event-row">
              <div className="event-row-main">
                <strong>{e.name || '(untitled event)'}</strong>
                <span className="event-row-meta">
                  {new Date(e.createdAt).toLocaleDateString()} · {sessionCounts[e.id] ?? 0} session
                  {(sessionCounts[e.id] ?? 0) === 1 ? '' : 's'}
                </span>
              </div>
              <div className="event-row-actions">
                <button className="btn primary" onClick={() => startBooth(e)}>
                  <IconPlay size={16} />
                  Start Booth
                </button>
                <button className="btn ghost" onClick={() => viewPhotos(e)}>
                  <IconImage size={16} />
                  Photos
                </button>
                <button className="btn ghost" onClick={() => editEvent(e)}>
                  <IconEdit size={16} />
                  Edit
                </button>
                <button className="btn ghost icon-btn" onClick={() => removeEvent(e.id)}>
                  <IconTrash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
