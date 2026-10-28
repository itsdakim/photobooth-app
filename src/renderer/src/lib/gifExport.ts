// @ts-expect-error gif.js ships no types
import GIF from 'gif.js'
import type { LayoutTemplate } from '@shared/types'
import { drawCover, loadImage, renderLayoutLayers } from './compose'

/** Longest side of the exported GIF, in pixels — keeps the file phone-friendly. */
const GIF_MAX_SIDE = 720
/** Playback speed of the countdown recordings. */
const FRAME_DELAY_MS = 125
/** How long the loop rests on the finished photos before starting over. */
const END_HOLD_MS = 900

/**
 * Builds a looping GIF that looks like the finished print — same background,
 * frame design and text — but with each photo slot playing its own recording
 * of the countdown before that shot, all running at the same time and ending
 * on the photo itself.
 *
 * `clips[i]` is the ordered list of frames (data URLs) for slot `i`. Clips can
 * differ slightly in length, so every slot is stretched across one shared
 * timeline so they finish together.
 */
export async function buildLayoutGif(layout: LayoutTemplate, clips: string[][]): Promise<Blob> {
  const scale = Math.min(1, GIF_MAX_SIDE / Math.max(layout.canvasWidth, layout.canvasHeight))
  const width = Math.round(layout.canvasWidth * scale)
  const height = Math.round(layout.canvasHeight * scale)

  const { base, overlay } = await renderLayoutLayers(layout, scale)
  const decoded = await Promise.all(clips.map((clip) => Promise.all(clip.map(loadImage))))
  const frameCount = Math.max(1, ...decoded.map((c) => c.length))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  return new Promise<Blob>((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      repeat: 0, // loop forever
      workerScript: '/gif.worker.js'
    })

    for (let t = 0; t < frameCount; t++) {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(base, 0, 0)

      ctx.save()
      ctx.scale(scale, scale)
      layout.slots.forEach((slot, i) => {
        const frames = decoded[i]
        if (!frames || frames.length === 0) return
        const index = frameCount === 1 ? 0 : Math.round((t / (frameCount - 1)) * (frames.length - 1))
        drawCover(ctx, frames[index], slot.x, slot.y, slot.width, slot.height, slot.rotation)
      })
      ctx.restore()

      ctx.drawImage(overlay, 0, 0)
      gif.addFrame(ctx, { copy: true, delay: t === frameCount - 1 ? END_HOLD_MS : FRAME_DELAY_MS })
    }

    gif.on('finished', (blob: Blob) => resolve(blob))
    gif.on('abort', () => reject(new Error('GIF rendering was aborted')))
    gif.render()
  })
}
