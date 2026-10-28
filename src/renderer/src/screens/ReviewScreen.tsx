import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { composeLayout } from '../lib/compose'
import type { PhotoboothSession } from '@shared/types'
import { IconChevronRight, IconHome } from '../components/Icon'
import StepTracker from '../components/StepTracker'

export default function ReviewScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const slotPhotos = useAppStore((s) => s.slotPhotos)
  const composedImage = useAppStore((s) => s.composedImage)
  const setComposedImage = useAppStore((s) => s.setComposedImage)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId)
  const setScreen = useAppStore((s) => s.setScreen)
  const resetSession = useAppStore((s) => s.resetSession)
  const settings = useAppStore((s) => s.settings)

  // Mirrors the step tracker: favorites only exist when extra shots were taken.
  // Once the session is saved (guest came back from Print & Share) the picks
  // are locked in, so re-picking would leave the saved photo out of date.
  const hasSelect = capturedPhotos.length > (activeLayout?.slots.length ?? 0) && !currentSessionId

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeLayout || !activeEvent || !slotPhotos || slotPhotos.length !== activeLayout.slots.length) {
      setScreen('home')
      return
    }
    composeLayout(activeLayout, slotPhotos)
      .then(setComposedImage)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retake(): void {
    resetSession()
    setScreen('capture')
  }

  function cancelToHome(): void {
    resetSession()
    setScreen('home')
  }

  async function continueToOutput(): Promise<void> {
    if (!activeLayout || !activeEvent || !composedImage) return
    // Already saved this round (e.g. the guest hit Back from Print & Share and
    // then Continue again) — reuse the existing session instead of writing a
    // second copy of the same photos.
    if (currentSessionId) {
      setScreen('output')
      return
    }
    setBusy(true)
    try {
      const sessionId = uuid()
      const rawPaths: string[] = []
      for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await window.api.saveRawPhoto(activeEvent.id, sessionId, i + 1, capturedPhotos[i])
        rawPaths.push(p)
      }
      const composedPath = await window.api.saveComposedPhoto(activeEvent.id, sessionId, composedImage)

      const session: PhotoboothSession = {
        id: sessionId,
        eventId: activeEvent.id,
        layoutId: activeLayout.id,
        eventName: activeEvent.name,
        createdAt: new Date().toISOString(),
        rawPhotoPaths: rawPaths,
        composedImagePath: composedPath,
        gifPath: null,
        printCount: 0
      }
      await window.api.saveSession(session)
      setCurrentSessionId(sessionId)
      setScreen('output')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <StepTracker current="preview" />
      <div className="topbar">
        <div style={{ width: 100 }} />
        <h2>Here&apos;s Your Print!</h2>
        <div style={{ width: 100 }} />
      </div>
      <div className="content">
        <div className="review-layout">
          <div className="preview-frame">
            {composedImage ? <img src={composedImage} alt="Composed preview" /> : <p>Composing…</p>}
          </div>
          <div className="side-panel">
            <div className="panel-section">
              <h3>What happens next</h3>
              <p>
                {activeEvent?.printQuantity ?? 1} {activeEvent?.printQuantity === 1 ? 'copy' : 'copies'} of{' '}
                {activeLayout?.name ?? 'your layout'} will be ready to print. You can change the count on the next
                screen.
              </p>
              <p>
                {settings.shareServerEnabled
                  ? 'Your GIF and a QR code to download your photos are made for you automatically.'
                  : 'Your GIF is made automatically. QR sharing is turned off for this booth.'}
              </p>
            </div>
            {error && <p className="status-msg error">{error}</p>}
            <button className="btn progress" disabled={!composedImage || busy} onClick={continueToOutput}>
              {busy ? 'Saving…' : 'Continue'}
              {!busy && <IconChevronRight size={16} />}
            </button>
            {hasSelect && (
              <button className="btn secondary" onClick={() => setScreen('photoSelection')}>
                Change Favorites
              </button>
            )}
            <button className="btn secondary" onClick={retake}>
              Retake Photos
            </button>
          </div>
        </div>
      </div>

      <button className="btn ghost icon-btn exit-btn" title="Cancel session and return Home" onClick={cancelToHome}>
        <IconHome size={16} />
      </button>
    </div>
  )
}
