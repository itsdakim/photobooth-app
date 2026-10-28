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
  /** draw beneath the guest photos (backdrops) instead of on top (frames, logos) */
  behindPhotos?: boolean
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
  /** the template previewed in setup and used when the event offers just one;
   *  always one of the ids in layoutIds */
  layoutId: string
  /** every template guests can pick from after pressing Start. Events saved
   *  before multi-template support won't have it — use eventLayoutIds(). */
  layoutIds?: string[]
  paperSizeId: string
  printQuantity: number
  countdownSeconds: number
  /** how many photos the booth takes per session; must be >= the chosen
   *  layout's slot count. Extra shots let the guest pick their favorites
   *  and assign them to slots instead of auto-filling in capture order. */
  shotsToCapture: number
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
  /** optional folder on this computer that also receives a copy of every
   *  finished photo and GIF, organized as <folder>/<event name>/Photos|GIFs */
  exportFolder: string | null
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
  shareServerPort: 8850,
  exportFolder: null
}

/** The folder name an event gets on disk: its name minus characters Windows and
 *  macOS don't allow in file names. Used for the optional save location. */
export function safeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'Untitled Event'
}

/** Folder names compare case-insensitively since Windows and macOS do too. */
function eventFolderKey(name: string): string {
  return safeFolderName(name).toLowerCase()
}

/** True when `name` would land in the same folder as one of `otherNames`. */
export function eventNameTaken(name: string, otherNames: string[]): boolean {
  const key = eventFolderKey(name)
  return otherNames.some((n) => eventFolderKey(n) === key)
}

/** `name` if it's free, otherwise "name 2", "name 3", … — the first one that is. */
export function uniqueEventName(name: string, otherNames: string[]): string {
  if (!eventNameTaken(name, otherNames)) return name
  let n = 2
  while (eventNameTaken(`${name} ${n}`, otherNames)) n++
  return `${name} ${n}`
}

/** The template ids an event offers, falling back to its single layoutId. */
export function eventLayoutIds(event: Pick<PhotoboothEvent, 'layoutId' | 'layoutIds'>): string[] {
  return event.layoutIds && event.layoutIds.length > 0 ? event.layoutIds : [event.layoutId]
}

/** The templates an event offers that still exist, in the order they were ticked. */
export function eventLayouts(
  event: Pick<PhotoboothEvent, 'layoutId' | 'layoutIds'>,
  layouts: LayoutTemplate[]
): LayoutTemplate[] {
  return eventLayoutIds(event)
    .map((id) => layouts.find((l) => l.id === id))
    .filter((l): l is LayoutTemplate => Boolean(l))
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

/**
 * The event as it applies to one session that picked `layout`. Shots and copies
 * are saved relative to the event's main template, so the guest keeps the same
 * number of extra shots to choose from, and print copies stay valid for the
 * chosen paper size (strips must be even).
 */
export function eventForLayout(
  event: PhotoboothEvent,
  layouts: LayoutTemplate[],
  layout: LayoutTemplate
): PhotoboothEvent {
  const baseSlots = layouts.find((l) => l.id === event.layoutId)?.slots.length ?? layout.slots.length
  const extraShots = Math.max(0, (event.shotsToCapture ?? baseSlots) - baseSlots)
  const printQuantity =
    isStripPaperSize(layout.paperSizeId) === isStripPaperSize(event.paperSizeId)
      ? clampPrintQuantity(event.printQuantity, layout.paperSizeId)
      : defaultPrintQuantityForPaperSize(layout.paperSizeId)
  return {
    ...event,
    layoutId: layout.id,
    paperSizeId: layout.paperSizeId,
    printQuantity,
    shotsToCapture: Math.min(20, layout.slots.length + extraShots)
  }
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
