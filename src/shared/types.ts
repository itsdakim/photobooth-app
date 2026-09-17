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

export interface PhotoboothSession {
  id: string
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
  eventName: string
  defaultLayoutId: string | null
  selectedPrinterName: string | null
  paperSizeId: string
  defaultPrintQuantity: number
  countdownSeconds: number
  shotsPerSession: number
  cameraDeviceId: string | null
  shareServerEnabled: boolean
  shareServerPort: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  eventName: 'My Event',
  defaultLayoutId: null,
  selectedPrinterName: null,
  paperSizeId: '4x6',
  defaultPrintQuantity: 1,
  countdownSeconds: 3,
  shotsPerSession: 3,
  cameraDeviceId: null,
  shareServerEnabled: true,
  shareServerPort: 8850
}

export interface PrintJobOptions {
  imagePath: string
  printerName: string
  paperSizeId: string
  copies: number
}

export interface PrintJobResult {
  success: boolean
  error?: string
}
