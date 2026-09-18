import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../state/useAppStore'
import { buildGif } from '../lib/gifExport'
import { PRINT_DPI, clampPrintQuantity, isStripPaperSize } from '@shared/types'
import { IconChevronLeft, IconCheck, IconHome, IconPrint } from '../components/Icon'

const AUTO_RETURN_SECONDS = 120
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

  const isStripLayout = isStripPaperSize(activeLayout?.paperSizeId ?? '4x6')
  const [quantity, setQuantity] = useState(
    clampPrintQuantity(activeEvent?.printQuantity ?? 2, activeLayout?.paperSizeId ?? '4x6')
  )
  const [printing, setPrinting] = useState(false)
  const [preparingShare, setPreparingShare] = useState(true)
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
      const composedPath = await window.api.saveComposedPhoto(activeEvent.id, currentSessionId, composedImage)
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

  // The composed photo is already saved (from Review), the printer copy is
  // handled above, and everything else — the GIF and the QR download page —
  // happens automatically as soon as this screen loads, with no extra taps.
  const shareStartedRef = useRef(false)
  useEffect(() => {
    if (shareStartedRef.current) return
    if (!currentSessionId || !activeEvent || !activeLayout) return
    shareStartedRef.current = true

    async function prepareShare(): Promise<void> {
      try {
        if (capturedPhotos.length >= 2) {
          const blob = await buildGif(capturedPhotos, {
            width: 480,
            height: Math.round((480 * activeLayout!.canvasHeight) / activeLayout!.canvasWidth),
            delayMs: 500
          })
          const buffer = await blob.arrayBuffer()
          await window.api.saveGif(activeEvent!.id, currentSessionId!, buffer)
          setGifDataUrl(URL.createObjectURL(blob))
        }

        if (settings.shareServerEnabled) {
          const baseUrl = await window.api.startShareServer(settings.shareServerPort)
          const target = `${baseUrl}/event/${activeEvent!.id}/session/${currentSessionId}`
          setShareUrl(target)
          const qr = await QRCode.toDataURL(target, { width: 240, margin: 1 })
          setQrDataUrl(qr)
        }
      } catch (err) {
        setStatus({ text: err instanceof Error ? err.message : String(err), kind: 'error' })
      } finally {
        setPreparingShare(false)
      }
    }
    prepareShare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function cancelToHome(): void {
    resetSession()
    setScreen('home')
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
        <button className="btn icon-btn back-btn" onClick={() => setScreen('review')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Print &amp; Share</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>New session in {secondsLeft}s</span>
          <button className="btn primary" onClick={startNewSession}>
            <IconCheck size={16} />
            New Session
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
                + 2 More Minutes
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
          <div className="preview-frame">{composedImage && <img src={composedImage} alt="Composed" />}</div>

          <div className="side-panel">
            <div className="panel-section">
              <h3>Print copies</h3>
              <div className="qty-stepper">
                <button
                  onClick={() =>
                    setQuantity((q) =>
                      clampPrintQuantity(q - (isStripLayout ? 2 : 1), activeLayout?.paperSizeId ?? '4x6')
                    )
                  }
                >
                  −
                </button>
                <span>{quantity}</span>
                <button
                  onClick={() =>
                    setQuantity((q) =>
                      clampPrintQuantity(q + (isStripLayout ? 2 : 1), activeLayout?.paperSizeId ?? '4x6')
                    )
                  }
                >
                  +
                </button>
              </div>
              {isStripLayout && (
                <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                  Strips print two-up and get cut apart, so copies must be even.
                </p>
              )}
              <button className="btn primary" onClick={handlePrint} disabled={printing}>
                <IconPrint size={16} />
                {printing ? 'Printing…' : `Print ${quantity}`}
              </button>
              {!settings.selectedPrinterName && (
                <p className="status-msg error">No printer selected — set one in Photobooth Setup.</p>
              )}
            </div>

            <div className="panel-section">
              <h3>Share</h3>
              {preparingShare && <p className="status-msg">Preparing your GIF and download link…</p>}
              {gifDataUrl && (
                <img
                  src={gifDataUrl}
                  alt="Session GIF"
                  style={{ width: '100%', borderRadius: 12, border: '1px solid var(--color-border)' }}
                />
              )}
              {qrDataUrl ? (
                <div style={{ textAlign: 'center' }}>
                  <div className="qr-box">
                    <img src={qrDataUrl} alt="QR code" width={180} height={180} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-ink-faint)', marginTop: 8 }}>
                    Scan to download your photo &amp; GIF
                  </p>
                  {shareUrl && (
                    <p style={{ fontSize: 11, color: 'var(--color-ink-faint)', wordBreak: 'break-all' }}>
                      {shareUrl}
                    </p>
                  )}
                </div>
              ) : (
                !preparingShare &&
                !settings.shareServerEnabled && (
                  <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                    QR sharing is turned off — enable it in Photobooth Setup.
                  </p>
                )
              )}
            </div>

            {status && <p className={`status-msg ${status.kind}`}>{status.text}</p>}
          </div>
        </div>
      </div>

      <button className="btn ghost icon-btn exit-btn" title="Cancel session and return Home" onClick={cancelToHome}>
        <IconHome size={16} />
      </button>
    </div>
  )
}
