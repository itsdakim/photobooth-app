import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import type { PhotoboothSession } from '@shared/types'

export default function GalleryScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const viewingEventId = useAppStore((s) => s.viewingEventId)
  const events = useAppStore((s) => s.events)
  const [sessions, setSessions] = useState<PhotoboothSession[]>([])

  const event = events.find((e) => e.id === viewingEventId)

  useEffect(() => {
    if (!viewingEventId) return
    window.api.listSessions(viewingEventId).then(setSessions)
  }, [viewingEventId])

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('eventList')}>
          ← Events
        </button>
        <h2 style={{ margin: 0 }}>{event ? `${event.name} — Photos` : 'Photos'}</h2>
        <div style={{ width: 100 }} />
      </div>
      <div className="content">
        {sessions.length === 0 && <p>No sessions yet for this event.</p>}
        <div className="gallery-grid">
          {sessions.map((s) => (
            <div key={s.id} className="gallery-card">
              {s.composedImagePath && (
                <img
                  src={toFileUrl(s.composedImagePath)}
                  alt={s.eventName}
                  onClick={() => s.composedImagePath && window.api.revealInFolder(s.composedImagePath)}
                  style={{ cursor: 'pointer' }}
                />
              )}
              <div className="meta">
                <div>{new Date(s.createdAt).toLocaleString()}</div>
                <div>Printed: {s.printCount}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
