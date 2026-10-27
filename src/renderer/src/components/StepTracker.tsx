import { Fragment } from 'react'
import { useAppStore } from '../state/useAppStore'
import { IconCheck } from './Icon'

export type GuestStep = 'capture' | 'select' | 'preview' | 'print'

const LABELS: Record<GuestStep, string> = {
  capture: 'Capture',
  select: 'Select',
  preview: 'Preview',
  print: 'Print'
}

// Guest-flow progress. "Select" only exists when the booth takes more photos
// than the template has photo areas — otherwise photos are placed automatically
// and the step is left out entirely instead of showing as a dead stop.
export default function StepTracker({ current }: { current: GuestStep }): JSX.Element {
  const slotCount = useAppStore((s) => s.activeLayout?.slots.length ?? 0)
  const shots = useAppStore((s) => s.activeEvent?.shotsToCapture ?? 0)
  const capturedCount = useAppStore((s) => s.capturedPhotos.length)

  const hasSelect = Math.max(shots, capturedCount) > slotCount
  const steps: GuestStep[] = hasSelect ? ['capture', 'select', 'preview', 'print'] : ['capture', 'preview', 'print']
  const currentIndex = steps.indexOf(current)

  return (
    <div className="step-tracker" aria-label="Progress">
      {steps.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'upcoming'
        return (
          <Fragment key={step}>
            {i > 0 && <span className="step-line" />}
            <div className={`step ${state}`}>
              <span className="step-dot">{state === 'done' ? <IconCheck size={14} strokeWidth={3} /> : i + 1}</span>
              <span className="step-label">{LABELS[step]}</span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
