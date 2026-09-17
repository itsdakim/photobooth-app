import { useAppStore } from '../state/useAppStore'

export default function AttractScreen(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setScreen = useAppStore((s) => s.setScreen)

  return (
    <div className="screen attract" onClick={() => setScreen('layoutSelect')}>
      <h1>📸 {settings.eventName}</h1>
      <p>Tap anywhere to start your photo session</p>
      <button className="btn primary tap-btn">Tap to Start</button>
      <button
        className="btn ghost gear"
        onClick={(e) => {
          e.stopPropagation()
          setScreen('settings')
        }}
      >
        ⚙ Settings
      </button>
    </div>
  )
}
