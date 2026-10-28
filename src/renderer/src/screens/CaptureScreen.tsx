import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../state/useAppStore'
import { playShutterSound } from '../lib/sound'
import { IconCamera, IconHome } from '../components/Icon'
import StepTracker from '../components/StepTracker'

// Countdown recording for the GIF: frame width and spacing (~8 fps).
const CLIP_FRAME_WIDTH = 640
const CLIP_FRAME_MS = 125

export default function CaptureScreen(): JSX.Element {
  const activeLayout = useAppStore((s) => s.activeLayout)
  const activeEvent = useAppStore((s) => s.activeEvent)
  const settings = useAppStore((s) => s.settings)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const addCapturedPhoto = useAppStore((s) => s.addCapturedPhoto)
  const addShotClip = useAppStore((s) => s.addShotClip)
  const setSlotPhotos = useAppStore((s) => s.setSlotPhotos)
  const resetSession = useAppStore((s) => s.resetSession)
  const setScreen = useAppStore((s) => s.setScreen)

  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const cancelledRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraStoppedRef = useRef(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null)

  // The layout defines a minimum (one shot per slot); the event can raise it
  // so guests get extra takes to choose from on the Photo Selection screen.
  const totalShots = Math.max(
    activeEvent?.shotsToCapture ?? activeLayout?.slots.length ?? 3,
    activeLayout?.slots.length ?? 1
  )
  const countdownSeconds = activeEvent?.countdownSeconds ?? settings.countdownSeconds
  const currentShotNumber = Math.min(capturedPhotos.length + 1, totalShots)

  // Frame the live preview to the aspect ratio of a print slot — cycling
  // through the layout's slots when there are more shots than slots — so
  // what the guest sees roughly matches the final crop with no stretching.
  const slotCount = activeLayout?.slots.length ?? 0
  const targetSlot = slotCount > 0 ? activeLayout!.slots[capturedPhotos.length % slotCount] : undefined
  const slotAspectRatio = targetSlot ? targetSlot.width / targetSlot.height : 4 / 3

  // Recompute the frame's pixel size whenever the stage resizes for any
  // reason (including the window itself being resized), so the preview
  // always fills as much of the available space as it can while staying
  // locked to the slot's aspect ratio.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    function recompute(): void {
      const stageEl = stageRef.current
      if (!stageEl) return
      const { width: stageW, height: stageH } = stageEl.getBoundingClientRect()
      if (stageW === 0 || stageH === 0) return
      const stageRatio = stageW / stageH
      if (slotAspectRatio > stageRatio) {
        setFrameSize({ width: stageW, height: stageW / slotAspectRatio })
      } else {
        setFrameSize({ width: stageH * slotAspectRatio, height: stageH })
      }
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [slotAspectRatio])

  // Stops every track immediately (called on cancel as well as on unmount) so
  // the hardware camera goes dark right away instead of waiting on React's
  // effect-cleanup timing. Also guards a stream that resolves from
  // getUserMedia after the guest has already cancelled — without this check
  // that stream would never get stopped and the camera would stay on.
  const stopCamera = useCallback((): void => {
    cameraStoppedRef.current = true
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!activeEvent || !activeLayout) {
      setScreen('home')
      return
    }
    resetSession()
    cameraStoppedRef.current = false

    async function startCamera(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: settings.cameraDeviceId
            ? { deviceId: { exact: settings.cameraDeviceId } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        })
        if (cameraStoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
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
      stopCamera()
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

  // Small mirrored snapshot of the live feed, used to record the countdown
  // for the animated GIF (the full-size still is captureFrame above).
  const clipCanvasRef = useRef<HTMLCanvasElement | null>(null)
  function grabClipFrame(): string | null {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const canvas = clipCanvasRef.current ?? (clipCanvasRef.current = document.createElement('canvas'))
    canvas.width = CLIP_FRAME_WIDTH
    canvas.height = Math.round((CLIP_FRAME_WIDTH * video.videoHeight) / video.videoWidth)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)
  }

  const runSequence = useCallback(async (): Promise<void> => {
    setRunning(true)
    for (let shot = 0; shot < totalShots; shot++) {
      // Record the countdown leading up to this shot; the clip ends on the shot itself.
      const clip: string[] = []
      const record = (): void => {
        const frame = grabClipFrame()
        if (frame) clip.push(frame)
      }
      record()
      const recorder = setInterval(record, CLIP_FRAME_MS)
      try {
        for (let c = countdownSeconds; c >= 1; c--) {
          if (cancelledRef.current) return
          setCountdown(c)
          await new Promise((r) => setTimeout(r, 1000))
        }
        if (cancelledRef.current) return
      } finally {
        clearInterval(recorder)
      }
      setCountdown(null)
      setFlash(true)
      playShutterSound()
      const dataUrl = captureFrame()
      addCapturedPhoto(dataUrl)
      record()
      addShotClip(clip)
      await new Promise((r) => setTimeout(r, 200))
      if (cancelledRef.current) return
      setFlash(false)
      await new Promise((r) => setTimeout(r, 600))
    }
    if (cancelledRef.current) return
    setRunning(false)

    // Auto-assign in capture order when the count matches the layout exactly;
    // otherwise send the guest to pick favorites and place them into slots.
    const finalPhotos = useAppStore.getState().capturedPhotos
    if (activeLayout && finalPhotos.length === activeLayout.slots.length) {
      setSlotPhotos([...finalPhotos])
      setScreen('review')
    } else {
      setScreen('photoSelection')
    }
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

  function cancelToHome(): void {
    cancelledRef.current = true
    stopCamera()
    resetSession()
    setScreen('home')
  }

  return (
    <div className="screen capture">
      <StepTracker current="capture" />
      <div className="capture-pill">
        Photo {currentShotNumber} of {totalShots}
      </div>

      <div className="capture-stage" ref={stageRef}>
        {error ? (
          <div style={{ textAlign: 'center', color: 'var(--color-ink)', padding: 24 }}>
            <p>{error}</p>
            <button className="btn secondary" onClick={() => setScreen('attract')}>
              ← Back
            </button>
          </div>
        ) : (
          <div
            className="capture-video-frame"
            style={
              frameSize
                ? { width: frameSize.width, height: frameSize.height }
                : { aspectRatio: slotAspectRatio }
            }
          >
            {!cameraReady && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--color-ink-disabled)' }}>
                <IconCamera size={40} strokeWidth={1.4} />
                <div style={{ fontSize: 13, letterSpacing: '0.03em' }}>Live Camera Preview</div>
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted style={{ display: cameraReady ? 'block' : 'none' }} />
            {countdown !== null && (
              <div className="countdown-overlay">
                <div className="look-callout">Look here!</div>
                <div className="countdown-badge">{countdown}</div>
              </div>
            )}
            {flash && <div className="flash" />}
          </div>
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
        <button
          className="btn secondary"
          onClick={() => {
            cancelledRef.current = true
            stopCamera()
            setScreen('attract')
          }}
        >
          Cancel
        </button>
      )}

      <button className="btn ghost icon-btn exit-btn" title="Cancel session and return Home" onClick={cancelToHome}>
        <IconHome size={16} />
      </button>
    </div>
  )
}
