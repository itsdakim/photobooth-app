import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import type { PhotoboothSession } from '@shared/types'

export default function GalleryScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const viewingEventId = useAppStore((s) => s.viewingEventId)
  const events = useAppStore((s) => s.events)
  const [sessions, setSessions] = useState<PhotoboothSession[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const event = events.find((e) => e.id === viewingEventId)

  function refresh(): void {
    if (!viewingEventId) return
    window.api.listSessions(viewingEventId).then(setSessions)
  }

  useEffect(refresh, [viewingEventId])

  function toggleSelectMode(): void {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCardClick(s: PhotoboothSession): void {
    if (selectMode) {
      toggleSelected(s.id)
    } else if (s.composedImagePath) {
      window.api.revealInFolder(s.composedImagePath)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!viewingEventId) return
    setDeleting(true)
    try {
      for (const id of selectedIds) {
        await window.api.deleteSession(viewingEventId, id)
      }
      refresh()
      setSelectedIds(new Set())
      setSelectMode(false)
      setConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('eventList')}>
          ← Events
        </button>
        <h2 style={{ margin: 0 }}>{event ? `${event.name} — Photos` : 'Photos'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectMode && selectedIds.size > 0 && (
            <button className="btn primary" onClick={() => setConfirmOpen(true)}>
              🗑 Delete ({selectedIds.size})
            </button>
          )}
          {sessions.length > 0 && (
            <button className="btn ghost" onClick={toggleSelectMode}>
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>
      </div>
      <div className="content">
        {sessions.length === 0 && <p>No sessions yet for this event.</p>}
        <div className="gallery-grid">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`gallery-card ${selectMode && selectedIds.has(s.id) ? 'selected' : ''}`}
              onClick={() => handleCardClick(s)}
            >
              {selectMode && (
                <div className={`gallery-select-badge ${selectedIds.has(s.id) ? 'checked' : ''}`}>
                  {selectedIds.has(s.id) ? '✓' : ''}
                </div>
              )}
              {s.composedImagePath && (
                <img src={toFileUrl(s.composedImagePath)} alt={s.eventName} style={{ cursor: 'pointer' }} />
              )}
              <div className="meta">
                <div>{new Date(s.createdAt).toLocaleString()}</div>
                <div>Printed: {s.printCount}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete {selectedIds.size} photo{selectedIds.size === 1 ? '' : 's'}?</h3>
            <p>This permanently removes the selected photos and any GIFs from this event. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn primary" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
