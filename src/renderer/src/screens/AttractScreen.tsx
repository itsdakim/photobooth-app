import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'

export default function AttractScreen(): JSX.Element {
  const activeEvent = useAppStore((s) => s.activeEvent)
  const setScreen = useAppStore((s) => s.setScreen)

  useEffect(() => {
    if (!activeEvent) setScreen('home')
  }, [activeEvent, setScreen])

  if (!activeEvent) return <div className="screen attract" />

  return (
    <div className="screen attract" onClick={() => setScreen('capture')}>
      <h1>📸 {activeEvent.name}</h1>
      <p>Tap anywhere to start your photo session</p>
      <button className="btn primary tap-btn">Tap to Start</button>
      <button
        className="btn ghost gear"
        title="Exit to Home (staff only)"
        onClick={(e) => {
          e.stopPropagation()
          setScreen('home')
        }}
      >
        🏠
      </button>
    </div>
  )
}
