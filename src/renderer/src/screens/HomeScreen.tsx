import { useAppStore } from '../state/useAppStore'

export default function HomeScreen(): JSX.Element {
  const setScreen = useAppStore((s) => s.setScreen)
  const activeEvent = useAppStore((s) => s.activeEvent)

  return (
    <div className="screen home">
      <div className="home-hero">
        <h1>📸 Photobooth</h1>
        <p>Set up your booth, then let guests take it from there.</p>
      </div>

      <div className="home-grid">
        <div className="home-card" onClick={() => setScreen('eventList')}>
          <div className="home-card-icon">🎪</div>
          <h2>Events</h2>
          <p>Create a new event or resume one — each event keeps its own photos, layout, and branding.</p>
        </div>
        <div
          className="home-card"
          onClick={() => {
            useAppStore.getState().setEditingLayout(null)
            setScreen('settings')
          }}
        >
          <div className="home-card-icon">⚙</div>
          <h2>Photobooth Setup</h2>
          <p>Printer, camera, and layout template library — shared across all events.</p>
        </div>
      </div>

      {activeEvent && (
        <button className="btn primary resume-btn" onClick={() => setScreen('attract')}>
          ▶ Resume "{activeEvent.name}"
        </button>
      )}
    </div>
  )
}
