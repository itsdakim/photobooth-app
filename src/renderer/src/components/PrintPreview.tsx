import { useEffect, useRef, useState } from 'react'
import LayoutThumb from './LayoutThumb'
import type { LayoutTemplate } from '@shared/types'

/** Shows a layout the way it will look as an actual printed photo, scaled to
 *  fit whatever space its container has (so it grows/shrinks with the
 *  window) while preserving the layout's own aspect ratio — a 2x6 strip and
 *  a horizontal 4x6 both fit the same box without pushing surrounding UI
 *  around when switching between them. */
export default function PrintPreview({ layout }: { layout: LayoutTemplate }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function recompute(): void {
      const rect = el!.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setBox({ width: rect.width, height: rect.height })
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const canvasRatio = layout.canvasWidth / layout.canvasHeight
  let displayHeight = 420
  if (box) {
    const boxRatio = box.width / box.height
    displayHeight = canvasRatio > boxRatio ? box.width / canvasRatio : box.height
  }

  return (
    <div className="print-preview">
      <div className="print-preview-card" ref={containerRef}>
        <LayoutThumb layout={layout} displayHeight={displayHeight} />
      </div>
      <span className="print-preview-caption">{layout.paperSizeId.toUpperCase()} print preview</span>
    </div>
  )
}
