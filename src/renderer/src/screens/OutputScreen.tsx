import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../state/useAppStore'
import { buildLayoutGif } from '../lib/gifExport'
import { PRINT_DPI, clampPrintQuantity, cloudConfigured, isStripPaperSize } from '@shared/types'
import { IconChevronLeft, IconCheck, IconHome, IconPrint } from '../components/Icon'
import StepTracker from '../components/StepTracker'
import { ScallopFrame } from '../components/Doodles'

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
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS)
  const [showTimeoutPrompt, setShowTimeoutPrompt] = useState(false)
  const [promptSecondsLeft, setPromptSecondsLeft] = useState(PROMPT_TIMEOUT_SECONDS)

  // The preview card hugs the photo: fit the print's aspect ratio into the
  // space available, then size the card around it (card padding + stroke and
  // the image's white border are added on top of the photo itself).
  // The preview and the side panel form one group, centered in the page. The
  // preview gets whatever the side panel and gap leave over, so wide prints
  // (4x6 landscape) and tall strips each scale to fit; the panel is matched
  // to the card's height so the two line up.
  const layoutRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState<{
    imgW: number
    imgH: number
    frameW: number
    frameH: number
    panelH: number
  } | null>(null)
  const ratio = activeLayout ? activeLayout.canvasWidth / activeLayout.canvasHeight : 2 / 3
  useEffect(() => {
    const layout = layoutRef.current
    const side = sideRef.current
    if (!layout || !side) return
    const CARD_CHROME = 2 * 18 + 2 * 2 // padding + stroke on each side
    const PHOTO_BORDER = 0 // the preview photo has no white border here
    const GROUP_GAP = 36
    const PANEL_MIN_HEIGHT = 380
    const fit = (): void => {
      const { width, height } = layout.getBoundingClientRect()
      const availW = Math.max(width - side.offsetWidth - GROUP_GAP - CARD_CHROME - PHOTO_BORDER, 40)
      const availH = Math.max(height - CARD_CHROME - PHOTO_BORDER, 40)
      const imgW = Math.floor(Math.min(availW, availH * ratio))
      const imgH = Math.floor(imgW / ratio)
      const frameH = imgH + PHOTO_BORDER + CARD_CHROME
      setPreviewSize({
        imgW,
        imgH,
        frameW: imgW + PHOTO_BORDER + CARD_CHROME,
        frameH,
        panelH: Math.floor(Math.min(height, Math.max(frameH, PANEL_MIN_HEIGHT)))
      })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [ratio])

  // The QR scales to whatever room the Share box has left on this window, so
  // everything on the page fits without scrolling.
  const qrSlotRef = useRef<HTMLDivElement>(null)
  const [qrSize, setQrSize] = useState(180)
  const qrImgSize = Math.round(qrSize * 0.64)
  useEffect(() => {
    const slot = qrSlotRef.current
    if (!slot) return
    const fit = (): void => {
      const { width, height } = slot.getBoundingClientRect()
      setQrSize(Math.max(64, Math.min(250, Math.floor(Math.min(width, height)))))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [qrDataUrl])

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
        setStatus({ text: `Sent ${quantity} ${quantity === 1 ? 'copy' : 'copies'} to the printer.`, kind: 'success' })
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
        // One countdown recording per photo slot, following whichever shots the
        // guest picked. If a recording is missing, that slot holds its still photo.
        try {
          const { slotPhotos, shotClips } = useAppStore.getState()
          const clips = activeLayout!.slots.map((_, i) => {
            const photo = slotPhotos?.[i] ?? capturedPhotos[i]
            const clip = shotClips[capturedPhotos.indexOf(photo)]
            return clip && clip.length > 0 ? clip : photo ? [photo] : []
          })
          const blob = await buildLayoutGif(activeLayout!, clips)
          await window.api.saveGif(activeEvent!.id, currentSessionId!, await blob.arrayBuffer())
        } catch (err) {
          // A GIF problem shouldn't stop the QR download page from appearing.
          console.error('GIF generation failed', err)
        }

        // Online sharing (Cloudflare) gives a link that keeps working after the
        // event; the same-wifi server below is the fallback when it isn't set up.
        const online = cloudConfigured(settings.cloud)
          ? await window.api.publishSessionOnline(activeEvent!.id, currentSessionId!)
          : null
        if (online) {
          setShareUrl(online.sessionUrl)
          setQrDataUrl(await QRCode.toDataURL(online.sessionUrl, { width: 240, margin: 1 }))
        } else if (settings.shareServerEnabled) {
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
      <StepTracker current="print" />
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
        <div className="output-layout" ref={layoutRef}>
          <div
            className="preview-frame"
            style={previewSize ? { width: previewSize.frameW, height: previewSize.frameH } : undefined}
          >
            {composedImage && (
              <img
                src={composedImage}
                alt="Composed"
                style={previewSize ? { width: previewSize.imgW, height: previewSize.imgH } : undefined}
              />
            )}
          </div>

          <div
            className="side-panel output-side"
            ref={sideRef}
            style={previewSize ? { height: previewSize.panelH } : undefined}
          >
            <div className="panel-section">
              <h3>Print copies</h3>
              <div className="print-row">
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
                <button className="btn progress" onClick={handlePrint} disabled={printing}>
                  <IconPrint size={16} />
                  {printing ? 'Printing…' : `Print ${quantity}`}
                </button>
              </div>
              {isStripLayout && (
                <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                  Strips print two-up and get cut apart, so copies must be even.
                </p>
              )}
              {!settings.selectedPrinterName && (
                <p className="status-msg error">No printer selected — set one in Photobooth Setup.</p>
              )}
            </div>

            <div className="panel-section share-section">
              <h3>Share</h3>
              {preparingShare && <p className="status-msg">Preparing your GIF and download link…</p>}
              <div className="share-body">
                {qrDataUrl ? (
                  <div className="share-qr">
                    <div className="share-qr-slot" ref={qrSlotRef}>
                      <ScallopFrame size={qrSize}>
                        <div
                          className="qr-tile"
                          style={{ padding: Math.round(qrSize * 0.04) }}
                          title={shareUrl ?? undefined}
                        >
                          <img src={qrDataUrl} alt="QR code" width={qrImgSize} height={qrImgSize} />
                        </div>
                      </ScallopFrame>
                    </div>
                    <p className="share-caption">Scan to download your photo &amp; GIF</p>
                  </div>
                ) : (
                  !preparingShare &&
                  !settings.shareServerEnabled &&
                  !cloudConfigured(settings.cloud) && (
                    <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
                      QR sharing is turned off — enable it in Photobooth Setup.
                    </p>
                  )
                )}
              </div>
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
