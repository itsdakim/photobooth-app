import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import type { PhotoboothSession } from '@shared/types'
import { IconCheck, IconChevronLeft, IconFilm, IconImage, IconTrash } from '../components/Icon'

type Folder = 'photos' | 'gifs'

const FOLDER_LABEL: Record<Folder, string> = { photos: 'Photos', gifs: 'GIFs' }

export default function GalleryScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const viewingEventId = useAppStore((s) => s.viewingEventId)
  const events = useAppStore((s) => s.events)
  const [sessions, setSessions] = useState<PhotoboothSession[]>([])
  // null = the folder chooser (Photos / GIFs); otherwise the previews for that folder
  const [folder, setFolder] = useState<Folder | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewing, setViewing] = useState<{ src: string; alt: string } | null>(null)

  const event = events.find((e) => e.id === viewingEventId)

  function refresh(): void {
    if (!viewingEventId) return
    window.api.listSessions(viewingEventId).then(setSessions)
  }

  useEffect(refresh, [viewingEventId])

  const photoSessions = sessions.filter((s) => s.composedImagePath)
  const gifSessions = sessions.filter((s) => s.gifPath)
  const shown = folder === 'gifs' ? gifSessions : photoSessions

  // Esc closes the enlarged view.
  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setViewing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing])

  function openFolder(next: Folder): void {
    setFolder(next)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function goBack(): void {
    if (folder) {
      setFolder(null)
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setScreen('eventList')
    }
  }

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
      return
    }
    const path = folder === 'gifs' ? s.gifPath : s.composedImagePath
    if (path) setViewing({ src: toFileUrl(path), alt: `${s.eventName} — ${new Date(s.createdAt).toLocaleString()}` })
  }

  async function confirmDelete(): Promise<void> {
    if (!viewingEventId) return
    setDeleting(true)
    try {
      for (const id of selectedIds) {
        // In the GIFs folder only the GIF goes; deleting a photo removes the whole session.
        if (folder === 'gifs') await window.api.deleteGif(viewingEventId, id)
        else await window.api.deleteSession(viewingEventId, id)
      }
      refresh()
      setSelectedIds(new Set())
      setSelectMode(false)
      setConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  const title = event ? `${event.name}${folder ? ` — ${FOLDER_LABEL[folder]}` : ''}` : 'Photos'
  const noun = folder === 'gifs' ? 'GIF' : 'photo'

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={goBack}>
          <IconChevronLeft size={18} />
        </button>
        <h2>{title}</h2>
        <div style={{ display: 'flex', gap: 8, minWidth: 36 }}>
          {folder && selectMode && selectedIds.size > 0 && (
            <button className="btn primary" onClick={() => setConfirmOpen(true)}>
              <IconTrash size={15} />
              Delete ({selectedIds.size})
            </button>
          )}
          {folder && shown.length > 0 && (
            <button className="btn ghost" onClick={toggleSelectMode}>
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>
      </div>
      <div className="content">
        {folder === null ? (
          <div className="gallery-folders">
            <FolderCard
              label="Photos"
              icon={<IconImage size={20} />}
              sessions={photoSessions}
              pathOf={(s) => s.composedImagePath}
              onOpen={() => openFolder('photos')}
            />
            <FolderCard
              label="GIFs"
              icon={<IconFilm size={20} />}
              sessions={gifSessions}
              pathOf={(s) => s.gifPath}
              onOpen={() => openFolder('gifs')}
            />
          </div>
        ) : (
          <>
            {shown.length === 0 && <p>No {FOLDER_LABEL[folder].toLowerCase()} yet for this event.</p>}
            <div className="gallery-grid">
              {shown.map((s) => {
                const path = folder === 'gifs' ? s.gifPath : s.composedImagePath
                return (
                  <div
                    key={s.id}
                    className={`gallery-card ${selectMode && selectedIds.has(s.id) ? 'selected' : ''}`}
                    onClick={() => handleCardClick(s)}
                  >
                    {selectMode && (
                      <div className={`gallery-select-badge ${selectedIds.has(s.id) ? 'checked' : ''}`}>
                        {selectedIds.has(s.id) && <IconCheck size={12} strokeWidth={3} />}
                      </div>
                    )}
                    {path && <img src={toFileUrl(path)} alt={s.eventName} style={{ cursor: 'pointer' }} />}
                    <div className="meta">
                      <div>{new Date(s.createdAt).toLocaleString()}</div>
                      {folder === 'photos' && <div>Printed: {s.printCount}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {viewing && (
        <div className="lightbox" onClick={() => setViewing(null)}>
          <button
            className="btn icon-btn lightbox-back"
            title="Back to previews"
            onClick={(e) => {
              e.stopPropagation()
              setViewing(null)
            }}
          >
            <IconChevronLeft size={18} />
          </button>
          <img src={viewing.src} alt={viewing.alt} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {confirmOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>
              Delete {selectedIds.size} {noun}
              {selectedIds.size === 1 ? '' : 's'}?
            </h3>
            <p>
              {folder === 'gifs'
                ? 'This permanently removes the selected GIFs. Their photos are kept. This cannot be undone.'
                : 'This permanently removes the selected photos and their GIFs from this event. This cannot be undone.'}
            </p>
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

function FolderCard({
  label,
  icon,
  sessions,
  pathOf,
  onOpen
}: {
  label: string
  icon: JSX.Element
  sessions: PhotoboothSession[]
  pathOf: (s: PhotoboothSession) => string | null
  onOpen: () => void
}): JSX.Element {
  // Sessions arrive newest first; show the two latest as a peek into the folder.
  const previews = sessions.slice(0, 2).map(pathOf).filter((p): p is string => Boolean(p))
  return (
    <button className="gallery-folder" onClick={onOpen}>
      <div className="gallery-folder-preview">
        {previews.length > 0 ? (
          previews.map((p) => <img key={p} src={toFileUrl(p)} alt="" />)
        ) : (
          <>
            {icon} Empty
          </>
        )}
      </div>
      <h3>{label}</h3>
      <div className="count">
        {sessions.length} {sessions.length === 1 ? 'item' : 'items'}
      </div>
    </button>
  )
}
