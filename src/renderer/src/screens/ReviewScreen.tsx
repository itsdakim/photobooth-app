import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { composeLayout } from '../lib/compose'
import type { PhotoboothSession } from '@shared/types'

export default function ReviewScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const composedImage = useAppStore((s) => s.composedImage)
  const setComposedImage = useAppStore((s) => s.setComposedImage)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId)
  const setScreen = useAppStore((s) => s.setScreen)
  const resetSession = useAppStore((s) => s.resetSession)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeLayout || !activeEvent) {
      setScreen('home')
      return
    }
    composeLayout(activeLayout, capturedPhotos)
      .then(setComposedImage)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retake(): void {
    resetSession()
    setScreen('capture')
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
        const p = await window.api.savePhoto(activeEvent.id, sessionId, capturedPhotos[i], `raw_${i + 1}.jpg`)
        rawPaths.push(p)
      }
      const composedPath = await window.api.savePhoto(activeEvent.id, sessionId, composedImage, 'composed.png')

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
      <div className="topbar">
        <button className="btn secondary" onClick={retake}>
          ↺ Retake
        </button>
        <h2 style={{ margin: 0 }}>Review Your Photo</h2>
        <div style={{ width: 100 }} />
      </div>
      <div className="content">
        <div className="review-layout">
          <div className="preview-frame">
            {composedImage ? <img src={composedImage} alt="Composed preview" /> : <p>Composing…</p>}
          </div>
          <div className="side-panel">
            <p>Love it? Continue to choose print quantity, save a digital copy, or make a GIF.</p>
            {error && <p className="status-msg error">{error}</p>}
            <button className="btn primary" disabled={!composedImage || busy} onClick={continueToOutput}>
              {busy ? 'Saving…' : 'Continue →'}
            </button>
            <button className="btn secondary" onClick={retake}>
              Retake Photos
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
