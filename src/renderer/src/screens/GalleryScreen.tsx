import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import { PRINT_DPI, clampPrintQuantity, isStripPaperSize } from '@shared/types'
import type { CloudStatus, PhotoboothSession } from '@shared/types'
import { IconCheck, IconChevronLeft, IconFilm, IconImage, IconPrint, IconTrash } from '../components/Icon'

type Folder = 'photos' | 'gifs'

const FOLDER_LABEL: Record<Folder, string> = { photos: 'Photos', gifs: 'GIFs' }

// QR codes are drawn once per link and reused as cards re-render.
const qrCache = new Map<string, string>()

/** A guest's QR code for their online page, drawn from the link itself. */
function SessionQr({ url, size }: { url: string; size: number }): JSX.Element | null {
  const [src, setSrc] = useState<string | null>(qrCache.get(url) ?? null)
  useEffect(() => {
    const cached = qrCache.get(url)
    if (cached) {
      setSrc(cached)
      return
    }
    let live = true
    QRCode.toDataURL(url, { width: 360, margin: 1 }).then((dataUrl) => {
      qrCache.set(url, dataUrl)
      if (live) setSrc(dataUrl)
    })
    return () => {
      live = false
    }
  }, [url])
  if (!src) return <div style={{ width: size, height: size }} />
  return <img className="session-qr" src={src} alt="QR code for this guest's photos" width={size} height={size} />
}

