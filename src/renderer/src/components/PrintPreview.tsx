import LayoutThumb from './LayoutThumb'
import type { LayoutTemplate } from '@shared/types'

/** Shows a layout the way it will look as an actual printed photo: a white
 *  paper-stock border, sized to fit within a fixed bounding box regardless
 *  of the layout's own aspect ratio (a 2x6 strip and a horizontal 4x6 both
 *  scale to fit the same box), so switching layouts never resizes the card
 *  itself or pushes surrounding UI around. */
export default function PrintPreview({
  layout,
  maxWidth = 340,
  maxHeight = 480
}: {
  layout: LayoutTemplate
  maxWidth?: number
  maxHeight?: number
}): JSX.Element {
  const boxRatio = maxWidth / maxHeight
  const canvasRatio = layout.canvasWidth / layout.canvasHeight
  const displayHeight = canvasRatio > boxRatio ? maxWidth / canvasRatio : maxHeight

  return (
    <div className="print-preview">
      <div className="print-preview-card" style={{ width: maxWidth, height: maxHeight }}>
        <LayoutThumb layout={layout} displayHeight={displayHeight} />
      </div>
      <span className="print-preview-caption">{layout.paperSizeId.toUpperCase()} print preview</span>
    </div>
  )
}
