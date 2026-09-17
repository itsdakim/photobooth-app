import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import { PAPER_SIZES, PRINT_DPI } from '@shared/types'
import type { LayoutTemplate, PhotoSlot, TextElement, ImageElement } from '@shared/types'

type Selected = { type: 'slot' | 'text' | 'image'; id: string } | null

const DISPLAY_WIDTH = 420

function inToPx(v: number): number {
  return Math.round(v * PRINT_DPI)
}
function pxToIn(v: number): number {
  return Math.round((v / PRINT_DPI) * 100) / 100
}

export default function LayoutEditorScreen(): JSX.Element {
  const storeLayout = useAppStore((s) => s.editingLayout)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setScreen = useAppStore((s) => s.setScreen)
  const returnScreen = useAppStore((s) => s.layoutEditorReturnScreen)

  const [layout, setLayout] = useState<LayoutTemplate>(
    storeLayout ?? {
      id: uuid(),
      name: 'New Layout',
      paperSizeId: '4x6',
      canvasWidth: inToPx(4),
      canvasHeight: inToPx(6),
      backgroundColor: '#ffffff',
      backgroundImage: null,
      slots: [],
      textElements: [],
      imageElements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  )
  const [selected, setSelected] = useState<Selected>(null)

  const dragRef = useRef<{
    id: string
    type: 'slot' | 'text' | 'image'
    startPointerX: number
    startPointerY: number
    origX: number
    origY: number
  } | null>(null)

  const scale = DISPLAY_WIDTH / layout.canvasWidth
  const displayHeight = layout.canvasHeight * scale

  function updateLayout(patch: Partial<LayoutTemplate>): void {
    setLayout((l) => ({ ...l, ...patch, updatedAt: new Date().toISOString() }))
  }

  function updateSlot(id: string, patch: Partial<PhotoSlot>): void {
    setLayout((l) => ({ ...l, slots: l.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }
  function updateText(id: string, patch: Partial<TextElement>): void {
    setLayout((l) => ({
      ...l,
      textElements: l.textElements.map((t) => (t.id === id ? { ...t, ...patch } : t))
    }))
  }
  function updateImageEl(id: string, patch: Partial<ImageElement>): void {
    setLayout((l) => ({
      ...l,
      imageElements: l.imageElements.map((im) => (im.id === id ? { ...im, ...patch } : im))
    }))
  }

  function onDragStart(
    e: ReactPointerEvent,
    type: 'slot' | 'text' | 'image',
    id: string,
    x: number,
    y: number
  ): void {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { id, type, startPointerX: e.clientX, startPointerY: e.clientY, origX: x, origY: y }
    setSelected({ type, id })
  }

  function onDragMove(e: ReactPointerEvent): void {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.startPointerX) / scale
    const dy = (e.clientY - d.startPointerY) / scale
    const newX = Math.round(d.origX + dx)
    const newY = Math.round(d.origY + dy)
    if (d.type === 'slot') updateSlot(d.id, { x: newX, y: newY })
    if (d.type === 'text') updateText(d.id, { x: newX, y: newY })
    if (d.type === 'image') updateImageEl(d.id, { x: newX, y: newY })
  }

  function onDragEnd(): void {
    dragRef.current = null
  }

  function addSlot(): void {
    const slot: PhotoSlot = {
      id: uuid(),
      x: Math.round(layout.canvasWidth * 0.25),
      y: Math.round(layout.canvasHeight * 0.25),
      width: Math.round(layout.canvasWidth * 0.5),
      height: Math.round(layout.canvasHeight * 0.3),
      rotation: 0
    }
    setLayout((l) => ({ ...l, slots: [...l.slots, slot] }))
    setSelected({ type: 'slot', id: slot.id })
  }

  function addText(): void {
    const t: TextElement = {
      id: uuid(),
      text: 'Your Text',
      x: Math.round(layout.canvasWidth * 0.1),
      y: Math.round(layout.canvasHeight * 0.85),
      width: Math.round(layout.canvasWidth * 0.8),
      fontFamily: 'Georgia, serif',
      fontSize: 32,
      color: '#222222',
      align: 'center',
      bold: true,
      italic: false,
      rotation: 0
    }
    setLayout((l) => ({ ...l, textElements: [...l.textElements, t] }))
    setSelected({ type: 'text', id: t.id })
  }

  async function addImage(): Promise<void> {
    const path = await window.api.pickImage()
    if (!path) return
    const im: ImageElement = {
      id: uuid(),
      src: path,
      x: Math.round(layout.canvasWidth * 0.35),
      y: Math.round(layout.canvasHeight * 0.05),
      width: Math.round(layout.canvasWidth * 0.3),
      height: Math.round(layout.canvasWidth * 0.3),
      rotation: 0,
      opacity: 1
    }
    setLayout((l) => ({ ...l, imageElements: [...l.imageElements, im] }))
    setSelected({ type: 'image', id: im.id })
  }

  function deleteSelected(): void {
    if (!selected) return
    if (selected.type === 'slot')
      setLayout((l) => ({ ...l, slots: l.slots.filter((s) => s.id !== selected.id) }))
    if (selected.type === 'text')
      setLayout((l) => ({ ...l, textElements: l.textElements.filter((t) => t.id !== selected.id) }))
    if (selected.type === 'image')
      setLayout((l) => ({ ...l, imageElements: l.imageElements.filter((im) => im.id !== selected.id) }))
    setSelected(null)
  }

  async function pickBackgroundImage(): Promise<void> {
    const path = await window.api.pickImage()
    if (path) updateLayout({ backgroundImage: path })
  }

  function changePaperSize(paperSizeId: string): void {
    const paper = PAPER_SIZES.find((p) => p.id === paperSizeId) ?? PAPER_SIZES[1]
    updateLayout({
      paperSizeId,
      canvasWidth: inToPx(paper.widthIn),
      canvasHeight: inToPx(paper.heightIn)
    })
  }

  async function save(): Promise<void> {
    await window.api.saveLayout(layout)
    setLayouts(await window.api.listLayouts())
    setScreen(returnScreen)
  }

  const selectedSlot = selected?.type === 'slot' ? layout.slots.find((s) => s.id === selected.id) : null
  const selectedText =
    selected?.type === 'text' ? layout.textElements.find((t) => t.id === selected.id) : null
  const selectedImage =
    selected?.type === 'image' ? layout.imageElements.find((im) => im.id === selected.id) : null

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn secondary" onClick={() => setScreen(returnScreen)}>
          ← Cancel
        </button>
        <input
          value={layout.name}
          onChange={(e) => updateLayout({ name: e.target.value })}
          style={{ fontSize: 18, fontWeight: 600, width: 280, textAlign: 'center' }}
        />
        <button className="btn primary" onClick={save}>
          Save Layout
        </button>
      </div>
      <div className="content">
        <div className="editor-layout">
          <div className="editor-canvas-wrap">
            <div
              className="editor-canvas"
              style={{
                width: DISPLAY_WIDTH,
                height: displayHeight,
                backgroundColor: layout.backgroundColor
              }}
              onClick={() => setSelected(null)}
            >
              {layout.backgroundImage && <img className="bg" src={toFileUrl(layout.backgroundImage)} alt="" />}

              {layout.slots.map((slot, i) => (
                <div
                  key={slot.id}
                  className={`editor-element slot ${selected?.id === slot.id ? 'selected' : ''}`}
                  style={{
                    left: slot.x * scale,
                    top: slot.y * scale,
                    width: slot.width * scale,
                    height: slot.height * scale,
                    transform: `rotate(${slot.rotation}deg)`
                  }}
                  onPointerDown={(e) => onDragStart(e, 'slot', slot.id, slot.x, slot.y)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                >
                  Photo {i + 1}
                </div>
              ))}

              {layout.imageElements.map((im) => (
                <img
                  key={im.id}
                  src={toFileUrl(im.src)}
                  className={`editor-element ${selected?.id === im.id ? 'selected' : ''}`}
                  style={{
                    left: im.x * scale,
                    top: im.y * scale,
                    width: im.width * scale,
                    height: im.height * scale,
                    opacity: im.opacity,
                    transform: `rotate(${im.rotation}deg)`,
                    objectFit: 'contain'
                  }}
                  onPointerDown={(e) => onDragStart(e, 'image', im.id, im.x, im.y)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                />
              ))}

              {layout.textElements.map((t) => (
                <div
                  key={t.id}
                  className={`editor-element ${selected?.id === t.id ? 'selected' : ''}`}
                  style={{
                    left: t.x * scale,
                    top: t.y * scale,
                    width: t.width * scale,
                    fontFamily: t.fontFamily,
                    fontSize: t.fontSize * scale,
                    color: t.color,
                    fontWeight: t.bold ? 'bold' : 'normal',
                    fontStyle: t.italic ? 'italic' : 'normal',
                    textAlign: t.align,
                    transform: `rotate(${t.rotation}deg)`
                  }}
                  onPointerDown={(e) => onDragStart(e, 'text', t.id, t.x, t.y)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                >
                  {t.text}
                </div>
              ))}
            </div>
          </div>

          <div className="editor-panel">
            <div className="panel-section">
              <h3>Paper &amp; Background</h3>
              <div className="field">
                <label>Paper size</label>
                <select value={layout.paperSizeId} onChange={(e) => changePaperSize(e.target.value)}>
                  {PAPER_SIZES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Background color</label>
                <input
                  className="color-swatch"
                  type="color"
                  value={layout.backgroundColor}
                  onChange={(e) => updateLayout({ backgroundColor: e.target.value })}
                />
              </div>
              <div className="row">
                <button className="btn secondary" onClick={pickBackgroundImage}>
                  Upload Background
                </button>
                {layout.backgroundImage && (
                  <button className="btn ghost" onClick={() => updateLayout({ backgroundImage: null })}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="panel-section">
              <h3>Photo Slots ({layout.slots.length})</h3>
              {layout.slots.map((s, i) => (
                <div
                  key={s.id}
                  className={`element-list-item ${selected?.id === s.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'slot', id: s.id })}
                >
                  <span>Photo {i + 1}</span>
                </div>
              ))}
              <button className="btn secondary" onClick={addSlot}>
                + Add Slot
              </button>
            </div>

            <div className="panel-section">
              <h3>Text</h3>
              {layout.textElements.map((t) => (
                <div
                  key={t.id}
                  className={`element-list-item ${selected?.id === t.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'text', id: t.id })}
                >
                  <span>{t.text.slice(0, 20) || '(empty)'}</span>
                </div>
              ))}
              <button className="btn secondary" onClick={addText}>
                + Add Text
              </button>
            </div>

            <div className="panel-section">
              <h3>Images / Logos</h3>
              {layout.imageElements.map((im, i) => (
                <div
                  key={im.id}
                  className={`element-list-item ${selected?.id === im.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'image', id: im.id })}
                >
                  <span>Image {i + 1}</span>
                </div>
              ))}
              <button className="btn secondary" onClick={addImage}>
                + Add Image
              </button>
            </div>

            {selected && (
              <div className="panel-section">
                <h3>Selected Element</h3>
                <button className="btn ghost" onClick={deleteSelected}>
                  🗑 Delete
                </button>

                {selectedSlot && (
                  <>
                    <div className="row">
                      <div className="field">
                        <label>X (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedSlot.x)}
                          onChange={(e) => updateSlot(selectedSlot.id, { x: inToPx(Number(e.target.value)) })}
                        />
                      </div>
                      <div className="field">
                        <label>Y (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedSlot.y)}
                          onChange={(e) => updateSlot(selectedSlot.id, { y: inToPx(Number(e.target.value)) })}
                        />
                      </div>
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Width (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedSlot.width)}
                          onChange={(e) =>
                            updateSlot(selectedSlot.id, { width: inToPx(Number(e.target.value)) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Height (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedSlot.height)}
                          onChange={(e) =>
                            updateSlot(selectedSlot.id, { height: inToPx(Number(e.target.value)) })
                          }
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Rotation (deg)</label>
                      <input
                        type="number"
                        value={selectedSlot.rotation}
                        onChange={(e) => updateSlot(selectedSlot.id, { rotation: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}

                {selectedText && (
                  <>
                    <div className="field">
                      <label>Text</label>
                      <textarea
                        value={selectedText.text}
                        onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
                      />
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Font size</label>
                        <input
                          type="number"
                          value={selectedText.fontSize}
                          onChange={(e) =>
                            updateText(selectedText.id, { fontSize: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Color</label>
                        <input
                          className="color-swatch"
                          type="color"
                          value={selectedText.color}
                          onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Alignment</label>
                      <select
                        value={selectedText.align}
                        onChange={(e) =>
                          updateText(selectedText.id, {
                            align: e.target.value as TextElement['align']
                          })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                    <div className="row">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedText.bold}
                          onChange={(e) => updateText(selectedText.id, { bold: e.target.checked })}
                        />{' '}
                        Bold
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedText.italic}
                          onChange={(e) => updateText(selectedText.id, { italic: e.target.checked })}
                        />{' '}
                        Italic
                      </label>
                    </div>
                  </>
                )}

                {selectedImage && (
                  <>
                    <div className="row">
                      <div className="field">
                        <label>Width (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedImage.width)}
                          onChange={(e) =>
                            updateImageEl(selectedImage.id, { width: inToPx(Number(e.target.value)) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Height (in)</label>
                        <input
                          type="number"
                          step={0.05}
                          value={pxToIn(selectedImage.height)}
                          onChange={(e) =>
                            updateImageEl(selectedImage.id, { height: inToPx(Number(e.target.value)) })
                          }
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Opacity</label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedImage.opacity}
                        onChange={(e) =>
                          updateImageEl(selectedImage.id, { opacity: Number(e.target.value) })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
