import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../state/useAppStore'
import { buildGif } from '../lib/gifExport'
import { PRINT_DPI } from '@shared/types'

const AUTO_RETURN_SECONDS = 180
const PROMPT_TIMEOUT_SECONDS = 30

export default function OutputScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const composedImage = useAppStore((s) => s.composedImage)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const settings = useAppStore((s) => s.settings)
  const setScreen = useAppStore((s) => s.setScreen)
  const resetSession = useAppStore((s) => s.resetSession)

  const [quantity, setQuantity] = useState(activeEvent?.printQuantity ?? 2)
  const [printing, setPrinting] = useState(false)
  const [gifBusy, setGifBusy] = useState(false)
  const [gifDataUrl, setGifDataUrl] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS)
  const [showTimeoutPrompt, setShowTimeoutPrompt] = useState(false)
  const [promptSecondsLeft, setPromptSecondsLeft] = useState(PROMPT_TIMEOUT_SECONDS)

  async function handlePrint(): Promise<void> {
    if (
      !composedImage ||
      !currentSessionId ||
      !activeEvent ||
      !settings.selectedPrinterName ||
      !activeLayout
    ) {
      setStatus({ text: 'Select a printer in Photobooth Setup first.', kind: 'error' })
      return
    }
    setPrinting(true)
    setStatus(null)
    try {
      const composedPath = await window.api.savePhoto(
        activeEvent.id,
        currentSessionId,
        composedImage,
        'composed.png'
      )
      const result = await window.api.printImage({
        imagePath: composedPath,
        printerName: settings.selectedPrinterName,
        widthIn: activeLayout.canvasWidth / PRINT_DPI,
        heightIn: activeLayout.canvasHeight / PRINT_DPI,
        copies: quantity
      })
      if (result.success) {
        setStatus({ text: `Sent ${quantity} copy(ies) to the printer.`, kind: 'success' })
      } else {
        setStatus({ text: `Print failed: ${result.error ?? 'unknown error'}`, kind: 'error' })
      }
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), kind: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  async function handleSaveDigitalCopy(): Promise<void> {
    if (!currentSessionId || !activeEvent || !composedImage) return
    const path = await window.api.savePhoto(activeEvent.id, currentSessionId, composedImage, 'composed.png')
    const saved = await window.api.exportCopy(path)
    if (saved) setStatus({ text: `Saved to ${saved}`, kind: 'success' })
  }

  async function handleBuildGif(): Promise<void> {
    if (!currentSessionId || !activeEvent || !activeLayout || capturedPhotos.length < 2) return
    setGifBusy(true)
    try {
      const blob = await buildGif(capturedPhotos, {
        width: 480,
        height: Math.round((480 * activeLayout.canvasHeight) / activeLayout.canvasWidth),
        delayMs: 500
      })
      const buffer = await blob.arrayBuffer()
      await window.api.saveGif(activeEvent.id, currentSessionId, buffer, 'session.gif')
      const url = URL.createObjectURL(blob)
      setGifDataUrl(url)
      setStatus({ text: 'GIF created!', kind: 'success' })
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), kind: 'error' })
    } finally {
      setGifBusy(false)
    }
  }

  async function handleShare(): Promise<void> {
    if (!currentSessionId || !activeEvent) return
    const url = await window.api.startShareServer(settings.shareServerPort)
    const target = `${url}/event/${activeEvent.id}/session/${currentSessionId}/composed.png`
    setShareUrl(target)
    const qr = await QRCode.toDataURL(target, { width: 280, margin: 1 })
    setQrDataUrl(qr)
  }

  useEffect(() => {
    return () => {
      window.api.stopShareServer()
      if (gifDataUrl) URL.revokeObjectURL(gifDataUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startNewSession(): void {
    // Keeps the active event + layout so the next guest reuses the same setup.
    resetSession()
    setScreen('attract')
  }

  // Runs down at a flat pace regardless of what the guest does on this page —
  // once it hits zero, a prompt asks whether to keep going before the booth
  // auto-resets for the next guest.
  useEffect(() => {
    if (showTimeoutPrompt) return
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setPromptSecondsLeft(PROMPT_TIMEOUT_SECONDS)
          setShowTimeoutPrompt(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [showTimeoutPrompt])

  // While the "Still there?" prompt is up, its own countdown auto-starts a
  // new session if nobody answers.
  useEffect(() => {
    if (!showTimeoutPrompt) return
    const interval = setInterval(() => {
      setPromptSecondsLeft((s) => {
        if (s <= 1) {
          startNewSession()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTimeoutPrompt])

  function addMoreTime(): void {
    setSecondsLeft(AUTO_RETURN_SECONDS)
    setShowTimeoutPrompt(false)
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('review')}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Print &amp; Share</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#9aa0ae' }}>New session in {secondsLeft}s</span>
          <button className="btn primary" onClick={startNewSession}>
            New Session ✓
          </button>
        </div>
      </div>

      {showTimeoutPrompt && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Still there?</h3>
            <p>
              Starting a new session in {promptSecondsLeft}s, or you can keep going.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={addMoreTime}>
                + 3 More Minutes
              </button>
              <button className="btn primary" onClick={startNewSession}>
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="content">
        <div className="output-layout">
          <div className="preview-frame">
            {gifDataUrl ? (
              <img src={gifDataUrl} alt="Session GIF" />
            ) : (
              composedImage && <img src={composedImage} alt="Composed" />
            )}
          </div>

          <div className="side-panel">
            <div className="panel-section">
              <h3>Print copies</h3>
              <div className="qty-stepper">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity((q) => Math.min(20, q + 1))}>+</button>
              </div>
              <button className="btn primary" onClick={handlePrint} disabled={printing}>
                {printing ? 'Printing…' : `🖨 Print ${quantity}`}
              </button>
              {!settings.selectedPrinterName && (
                <p className="status-msg error">No printer selected — set one in Photobooth Setup.</p>
              )}
            </div>

            <div className="panel-section">
              <h3>Save &amp; Share</h3>
              <button className="btn secondary" onClick={handleSaveDigitalCopy}>
                💾 Save Digital Copy
              </button>
              <button className="btn secondary" onClick={handleBuildGif} disabled={gifBusy}>
                {gifBusy ? 'Building GIF…' : '🎞 Create GIF'}
              </button>
              <button className="btn secondary" onClick={handleShare}>
                📲 Share via QR Code
              </button>
              {qrDataUrl && (
                <div style={{ textAlign: 'center' }}>
                  <div className="qr-box">
                    <img src={qrDataUrl} alt="QR code" width={200} height={200} />
                  </div>
                  <p style={{ fontSize: 12, color: '#9aa0ae', wordBreak: 'break-all' }}>{shareUrl}</p>
                </div>
              )}
            </div>

            {status && <p className={`status-msg ${status.kind}`}>{status.text}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
