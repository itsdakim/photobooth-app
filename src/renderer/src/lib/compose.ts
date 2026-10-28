import type { LayoutTemplate } from '@shared/types'
import { toFileUrl } from './fileUrl'

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Draws `img` into the rect (x,y,w,h) using object-fit: cover semantics. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number
): void {
  const imgRatio = img.width / img.height
  const boxRatio = w / h
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height

  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / boxRatio
    sy = (img.height - sh) / 2
  }

  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Draws `img` fully visible inside the rect (object-fit: contain semantics). */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number
): void {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

/** Everything beneath the guest photos: background colour/image and backdrop designs. */
async function paintBackdrop(ctx: CanvasRenderingContext2D, layout: LayoutTemplate): Promise<void> {
  ctx.fillStyle = layout.backgroundColor
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight)

  if (layout.backgroundImage) {
    const bg = await loadImage(toFileUrl(layout.backgroundImage))
    drawCover(ctx, bg, 0, 0, layout.canvasWidth, layout.canvasHeight, 0)
  }

  // Backdrop designs sit beneath the guest photos
  await paintDecorativeImages(ctx, layout, true)
}

/** Everything above the guest photos: frames, logos, stickers, then text. */
async function paintOverlay(ctx: CanvasRenderingContext2D, layout: LayoutTemplate): Promise<void> {
  await paintDecorativeImages(ctx, layout, false)

  // Text — wrapped inside its box and aligned within it, matching the editor
  for (const t of layout.textElements) {
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.rotate((t.rotation * Math.PI) / 180)
    const weight = t.bold ? 'bold' : 'normal'
    const style = t.italic ? 'italic' : 'normal'
    ctx.font = `${style} ${weight} ${t.fontSize}px ${t.fontFamily}`
    ctx.fillStyle = t.color
    ctx.textAlign = t.align
    ctx.textBaseline = 'top'
    const anchorX = t.align === 'center' ? t.width / 2 : t.align === 'right' ? t.width : 0
    wrapText(ctx, t.text, anchorX, 0, t.width, t.fontSize * 1.2)
    ctx.restore()
  }
}

async function paintDecorativeImages(
  ctx: CanvasRenderingContext2D,
  layout: LayoutTemplate,
  behind: boolean
): Promise<void> {
  for (const el of layout.imageElements) {
    if (Boolean(el.behindPhotos) !== behind) continue
    const img = await loadImage(toFileUrl(el.src))
    ctx.save()
    ctx.globalAlpha = el.opacity
    drawContain(ctx, img, el.x, el.y, el.width, el.height, el.rotation)
    ctx.restore()
  }
}

export async function composeLayout(
  layout: LayoutTemplate,
  photoDataUrls: string[]
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = layout.canvasWidth
  canvas.height = layout.canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  await paintBackdrop(ctx, layout)

  // Photo slots
  for (let i = 0; i < layout.slots.length; i++) {
    const slot = layout.slots[i]
    const photoSrc = photoDataUrls[i]
    if (!photoSrc) continue
    const img = await loadImage(photoSrc)
    drawCover(ctx, img, slot.x, slot.y, slot.width, slot.height, slot.rotation)
  }

  await paintOverlay(ctx, layout)

  return canvas.toDataURL('image/png')
}

/**
 * Renders the static parts of a layout once, at `scale` of its print size, so
 * an animation can redraw only the photo slots between them: `base` goes under
 * the photos, `overlay` (transparent) goes over them.
 */
export async function renderLayoutLayers(
  layout: LayoutTemplate,
  scale: number
): Promise<{ base: HTMLCanvasElement; overlay: HTMLCanvasElement }> {
  const make = async (
    paint: (ctx: CanvasRenderingContext2D, layout: LayoutTemplate) => Promise<void>
  ): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(layout.canvasWidth * scale)
    canvas.height = Math.round(layout.canvasHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')
    ctx.scale(scale, scale)
    await paint(ctx, layout)
    return canvas
  }
  return { base: await make(paintBackdrop), overlay: await make(paintOverlay) }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ')
  let line = ''
  let curY = y
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, curY)
      line = word
      curY += lineHeight
    } else {
      line = testLine
    }
  }
  if (line) ctx.fillText(line, x, curY)
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
