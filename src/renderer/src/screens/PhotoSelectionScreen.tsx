import { useEffect, useState, type MouseEvent } from 'react'
import { useAppStore } from '../state/useAppStore'
import { IconCheck, IconHome, IconX } from '../components/Icon'

export default function PhotoSelectionScreen(): JSX.Element {
  const activeEvent = useAppStore((s) => s.activeEvent)
  const activeLayout = useAppStore((s) => s.activeLayout)
  const capturedPhotos = useAppStore((s) => s.capturedPhotos)
  const setSlotPhotos = useAppStore((s) => s.setSlotPhotos)
  const resetSession = useAppStore((s) => s.resetSession)
  const setScreen = useAppStore((s) => s.setScreen)

  const slotCount = activeLayout?.slots.length ?? 0
  // Each entry is an index into capturedPhotos, or null if that slot is empty.
  const [assignments, setAssignments] = useState<Array<number | null>>(() => Array(slotCount).fill(null))
  const [armedSlot, setArmedSlot] = useState<number | null>(null)

  useEffect(() => {
    if (!activeEvent || !activeLayout) {
      setScreen('home')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSlotClick(slotIndex: number): void {
    setArmedSlot((prev) => (prev === slotIndex ? null : slotIndex))
  }

  function onPhotoClick(photoIndex: number): void {
    if (armedSlot === null) return
    setAssignments((prev) => {
      const next = [...prev]
      const previousSlotOfPhoto = next.findIndex((a) => a === photoIndex)
      const displacedPhoto = next[armedSlot]
      // Swap: if this photo is already placed in another slot, that slot
      // takes whatever the target slot currently holds (Replace otherwise).
      if (previousSlotOfPhoto !== -1 && previousSlotOfPhoto !== armedSlot) {
        next[previousSlotOfPhoto] = displacedPhoto
      }
      next[armedSlot] = photoIndex
      return next
    })
    setArmedSlot(null)
  }

  function clearSlot(slotIndex: number, e: MouseEvent): void {
    e.stopPropagation()
    setAssignments((prev) => {
      const next = [...prev]
      next[slotIndex] = null
      return next
    })
    if (armedSlot === slotIndex) setArmedSlot(null)
  }

  function cancelToHome(): void {
    resetSession()
    setScreen('home')
  }

  const allSlotsFilled = assignments.every((a) => a !== null)

  function continueToReview(): void {
    if (!allSlotsFilled) return
    setSlotPhotos(assignments.map((i) => capturedPhotos[i as number]))
    setScreen('review')
  }

  if (!activeLayout) return <div className="screen" />

  return (
    <div className="screen photo-selection">
      <div className="content">
        <div className="photo-selection-header">
          <h2>Choose Your Favorites</h2>
          <p>Tap a print slot, then tap a photo to fill it</p>
        </div>

        <div className="photo-selection-section">
          <h3>Your Photos</h3>
          <div className="photo-select-grid">
            {capturedPhotos.map((src, i) => {
              const usedInSlot = assignments.findIndex((a) => a === i)
              const isUsed = usedInSlot !== -1
              return (
                <div
                  key={i}
                  className={`photo-select-thumb ${isUsed ? 'used' : ''} ${armedSlot !== null ? 'selectable' : ''}`}
                  onClick={() => onPhotoClick(i)}
                >
                  <img src={src} alt={`Shot ${i + 1}`} />
                  {isUsed ? (
                    <div className="photo-select-badge">
                      <IconCheck size={12} strokeWidth={3} />
                    </div>
                  ) : (
                    <span className="photo-select-number">{i + 1}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="photo-selection-section">
          <h3>Your Print</h3>
          <div className="print-slot-grid">
            {activeLayout.slots.map((slot, i) => {
              const photoIndex = assignments[i]
              return (
                <div
                  key={slot.id}
                  className={`print-slot ${armedSlot === i ? 'armed' : ''} ${photoIndex !== null ? 'filled' : ''}`}
                  onClick={() => onSlotClick(i)}
                >
                  <span className="print-slot-label">Slot {i + 1}</span>
                  {photoIndex !== null ? (
                    <>
                      <img src={capturedPhotos[photoIndex]} alt={`Slot ${i + 1}`} />
                      <button className="print-slot-clear" onClick={(e) => clearSlot(i, e)} title="Clear slot">
                        <IconX size={12} strokeWidth={2.5} />
                      </button>
                    </>
                  ) : (
                    <span className="print-slot-placeholder">Tap to select</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <button className="btn primary photo-selection-continue" disabled={!allSlotsFilled} onClick={continueToReview}>
          Continue
        </button>
      </div>

      <button className="btn ghost icon-btn exit-btn" title="Cancel session and return Home" onClick={cancelToHome}>
        <IconHome size={16} />
      </button>
    </div>
  )
}
