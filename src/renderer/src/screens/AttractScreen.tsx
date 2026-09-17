import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { IconHome } from '../components/Icon'

export default function AttractScreen(): JSX.Element {
  const activeEvent = useAppStore((s) => s.activeEvent)
  const activeLayout = useAppStore((s) => s.activeLayout)
  const setScreen = useAppStore((s) => s.setScreen)

  useEffect(() => {
    if (!activeEvent) setScreen('home')
  }, [activeEvent, setScreen])

  if (!activeEvent) return <div className="screen attract" />

  return (
    <div className="screen attract">
      <svg className="attract-rings" viewBox="0 0 900 1500" preserveAspectRatio="xMidYMid slice">
        <circle cx="450" cy="720" r="340" fill="none" stroke="#EEEBE3" strokeWidth="1.5" />
        <circle cx="450" cy="720" r="420" fill="none" stroke="#EEEBE3" strokeWidth="1.5" />
      </svg>

      <div className="attract-eyebrow">{activeEvent.name}</div>

      <div className="attract-center">
        <h1>Ready?</h1>
        <p>Tap start to begin your photo experience</p>
        <button className="btn primary tap-btn" onClick={() => setScreen('capture')}>
          Start
        </button>
      </div>

      <div className="attract-footer">
        <span>
          {activeLayout ? activeLayout.name : 'Photobooth'} · {activeEvent.printQuantity}x prints
        </span>
        <span className="dot" />
        <span>{activeEvent.name}</span>
      </div>

      <button
        className="btn ghost icon-btn exit-btn"
        title="Exit to Home (staff only)"
        onClick={(e) => {
          e.stopPropagation()
          setScreen('home')
        }}
      >
        <IconHome size={16} />
      </button>
    </div>
  )
}
