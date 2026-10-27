import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { IconHome } from '../components/Icon'
import { DoodleFlower, DoodleHeart, DoodleSparkle, DoodleSquiggle, DoodleStar } from '../components/Doodles'

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
      <DoodleSparkle size={64} style={{ top: '12%', left: '9%', transform: 'rotate(-10deg)' }} />
      <DoodleStar size={44} style={{ top: '20%', left: '19%' }} />
      <DoodleHeart size={58} style={{ top: '14%', right: '10%', transform: 'rotate(12deg)' }} />
      <DoodleSquiggle size={84} style={{ top: '26%', right: '18%', transform: 'rotate(8deg)' }} />
      <DoodleFlower size={88} style={{ bottom: '18%', left: '8%' }} />
      <DoodleSparkle size={46} style={{ bottom: '24%', right: '12%' }} />

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
