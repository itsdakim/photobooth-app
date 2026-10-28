import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import LayoutThumb from '../components/LayoutThumb'
import { eventForLayout, eventLayouts } from '@shared/types'
import { IconCheck, IconHome } from '../components/Icon'

// Shown after Start when the event offers more than one template: the guest
// picks the frame they want before the countdown begins.
export default function TemplateSelectScreen(): JSX.Element {
  const activeEvent = useAppStore((s) => s.activeEvent)
  const events = useAppStore((s) => s.events)
  const layouts = useAppStore((s) => s.layouts)
  const setActiveEvent = useAppStore((s) => s.setActiveEvent)
  const setActiveLayout = useAppStore((s) => s.setActiveLayout)
  const resetSession = useAppStore((s) => s.resetSession)
  const setScreen = useAppStore((s) => s.setScreen)

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    function onResize(): void {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The saved copy of the event, not activeEvent: a previous guest's pick
  // adjusts activeEvent's photo and copy counts for their template.
  const baseEvent = activeEvent ? events.find((e) => e.id === activeEvent.id) ?? activeEvent : null
  const offered = baseEvent ? eventLayouts(baseEvent, layouts) : []

  useEffect(() => {
    if (!activeEvent) setScreen('home')
    else if (offered.length <= 1) setScreen('attract')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!baseEvent || offered.length === 0) return <div className="screen" />

  // Contain-fit every template in the same box so strips and landscape prints
  // sit side by side at a comparable size. The box scales with the window
  // height, and shrinks further so up to four templates stay on one row.
  const BOX_RATIO = 0.8
  const CARD_CHROME = 40
  const GRID_GAP = 20
  let boxHeight = Math.max(150, Math.min(340, Math.round(windowSize.height * 0.36)))
  let boxWidth = Math.round(boxHeight * BOX_RATIO)
  if (offered.length <= 4) {
    const fitWidth = Math.floor((windowSize.width - 64 - GRID_GAP * (offered.length - 1)) / offered.length) - CARD_CHROME
    if (boxWidth > fitWidth) {
      boxWidth = Math.max(110, fitWidth)
      boxHeight = Math.round(boxWidth / BOX_RATIO)
    }
  }

  function thumbHeight(canvasWidth: number, canvasHeight: number): number {
    const ratio = canvasWidth / canvasHeight
    return ratio > boxWidth / boxHeight ? boxWidth / ratio : boxHeight
  }

  function continueWithTemplate(): void {
    const layout = offered.find((l) => l.id === pickedId)
    if (!layout || !baseEvent) return
    resetSession()
    setActiveEvent(eventForLayout(baseEvent, layouts, layout))
    setActiveLayout(layout)
    setScreen('capture')
  }

  return (
    <div className="screen template-select">
      <div className="content">
        <div className="template-select-header">
          <h2>Choose Your Template</h2>
          <p>Tap the frame you'd like for your photos</p>
        </div>

        <div className="template-select-grid">
          {offered.map((l) => {
            const picked = l.id === pickedId
            return (
              <button
                key={l.id}
                type="button"
                className={`template-choice ${picked ? 'picked' : ''}`}
                aria-pressed={picked}
                onClick={() => setPickedId(l.id)}
              >
                <div className="template-choice-thumb" style={{ width: boxWidth, height: boxHeight }}>
                  <LayoutThumb layout={l} displayHeight={thumbHeight(l.canvasWidth, l.canvasHeight)} />
                </div>
                <strong>{l.name}</strong>
                <span>
                  {l.slots.length} photo{l.slots.length === 1 ? '' : 's'}
                </span>
                {picked && (
                  <span className="template-choice-check">
                    <IconCheck size={16} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="template-select-actions">
          <button className="btn secondary" onClick={() => setScreen('attract')}>
            Back
          </button>
          <button className="btn progress" disabled={!pickedId} onClick={continueWithTemplate}>
            Continue
          </button>
        </div>
      </div>

      <button className="btn ghost icon-btn exit-btn" title="Exit to Home (staff only)" onClick={() => setScreen('home')}>
        <IconHome size={16} />
      </button>
    </div>
  )
}
