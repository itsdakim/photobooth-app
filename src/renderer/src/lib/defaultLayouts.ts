import { v4 as uuid } from 'uuid'
import type { LayoutTemplate } from '@shared/types'
import { PAPER_SIZES, PRINT_DPI } from '@shared/types'

function inches(v: number): number {
  return Math.round(v * PRINT_DPI)
}

function now(): string {
  return new Date().toISOString()
}

/** A minimal single-photo layout for a given paper size, used as the
 *  starting point when someone creates a brand new layout template. */
export function createBlankLayout(paperSizeId: string): LayoutTemplate {
  const paper = PAPER_SIZES.find((p) => p.id === paperSizeId) ?? PAPER_SIZES[1]
  const timestamp = now()
  return {
    id: uuid(),
    name: 'New Layout',
    paperSizeId: paper.id,
    canvasWidth: inches(paper.widthIn),
    canvasHeight: inches(paper.heightIn),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [
      {
        id: uuid(),
        x: inches(0.25),
        y: inches(0.25),
        width: inches(paper.widthIn - 0.5),
        height: inches(paper.heightIn - 1),
        rotation: 0
      }
    ],
    textElements: [],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function textEl(text: string, x: number, y: number, width: number, fontSize: number): LayoutTemplate['textElements'][number] {
  return {
    id: uuid(),
    text,
    x,
    y,
    width,
    fontFamily: 'Georgia, serif',
    fontSize,
    color: '#222222',
    align: 'center',
    bold: true,
    italic: false,
    rotation: 0
  }
}

/**
 * The photobooth's built-in catalog: one entry per physical print format we
 * support out of the box. Seeded once by name (see App.tsx boot), so re-runs
 * never create duplicates — editing or deleting one is a normal layout edit.
 */
export function createDefaultLayouts(): LayoutTemplate[] {
  const timestamp = now()

  const strip3x2x6: LayoutTemplate = {
    id: uuid(),
    name: 'Classic Strip (3 photos, 2x6)',
    paperSizeId: '2x6',
    canvasWidth: inches(2),
    canvasHeight: inches(6),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [0, 1, 2].map((i) => ({
      id: uuid(),
      x: inches(0.15),
      y: inches(0.15 + i * 1.73),
      width: inches(1.7),
      height: inches(1.6),
      rotation: 0
    })),
    textElements: [textEl('My Event', inches(0.15), inches(5.55), inches(1.7), 34)],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const strip4x2x6: LayoutTemplate = {
    id: uuid(),
    name: 'Classic Strip (4 photos, 2x6)',
    paperSizeId: '2x6',
    canvasWidth: inches(2),
    canvasHeight: inches(6),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [0, 1, 2, 3].map((i) => ({
      id: uuid(),
      x: inches(0.15),
      y: inches(0.15 + i * 1.37),
      width: inches(1.7),
      height: inches(1.29),
      rotation: 0
    })),
    textElements: [textEl('My Event', inches(0.15), inches(5.55), inches(1.7), 30)],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const grid4x6: LayoutTemplate = {
    id: uuid(),
    name: 'Grid (4 photos, 4x6)',
    paperSizeId: '4x6',
    canvasWidth: inches(4),
    canvasHeight: inches(6),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [0, 1, 2, 3].map((i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      return {
        id: uuid(),
        x: inches(0.2 + col * 1.9),
        y: inches(0.2 + row * 2.45),
        width: inches(1.8),
        height: inches(2.3),
        rotation: 0
      }
    }),
    textElements: [textEl('My Event', inches(0.2), inches(5.15), inches(3.6), 40)],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const singleVertical4x6: LayoutTemplate = {
    id: uuid(),
    name: 'Single Photo Vertical (4x6)',
    paperSizeId: '4x6',
    canvasWidth: inches(4),
    canvasHeight: inches(6),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [
      { id: uuid(), x: inches(0.25), y: inches(0.25), width: inches(3.5), height: inches(4.9), rotation: 0 }
    ],
    textElements: [textEl('My Event', inches(0.25), inches(5.3), inches(3.5), 42)],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const singleHorizontal4x6: LayoutTemplate = {
    id: uuid(),
    name: 'Single Photo Horizontal (4x6)',
    paperSizeId: '4x6',
    // Landscape orientation: the canvas is wider than it is tall, printed
    // sideways on the same 4x6 media.
    canvasWidth: inches(6),
    canvasHeight: inches(4),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [
      { id: uuid(), x: inches(0.25), y: inches(0.25), width: inches(5.5), height: inches(3.05), rotation: 0 }
    ],
    textElements: [textEl('My Event', inches(0.25), inches(3.4), inches(5.5), 36)],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return [strip3x2x6, strip4x2x6, grid4x6, singleVertical4x6, singleHorizontal4x6]
}
