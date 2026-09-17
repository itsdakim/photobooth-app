import LayoutThumb from './LayoutThumb'
import type { LayoutTemplate } from '@shared/types'

/** Shows a layout the way it will look as an actual printed photo: a white
 *  paper-stock border and a soft drop shadow, sized to the layout's real
 *  paper aspect ratio (defaults to a standard 4x6 print height). */
export default function PrintPreview({
  layout,
  height = 420
}: {
  layout: LayoutTemplate
  height?: number
}): JSX.Element {
  return (
    <div className="print-preview">
      <div className="print-preview-card">
        <LayoutThumb layout={layout} displayHeight={height} />
      </div>
      <span className="print-preview-caption">{layout.paperSizeId.toUpperCase()} print preview</span>
    </div>
  )
}