/** Natural size of a saved image, for printing a photo whose template was deleted. */
function imageSize(path: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read the photo to print it.'))
    img.src = toFileUrl(path)
  })
}

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
  const [viewing, setViewing] = useState<{ src: string; alt: string; qrUrl: string | null } | null>(null)
  const layouts = useAppStore((s) => s.layouts)
  const printerName = useAppStore((s) => s.settings.selectedPrinterName)

  // Reprinting: one copies count per selected photo.
  const [reprintOpen, setReprintOpen] = useState(false)
  const [copies, setCopies] = useState<Record<string, number>>({})
  const [printing, setPrinting] = useState(false)
  // Photos already sent in this dialog, so retrying after a failure doesn't print them twice.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [reprintResult, setReprintResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const event = events.find((e) => e.id === viewingEventId)

  function refresh(): void {
    if (!viewingEventId) return
    window.api.listSessions(viewingEventId).then(setSessions)
  }

  useEffect(refresh, [viewingEventId])

  // The event's online album, when online sharing is on.
  const [albumUrl, setAlbumUrl] = useState<string | null>(null)
  const [albumQr, setAlbumQr] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null)

  useEffect(() => {
    if (!viewingEventId) return
    window.api.getAlbumUrl(viewingEventId).then(setAlbumUrl)
    window.api.getCloudStatus().then(setCloudStatus)
  }, [viewingEventId])

  useEffect(() => {
    if (!albumUrl) {
      setAlbumQr(null)
      return
    }
    QRCode.toDataURL(albumUrl, { width: 600, margin: 2 }).then(setAlbumQr)
  }, [albumUrl])

  async function copyAlbumLink(): Promise<void> {
    if (!albumUrl) return
    await navigator.clipboard.writeText(albumUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function retryUploads(): Promise<void> {
    await window.api.retryCloudUploads()
    setCloudStatus(await window.api.getCloudStatus())
  }

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
    if (path) {
      setViewing({
        src: toFileUrl(path),
        alt: `${s.eventName} — ${new Date(s.createdAt).toLocaleString()}`,
        qrUrl: s.shareUrl ?? null
      })
    }
  }

  // Strips print two-up and get cut apart, so their copies stay even (as on Print & Share).
  function paperOf(s: PhotoboothSession): string {
    return layouts.find((l) => l.id === s.layoutId)?.paperSizeId ?? ''
  }

  const selectedPhotos = photoSessions.filter((s) => selectedIds.has(s.id))

  function openReprint(): void {
    const initial: Record<string, number> = {}
    for (const s of selectedPhotos) initial[s.id] = isStripPaperSize(paperOf(s)) ? 2 : 1
    setCopies(initial)
    setSentIds(new Set())
    setReprintResult(null)
    setReprintOpen(true)
  }

  const pendingPhotos = selectedPhotos.filter((s) => !sentIds.has(s.id))
  const pendingCopies = pendingPhotos.reduce((n, s) => n + (copies[s.id] ?? 1), 0)

  function stepCopies(s: PhotoboothSession, direction: 1 | -1): void {
    const paper = paperOf(s)
    const step = isStripPaperSize(paper) ? 2 : 1
    setCopies((prev) => ({ ...prev, [s.id]: clampPrintQuantity((prev[s.id] ?? step) + direction * step, paper) }))
  }

  async function sendReprints(): Promise<void> {
    if (!viewingEventId || !printerName) return
    setPrinting(true)
    setReprintResult(null)
    let sent = 0
    let photos = 0
    const problems: string[] = []
    const nowSent = new Set(sentIds)
    for (const s of pendingPhotos) {
      const count = copies[s.id] ?? 1
      try {
        const layout = layouts.find((l) => l.id === s.layoutId)
        const size = layout
          ? { width: layout.canvasWidth, height: layout.canvasHeight }
          : await imageSize(s.composedImagePath as string)
        const result = await window.api.printImage({
          imagePath: s.composedImagePath as string,
          printerName,
          widthIn: size.width / PRINT_DPI,
          heightIn: size.height / PRINT_DPI,
          copies: count
        })
        if (result.success) {
          await window.api.addPrintCount(viewingEventId, s.id, count)
          sent += count
          photos += 1
          nowSent.add(s.id)
        } else {
          problems.push(`${new Date(s.createdAt).toLocaleString()}: ${result.error ?? 'unknown error'}`)
        }
      } catch (err) {
        problems.push(`${new Date(s.createdAt).toLocaleString()}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setSentIds(nowSent)
    setPrinting(false)
    refresh()
    if (problems.length === 0) {
      setReprintResult({
        kind: 'success',
        text: `Sent ${sent} ${sent === 1 ? 'copy' : 'copies'} of ${photos} ${photos === 1 ? 'photo' : 'photos'} to the printer.`
      })
    } else {
      setReprintResult({
        kind: 'error',
        text: `${sent > 0 ? `Sent ${sent} ${sent === 1 ? 'copy' : 'copies'}, but ` : ''}${problems.length} could not print — ${problems.join('; ')}`
      })
    }
  }

  function closeReprint(): void {
    const done = reprintResult?.kind === 'success'
    setReprintOpen(false)
    if (done) {
      setSelectedIds(new Set())
      setSelectMode(false)
    }
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
          {folder === 'photos' && selectMode && selectedIds.size > 0 && (
            <button className="btn progress" onClick={openReprint}>
              <IconPrint size={15} />
              Reprint ({selectedIds.size})
            </button>
          )}
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
          <>
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
            {albumUrl && (
              <div className="album-bar">
                <div className="album-bar-text">
                  <strong>Online album</strong>
                  <span title={albumUrl}>{albumUrl}</span>
                  {cloudStatus && cloudStatus.pending > 0 && (
                    <span className="album-bar-pending">
                      {cloudStatus.pending} waiting to upload
                      {cloudStatus.lastError ? ` — ${cloudStatus.lastError}` : ''}
                    </span>
                  )}
                </div>
                <div className="album-bar-actions">
                  <button className="btn secondary" onClick={copyAlbumLink}>
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button className="btn secondary" onClick={() => window.open(albumUrl)}>
                    Open
                  </button>
                  <button className="btn secondary" onClick={() => setQrOpen(true)} disabled={!albumQr}>
                    QR Code
                  </button>
                  {cloudStatus && cloudStatus.pending > 0 && (
                    <button className="btn ghost" onClick={retryUploads}>
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
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
                      {s.shareUrl && (
                        <div className="meta-qr" title="Scan to open this guest's online photos">
                          <SessionQr url={s.shareUrl} size={72} />
                        </div>
                      )}
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
          <div className="lightbox-stage">
            <img src={viewing.src} alt={viewing.alt} onClick={(e) => e.stopPropagation()} />
            {viewing.qrUrl && (
              <div className="lightbox-qr" onClick={(e) => e.stopPropagation()}>
                <SessionQr url={viewing.qrUrl} size={176} />
                <p>Scan to open this guest’s photos online</p>
              </div>
            )}
          </div>
        </div>
      )}

      {reprintOpen && (
        <div className="modal-overlay">
          <div className="modal-box reprint-box">
            <h3>
              Reprint {selectedPhotos.length} {selectedPhotos.length === 1 ? 'photo' : 'photos'}
            </h3>
            <div className="reprint-list">
              {selectedPhotos.map((s) => {
                const strip = isStripPaperSize(paperOf(s))
                const sentAlready = sentIds.has(s.id)
                return (
                  <div key={s.id} className="reprint-row">
                    <img src={toFileUrl(s.composedImagePath as string)} alt="" />
                    <div className="reprint-row-info">
                      <div>{new Date(s.createdAt).toLocaleString()}</div>
                      <div className="reprint-row-sub">
                        {sentAlready
                          ? `Sent ✓ ${copies[s.id] ?? 1} ${(copies[s.id] ?? 1) === 1 ? 'copy' : 'copies'}`
                          : `Printed so far: ${s.printCount}${strip ? ' · strips print in pairs' : ''}`}
                      </div>
                    </div>
                    <div className="qty-stepper">
                      <button disabled={printing || sentAlready} onClick={() => stepCopies(s, -1)}>
                        −
                      </button>
                      <span>{copies[s.id] ?? 1}</span>
                      <button disabled={printing || sentAlready} onClick={() => stepCopies(s, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {!printerName && (
              <p className="status-msg error">No printer selected — choose one in Photobooth Setup first.</p>
            )}
            {reprintResult && <p className={`status-msg ${reprintResult.kind}`}>{reprintResult.text}</p>}
            <div className="modal-actions">
              {reprintResult?.kind === 'success' ? (
                <button className="btn primary" onClick={closeReprint}>
                  Done
                </button>
              ) : (
                <>
                  <button className="btn secondary" onClick={closeReprint} disabled={printing}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    onClick={sendReprints}
                    disabled={printing || !printerName || pendingPhotos.length === 0}
                  >
                    <IconPrint size={15} />
                    {printing ? 'Printing…' : `Print ${pendingCopies} ${pendingCopies === 1 ? 'copy' : 'copies'}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {qrOpen && albumQr && (
        <div className="modal-overlay" onClick={() => setQrOpen(false)}>
          <div className="modal-box album-qr-box" onClick={(e) => e.stopPropagation()}>
            <h3>{event ? `${event.name} album` : 'Event album'}</h3>
            <img src={albumQr} alt="Album QR code" />
            <p>Anyone who scans this can see every photo and GIF from the event.</p>
            <div className="modal-actions">
              <a className="btn secondary" href={albumQr} download="Album QR.png">
                Save QR Image
              </a>
              <button className="btn primary" onClick={() => setQrOpen(false)}>
                Done
              </button>
            </div>
          </div>
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
