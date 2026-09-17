import { v4 as uuid } from 'uuid'
import type { LayoutTemplate } from '@shared/types'
import { PRINT_DPI } from '@shared/types'

function inches(v: number): number {
  return Math.round(v * PRINT_DPI)
}

function now(): string {
  return new Date().toISOString()
}

export function createDefaultLayouts(): LayoutTemplate[] {
  const timestamp = now()

  const strip2x6: LayoutTemplate = {
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
    textElements: [
      {
        id: uuid(),
        text: 'My Event',
        x: inches(0.15),
        y: inches(5.55),
        width: inches(1.7),
        fontFamily: 'Georgia, serif',
        fontSize: 34,
        color: '#222222',
        align: 'center',
        bold: true,
        italic: false,
        rotation: 0
      }
    ],
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
    textElements: [
      {
        id: uuid(),
        text: 'My Event',
        x: inches(0.2),
        y: inches(5.15),
        width: inches(3.6),
        fontFamily: 'Georgia, serif',
        fontSize: 40,
        color: '#222222',
        align: 'center',
        bold: true,
        italic: false,
        rotation: 0
      }
    ],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const single4x6: LayoutTemplate = {
    id: uuid(),
    name: 'Single Photo (4x6)',
    paperSizeId: '4x6',
    canvasWidth: inches(4),
    canvasHeight: inches(6),
    backgroundColor: '#ffffff',
    backgroundImage: null,
    slots: [
      {
        id: uuid(),
        x: inches(0.25),
        y: inches(0.25),
        width: inches(3.5),
        height: inches(4.9),
        rotation: 0
      }
    ],
    textElements: [
      {
        id: uuid(),
        text: 'My Event',
        x: inches(0.25),
        y: inches(5.3),
        width: inches(3.5),
        fontFamily: 'Georgia, serif',
        fontSize: 42,
        color: '#222222',
        align: 'center',
        bold: true,
        italic: false,
        rotation: 0
      }
    ],
    imageElements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return [strip2x6, grid4x6, single4x6]
}
