import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../state/useAppStore'
import { playShutterSound } from '../lib/sound'
import { IconCamera } from '../components/Icon'

export default function CaptureScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const settings = useAppStore((s) => s.settings)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const addCapturedPhoto = useAppStore((s) => s.addCapturedPhoto)
  const resetSession = useAppStore((s) => s.resetSession)
  const setScreen = useAppStore((s) => s.setScreen)

  const videoRef = useRef<HTMLVideoElement>(null)
  const startedRef = useRef(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

  const totalShots = activeLayout?.slots.length ?? 3
  const countdownSeconds = activeEvent?.countdownSeconds ?? settings.countdownSeconds
  const currentShotNumber = Math.min(capturedPhotos.length + 1, totalShots)

  useEffect(() => {
    if (!activeEvent || !activeLayout) {
      setScreen('home')
      return
    }
    resetSession()
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
        setCameraReady(true)
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

  const runSequence = useCallback(async (): Promise<void> => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalShots, countdownSeconds])

  // Once the camera feed is live, the shoot begins on its own — no extra tap
  // needed after the guest already hit Start on the Ready screen.
  useEffect(() => {
    if (cameraReady && !startedRef.current) {
      startedRef.current = true
      runSequence()
    }
  }, [cameraReady, runSequence])

  return (
    <div className="screen capture">
      <div className="capture-pill">
        Photo {currentShotNumber} of {totalShots}
      </div>

      <div className="capture-stage">
        {error ? (
          <div style={{ textAlign: 'center', color: '#fff', padding: 24 }}>
            <p>{error}</p>
            <button className="btn secondary" onClick={() => setScreen('attract')}>
              ← Back
            </button>
          </div>
        ) : (
          <>
            {!cameraReady && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#8B887F' }}>
                <IconCamera size={40} strokeWidth={1.4} />
                <div style={{ fontSize: 13, letterSpacing: '0.03em' }}>Live Camera Preview</div>
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted style={{ display: cameraReady ? 'block' : 'none' }} />
            {countdown !== null && (
              <div className="countdown-overlay">
                <div className="countdown-badge">{countdown}</div>
              </div>
            )}
            {flash && <div className="flash" />}
          </>
        )}
      </div>

      <div className="shot-indicator">
        {Array.from({ length: totalShots }).map((_, i) => {
          const state =
            i < capturedPhotos.length ? 'done' : running && i === capturedPhotos.length ? 'current' : ''
          return <div key={i} className={`shot-dot ${state}`} />
        })}
      </div>

      {!error && !running && capturedPhotos.length === 0 && (
        <button className="btn secondary" onClick={() => setScreen('attract')}>
          Cancel
        </button>
      )}
    </div>
  )
}
