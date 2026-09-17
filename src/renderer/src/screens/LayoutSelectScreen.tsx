import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import type { LayoutTemplate } from '@shared/types'

function LayoutThumb({ layout }: { layout: LayoutTemplate }): JSX.Element {
  const displayHeight = 220
  const scale = displayHeight / layout.canvasHeight
  const displayWidth = layout.canvasWidth * scale

  return (
    <div
      className="layout-thumb"
      style={{
        width: displayWidth,
        height: displayHeight,
        backgroundColor: layout.backgroundColor
      }}
    >
      {layout.backgroundImage && (
        <img
          src={toFileUrl(layout.backgroundImage)}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {layout.slots.map((slot, i) => (
        <div
          key={slot.id}
          className="slot"
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: slot.width * scale,
            height: slot.height * scale
          }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  )
}

export default function LayoutSelectScreen(): JSX.Element {
  const layouts = useAppStore((s) => s.layouts)
  const setScreen = useAppStore((s) => s.setScreen)
  const setActiveLayout = useAppStore((s) => s.setActiveLayout)

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen('attract')}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Choose a Layout</h2>
        <button className="btn ghost" onClick={() => setScreen('settings')}>
          ⚙ Manage Layouts
        </button>
      </div>
      <div className="content">
        <div className="layout-grid">
          {layouts.map((layout) => (
            <div
              key={layout.id}
              className="layout-card"
              onClick={() => {
                setActiveLayout(layout)
                setScreen('capture')
              }}
            >
              <LayoutThumb layout={layout} />
              <strong>{layout.name}</strong>
              <span style={{ color: '#9aa0ae', fontSize: 13 }}>
                {layout.slots.length} photo{layout.slots.length > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
        {layouts.length === 0 && <p>No layouts yet. Go to Settings to create one.</p>}
      </div>
    </div>
  )
}
