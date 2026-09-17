import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { playShutterSound } from '../lib/sound'

export default function CaptureScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const settings = useAppStore((s) => s.settings)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const addCapturedPhoto = useAppStore((s) => s.addCapturedPhoto)
  const resetCapturedPhotos = useAppStore((s) => s.resetCapturedPhotos)
  const setScreen = useAppStore((s) => s.setScreen)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const totalShots = activeLayout?.slots.length ?? 3
  const countdownSeconds = activeEvent?.countdownSeconds ?? settings.countdownSeconds

  useEffect(() => {
    if (!activeEvent || !activeLayout) {
      setScreen('home')
      return
    }
    resetCapturedPhotos()
    let stream: MediaStream | null = null

    async function startCamera(): Promise<void> {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: settings.cameraDeviceId
            ? { deviceId: { exact: settings.cameraDeviceId } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        })
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        setError(
          'Could not access a camera. Check that a webcam is connected and permission is granted.'
        )
      }
    }
    startCamera()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function captureFrame(): string {
    const video = videoRef.current
    if (!video) return ''
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    // Mirror horizontally to match the preview the subject sees.
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  async function runSequence(): Promise<void> {
    setRunning(true)
    for (let shot = 0; shot < totalShots; shot++) {
      for (let c = countdownSeconds; c >= 1; c--) {
        setCountdown(c)
        await new Promise((r) => setTimeout(r, 1000))
      }
      setCountdown(null)
      setFlash(true)
      playShutterSound()
      const dataUrl = captureFrame()
      addCapturedPhoto(dataUrl)
      await new Promise((r) => setTimeout(r, 200))
      setFlash(false)
      await new Promise((r) => setTimeout(r, 600))
    }
    setRunning(false)
    setScreen('review')
  }

  return (
    <div className="screen capture">
      <div className="shot-indicator">
        {Array.from({ length: totalShots }).map((_, i) => (
          <div key={i} className={`shot-dot ${i < capturedPhotos.length ? 'done' : ''}`} />
        ))}
      </div>

      {error ? (
        <div style={{ textAlign: 'center' }}>
          <p>{error}</p>
          <button className="btn secondary" onClick={() => setScreen('attract')}>
            ← Back
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted />
          {countdown !== null && <div className="countdown-overlay">{countdown}</div>}
          {flash && <div className="flash" />}
          {!running && capturedPhotos.length === 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 40,
                display: 'flex',
                gap: 16
              }}
            >
              <button className="btn secondary" onClick={() => setScreen('attract')}>
                Cancel
              </button>
              <button className="btn primary" onClick={runSequence}>
                Start Countdown
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
