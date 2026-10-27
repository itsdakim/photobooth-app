import { toFileUrl } from '../lib/fileUrl'
import type { LayoutTemplate } from '@shared/types'

/** Renders a scaled-down, non-interactive preview of a layout template:
 *  background, photo slot placeholders, text, and logo images — used for
 *  layout pickers and the event-setup print preview. */
export default function LayoutThumb({
  layout,
  displayHeight = 220
}: {
  layout: LayoutTemplate
  displayHeight?: number
}): JSX.Element {
  const scale = displayHeight / layout.canvasHeight
  const displayWidth = layout.canvasWidth * scale

  function renderImages(behind: boolean): JSX.Element[] {
    return layout.imageElements
      .filter((im) => Boolean(im.behindPhotos) === behind)
      .map((im) => (
        <img
          key={im.id}
          src={toFileUrl(im.src)}
          alt=""
          style={{
            position: 'absolute',
            left: im.x * scale,
            top: im.y * scale,
            width: im.width * scale,
            height: im.height * scale,
            opacity: im.opacity,
            transform: `rotate(${im.rotation}deg)`,
            objectFit: 'contain'
          }}
        />
      ))
  }

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
      {renderImages(true)}
      {layout.slots.map((slot, i) => (
        <div
          key={slot.id}
          className="slot"
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: slot.width * scale,
            height: slot.height * scale,
            transform: `rotate(${slot.rotation}deg)`
          }}
        >
          {i + 1}
        </div>
      ))}
      {renderImages(false)}
      {layout.textElements.map((t) => (
        <div
          key={t.id}
          style={{
            position: 'absolute',
            left: t.x * scale,
            top: t.y * scale,
            width: t.width * scale,
            fontFamily: t.fontFamily,
            fontSize: t.fontSize * scale,
            color: t.color,
            fontWeight: t.bold ? 'bold' : 'normal',
            fontStyle: t.italic ? 'italic' : 'normal',
            textAlign: t.align,
            transform: `rotate(${t.rotation}deg)`,
            lineHeight: 1.2
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
