// Shared types used by both the main process and the renderer.

/** A single photo slot inside a layout template, in canvas pixel coordinates. */
export interface PhotoSlot {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number // degrees
}

export interface TextElement {
  id: string
  text: string
  x: number
  y: number
  width: number
  fontFamily: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  bold: boolean
  italic: boolean
  rotation: number
}

export interface ImageElement {
  id: string
  /** absolute file path or data URL */
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

/** Standard DNP-compatible print media sizes, in inches. */
export interface PaperSize {
  id: string
  label: string
  widthIn: number
  heightIn: number
}

export const PAPER_SIZES: PaperSize[] = [
  { id: '2x6', label: '2x6 in Photo Strip', widthIn: 2, heightIn: 6 },
  { id: '4x6', label: '4x6 in', widthIn: 4, heightIn: 6 },
  { id: '5x7', label: '5x7 in', widthIn: 5, heightIn: 7 },
  { id: '6x8', label: '6x8 in', widthIn: 6, heightIn: 8 },
  { id: '6x9', label: '6x9 in', widthIn: 6, heightIn: 9 }
]

export const PRINT_DPI = 300

export interface LayoutTemplate {
  id: string
  name: string
  paperSizeId: string
  /** canvas size in pixels, derived from paper size * DPI, but stored for convenience */
  canvasWidth: number
  canvasHeight: number
  backgroundColor: string
  /** absolute file path or data URL to a background image, if any */
  backgroundImage: string | null
  slots: PhotoSlot[]
  textElements: TextElement[]
  imageElements: ImageElement[]
  createdAt: string
  updatedAt: string
}

/**
 * An Event is the top-level container a photographer sets up once per gig
 * (wedding, party, corporate function). It pins down the branding/layout and
 * booth defaults for every guest session that happens under it, and its id
 * is the folder every one of those sessions' photos gets saved into.
 */
export interface PhotoboothEvent {
  id: string
  name: string
  layoutId: string
  paperSizeId: string
  printQuantity: number
  countdownSeconds: number
  createdAt: string
  updatedAt: string
}

export interface PhotoboothSession {
  id: string
  eventId: string
  layoutId: string
  eventName: string
  createdAt: string
  /** file paths (absolute) to each raw captured photo, in slot order */
  rawPhotoPaths: string[]
  /** absolute file path to the final composed print-ready image */
  composedImagePath: string | null
  /** absolute file path to the exported animated GIF, if generated */
  gifPath: string | null
  printCount: number
}

export interface PrinterInfo {
  name: string
  displayName: string
  description: string
  isDefault: boolean
}

export interface AppSettings {
  /** the photobooth operator's own business name, shown on the Home screen */
  businessName: string
  defaultLayoutId: string | null
  selectedPrinterName: string | null
  paperSizeId: string
  /** default countdown (seconds) applied to newly created events */
  countdownSeconds: number
  shotsPerSession: number
  cameraDeviceId: string | null
  shareServerEnabled: boolean
  shareServerPort: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: '',
  defaultLayoutId: null,
  selectedPrinterName: null,
  paperSizeId: '4x6',
  countdownSeconds: 5,
  shotsPerSession: 3,
  cameraDeviceId: null,
  shareServerEnabled: true,
  shareServerPort: 8850
}

/** Photo strips (2x6) default to 2 copies; every other format defaults to 1. */
export function defaultPrintQuantityForPaperSize(paperSizeId: string): number {
  return paperSizeId === '2x6' ? 2 : 1
}

/** Strips print two-up on a larger sheet and get cut apart, so their copy
 *  count must stay even; full-size prints (4x6 and up) allow any count. */
export function isStripPaperSize(paperSizeId: string): boolean {
  return paperSizeId === '2x6'
}

const MAX_PRINT_QUANTITY = 20

export function clampPrintQuantity(value: number, paperSizeId: string): number {
  const min = isStripPaperSize(paperSizeId) ? 2 : 1
  let clamped = Math.max(min, Math.min(MAX_PRINT_QUANTITY, Math.round(value)))
  if (isStripPaperSize(paperSizeId) && clamped % 2 !== 0) {
    clamped = clamped + 1 <= MAX_PRINT_QUANTITY ? clamped + 1 : clamped - 1
  }
  return clamped
}

export interface PrintJobOptions {
  imagePath: string
  printerName: string
  /** actual page dimensions to print at, in inches — taken from the layout's
   *  own canvas so landscape layouts (e.g. a horizontal 4x6) print correctly
   *  instead of being forced into the paper size's default orientation */
  widthIn: number
  heightIn: number
  copies: number
}

export interface PrintJobResult {
  success: boolean
  error?: string
}
