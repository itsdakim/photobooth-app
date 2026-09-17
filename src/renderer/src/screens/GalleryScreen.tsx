import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import type { PhotoboothSession } from '@shared/types'

export default function GalleryScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const [sessions, setSessions] = useState<PhotoboothSession[]>([])

  useEffect(() => {
    window.api.listSessions().then(setSessions)
  }, [])

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('settings')}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Past Sessions</h2>
        <div style={{ width: 100 }} />
      </div>
      <div className="content">
        {sessions.length === 0 && <p>No sessions yet.</p>}
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
                <div>{s.eventName}</div>
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
