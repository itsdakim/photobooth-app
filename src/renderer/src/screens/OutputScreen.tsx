import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../state/useAppStore'
import { buildGif } from '../lib/gifExport'

export default function OutputScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const composedImage = useAppStore((s) => s.composedImage)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const settings = useAppStore((s) => s.settings)
  const setScreen = useAppStore((s) => s.setScreen)
  const resetSession = useAppStore((s) => s.resetSession)
  const resetCapturedPhotos = useAppStore((s) => s.resetCapturedPhotos)

  const [quantity, setQuantity] = useState(settings.defaultPrintQuantity)
  const [printing, setPrinting] = useState(false)
  const [gifBusy, setGifBusy] = useState(false)
  const [gifDataUrl, setGifDataUrl] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)

  async function handlePrint(): Promise<void> {
    if (!composedImage || !currentSessionId || !settings.selectedPrinterName || !activeLayout) {
      setStatus({ text: 'Select a printer in Settings first.', kind: 'error' })
      return
    }
    setPrinting(true)
    setStatus(null)
    try {
      const composedPath = await window.api.savePhoto(currentSessionId, composedImage, 'composed.png')
      const result = await window.api.printImage({
        imagePath: composedPath,
        printerName: settings.selectedPrinterName,
        paperSizeId: activeLayout.paperSizeId,
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
    if (!currentSessionId || !composedImage) return
    const path = await window.api.savePhoto(currentSessionId, composedImage, 'composed.png')
    const saved = await window.api.exportCopy(path)
    if (saved) setStatus({ text: `Saved to ${saved}`, kind: 'success' })
  }

  async function handleBuildGif(): Promise<void> {
    if (!currentSessionId || !activeLayout || capturedPhotos.length < 2) return
    setGifBusy(true)
    try {
      const blob = await buildGif(capturedPhotos, {
        width: 480,
        height: Math.round((480 * activeLayout.canvasHeight) / activeLayout.canvasWidth),
        delayMs: 500
      })
      const buffer = await blob.arrayBuffer()
      await window.api.saveGif(currentSessionId, buffer, 'session.gif')
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
    if (!currentSessionId) return
    const url = await window.api.startShareServer(settings.shareServerPort)
    const target = `${url}/session/${currentSessionId}/composed.png`
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
    resetSession()
    resetCapturedPhotos()
    setScreen('attract')
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('review')}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Print &amp; Share</h2>
        <button className="btn primary" onClick={startNewSession}>
          New Session ✓
        </button>
      </div>
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
                <p className="status-msg error">No printer selected — set one in Settings.</p>
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
