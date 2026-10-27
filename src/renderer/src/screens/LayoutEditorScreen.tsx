import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import { toFileUrl } from '../lib/fileUrl'
import { PAPER_SIZES, PRINT_DPI } from '@shared/types'
import type { LayoutTemplate, PhotoSlot, TextElement, ImageElement } from '@shared/types'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconCopy,
  IconImage,
  IconPlus,
  IconRedo,
  IconTrash,
  IconUndo,
  IconUpload
} from '../components/Icon'

type ElementType = 'slot' | 'text' | 'image'
type Sel = { type: ElementType; id: string }
type Rect = { x: number; y: number; width: number; height: number; rotation: number }

// `recorded` flips once the pointer actually moves, so a plain click that only
// selects an element never lands on the undo stack or marks the page dirty.
type Gesture =
  | { kind: 'move'; recorded: boolean; sel: Sel; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'resize'
      recorded: boolean
      sel: Sel
      sx: number
      sy: number
      startX: number
      startY: number
      orig: Rect
      lockAspect: boolean
    }

const HANDLES = [
  { id: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize' },
  { id: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize' },
  { id: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize' },
  { id: 'se', sx: 1, sy: 1, cursor: 'nwse-resize' }
]

const FONTS = [
  { label: 'Bricolage Grotesque', value: "'Bricolage Grotesque', sans-serif" },
  { label: 'Work Sans', value: "'Work Sans', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Brush Script', value: "'Brush Script MT', cursive" }
]

const MIN_SIZE = 40
const HISTORY_LIMIT = 60

function inToPx(v: number): number {
  return Math.round(v * PRINT_DPI)
}
function pxToIn(v: number): number {
  return Math.round((v / PRINT_DPI) * 100) / 100
}

function canvasSizeFor(paperSizeId: string, landscape: boolean): { width: number; height: number } {
  const paper = PAPER_SIZES.find((p) => p.id === paperSizeId) ?? PAPER_SIZES[1]
  const short = inToPx(Math.min(paper.widthIn, paper.heightIn))
  const long = inToPx(Math.max(paper.widthIn, paper.heightIn))
  return landscape ? { width: long, height: short } : { width: short, height: long }
}

function loadNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 1, height: 1 })
    img.src = toFileUrl(src)
  })
}

function NumField({
  label,
  px,
  onFocus,
  onChange
}: {
  label: string
  px: number
  onFocus: () => void
  onChange: (px: number) => void
}): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={0.05}
        value={pxToIn(px)}
        onFocus={onFocus}
        onChange={(e) => onChange(inToPx(Number(e.target.value)))}
      />
    </div>
  )
}

export default function LayoutEditorScreen(): JSX.Element {
  const storeLayout = useAppStore((s) => s.editingLayout)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const setScreen = useAppStore((s) => s.setScreen)
  const returnScreen = useAppStore((s) => s.layoutEditorReturnScreen)

  const [layout, setLayout] = useState<LayoutTemplate>(
    () =>
      storeLayout ?? {
        id: uuid(),
        name: 'New Template',
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
  const [selected, setSelected] = useState<Sel | null>(null)
  const [past, setPast] = useState<LayoutTemplate[]>([])
  const [future, setFuture] = useState<LayoutTemplate[]>([])
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<{ width: number; height: number } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const pastRef = useRef(past)
  pastRef.current = past
  const futureRef = useRef(future)
  futureRef.current = future

  // Fit the canvas to whatever space the window gives the editor.
  const ratio = layout.canvasWidth / layout.canvasHeight
  let displayWidth = 420
  if (view) {
    const availW = Math.max(120, view.width - 64)
    const availH = Math.max(120, view.height - 64)
    displayWidth = ratio > availW / availH ? availW : availH * ratio
  }
  const displayHeight = displayWidth / ratio
  const scale = displayWidth / layout.canvasWidth
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function measure(): void {
      const r = el!.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setView({ width: r.width, height: r.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ---- history -----------------------------------------------------------
  function beginEdit(): void {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), layoutRef.current])
    setFuture([])
  }

  function undo(): void {
    const stack = pastRef.current
    if (stack.length === 0) return
    setFuture((f) => [layoutRef.current, ...f])
    setPast(stack.slice(0, -1))
    setLayout(stack[stack.length - 1])
    setSelected(null)
  }

  function redo(): void {
    const stack = futureRef.current
    if (stack.length === 0) return
    setPast((p) => [...p, layoutRef.current])
    setFuture(stack.slice(1))
    setLayout(stack[0])
    setSelected(null)
  }

  /** Apply a discrete change (button click, selection toggle) as one undo step. */
  function edit(fn: (l: LayoutTemplate) => LayoutTemplate): void {
    beginEdit()
    setLayout((l) => ({ ...fn(l), updatedAt: new Date().toISOString() }))
  }

  /** Apply a change that continues an already-recorded edit (typing, dragging). */
  function live(fn: (l: LayoutTemplate) => LayoutTemplate): void {
    setLayout((l) => ({ ...fn(l), updatedAt: new Date().toISOString() }))
  }

  function patchSlot(id: string, patch: Partial<PhotoSlot>): void {
    live((l) => ({ ...l, slots: l.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }
  function patchText(id: string, patch: Partial<TextElement>): void {
    live((l) => ({ ...l, textElements: l.textElements.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  }
  function patchImage(id: string, patch: Partial<ImageElement>): void {
    live((l) => ({ ...l, imageElements: l.imageElements.map((im) => (im.id === id ? { ...im, ...patch } : im)) }))
  }

  function applyRect(sel: Sel, r: Partial<Rect>): void {
    if (sel.type === 'slot') patchSlot(sel.id, r)
    else if (sel.type === 'image') patchImage(sel.id, r)
    else {
      const patch: Partial<TextElement> = {}
      if (r.x !== undefined) patch.x = r.x
      if (r.y !== undefined) patch.y = r.y
      if (r.width !== undefined) patch.width = r.width
      patchText(sel.id, patch)
    }
  }

  // ---- drag / resize -----------------------------------------------------
  useEffect(() => {
    function onMove(e: PointerEvent): void {
      const g = gestureRef.current
      if (!g) return
      const s = scaleRef.current
      const dx = (e.clientX - g.startX) / s
      const dy = (e.clientY - g.startY) / s
      if (!g.recorded && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
        beginEdit()
        g.recorded = true
      }

      if (g.kind === 'move') {
        applyRect(g.sel, { x: Math.round(g.origX + dx), y: Math.round(g.origY + dy) })
        return
      }

      const { orig, sx, sy } = g
      if (g.sel.type === 'text') {
        const width = Math.max(MIN_SIZE, Math.round(orig.width + sx * dx))
        const x = sx < 0 ? orig.x + (orig.width - width) : orig.x
        applyRect(g.sel, { x, y: orig.y, width })
        return
      }

      // Work in the element's own (rotated) frame so handles behave when rotated.
      const theta = (orig.rotation * Math.PI) / 180
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const dxl = dx * cos + dy * sin
      const dyl = -dx * sin + dy * cos
      let width = Math.max(MIN_SIZE, orig.width + sx * dxl)
      let height = Math.max(MIN_SIZE, orig.height + sy * dyl)
      if (g.lockAspect) {
        const f = Math.max(width / orig.width, height / orig.height)
        width = Math.max(MIN_SIZE, orig.width * f)
        height = Math.max(MIN_SIZE, orig.height * f)
      }
      const cx = orig.x + orig.width / 2
      const cy = orig.y + orig.height / 2
      const ax = -sx * (orig.width / 2)
      const ay = -sy * (orig.height / 2)
      const anchorX = cx + ax * cos - ay * sin
      const anchorY = cy + ax * sin + ay * cos
      const nx = sx * (width / 2)
      const ny = sy * (height / 2)
      const newCx = anchorX + nx * cos - ny * sin
      const newCy = anchorY + nx * sin + ny * cos
      applyRect(g.sel, {
        x: Math.round(newCx - width / 2),
        y: Math.round(newCy - height / 2),
        width: Math.round(width),
        height: Math.round(height)
      })
    }
    function onUp(): void {
      gestureRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startMove(e: ReactPointerEvent, sel: Sel, x: number, y: number): void {
    e.stopPropagation()
    setSelected(sel)
    gestureRef.current = {
      kind: 'move',
      recorded: false,
      sel,
      startX: e.clientX,
      startY: e.clientY,
      origX: x,
      origY: y
    }
  }

  function startResize(e: ReactPointerEvent, sel: Sel, sx: number, sy: number, orig: Rect): void {
    e.stopPropagation()
    // Photo areas resize freely; artwork keeps its shape. Shift flips either.
    const defaultLock = sel.type === 'image'
    gestureRef.current = {
      kind: 'resize',
      recorded: false,
      sel,
      sx,
      sy,
      startX: e.clientX,
      startY: e.clientY,
      orig,
      lockAspect: e.shiftKey ? !defaultLock : defaultLock
    }
  }

  // ---- add / delete / duplicate -------------------------------------------
  function addSlot(): void {
    const w = Math.round(layout.canvasWidth * 0.5)
    const h = Math.round(Math.min(layout.canvasHeight * 0.3, w * 0.8))
    const slot: PhotoSlot = {
      id: uuid(),
      x: Math.round((layout.canvasWidth - w) / 2),
      y: Math.round((layout.canvasHeight - h) / 2),
      width: w,
      height: h,
      rotation: 0
    }
    edit((l) => ({ ...l, slots: [...l.slots, slot] }))
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
      fontSize: 48,
      color: '#222222',
      align: 'center',
      bold: true,
      italic: false,
      rotation: 0
    }
    edit((l) => ({ ...l, textElements: [...l.textElements, t] }))
    setSelected({ type: 'text', id: t.id })
  }

  async function addImage(behindPhotos: boolean): Promise<void> {
    const path = await window.api.pickImage()
    if (!path) return
    const natural = await loadNaturalSize(path)
    const maxW = layout.canvasWidth * 0.6
    const maxH = layout.canvasHeight * 0.4
    const f = Math.min(maxW / natural.width, maxH / natural.height)
    const width = Math.round(natural.width * f)
    const height = Math.round(natural.height * f)
    const im: ImageElement = {
      id: uuid(),
      src: path,
      x: Math.round((layout.canvasWidth - width) / 2),
      y: Math.round(layout.canvasHeight * 0.05),
      width,
      height,
      rotation: 0,
      opacity: 1,
      behindPhotos
    }
    edit((l) => ({ ...l, imageElements: [...l.imageElements, im] }))
    setSelected({ type: 'image', id: im.id })
  }

  function deleteSelected(): void {
    if (!selected) return
    const { type, id } = selected
    edit((l) => ({
      ...l,
      slots: type === 'slot' ? l.slots.filter((s) => s.id !== id) : l.slots,
      textElements: type === 'text' ? l.textElements.filter((t) => t.id !== id) : l.textElements,
      imageElements: type === 'image' ? l.imageElements.filter((im) => im.id !== id) : l.imageElements
    }))
    setSelected(null)
  }

  function duplicateSelected(): void {
    if (!selected) return
    const offset = Math.round(layout.canvasWidth * 0.04)
    const newId = uuid()
    if (selected.type === 'slot') {
      const src = layout.slots.find((s) => s.id === selected.id)
      if (!src) return
      edit((l) => ({ ...l, slots: [...l.slots, { ...src, id: newId, x: src.x + offset, y: src.y + offset }] }))
    } else if (selected.type === 'text') {
      const src = layout.textElements.find((t) => t.id === selected.id)
      if (!src) return
      edit((l) => ({
        ...l,
        textElements: [...l.textElements, { ...src, id: newId, x: src.x + offset, y: src.y + offset }]
      }))
    } else {
      const src = layout.imageElements.find((im) => im.id === selected.id)
      if (!src) return
      edit((l) => ({
        ...l,
        imageElements: [...l.imageElements, { ...src, id: newId, x: src.x + offset, y: src.y + offset }]
      }))
    }
    setSelected({ type: selected.type, id: newId })
  }

  function moveSlot(index: number, direction: -1 | 1): void {
    const target = index + direction
    if (target < 0 || target >= layout.slots.length) return
    edit((l) => {
      const slots = [...l.slots]
      ;[slots[index], slots[target]] = [slots[target], slots[index]]
      return { ...l, slots }
    })
  }

  // ---- page settings -----------------------------------------------------
  const landscape = layout.canvasWidth > layout.canvasHeight

  /** Re-fit every element to a new page size so nothing is left off the edge. */
  function resizeCanvas(paperSizeId: string, wantLandscape: boolean): void {
    const next = canvasSizeFor(paperSizeId, wantLandscape)
    edit((l) => {
      const fx = next.width / l.canvasWidth
      const fy = next.height / l.canvasHeight
      const f = Math.min(fx, fy)
      return {
        ...l,
        paperSizeId,
        canvasWidth: next.width,
        canvasHeight: next.height,
        slots: l.slots.map((s) => ({
          ...s,
          x: Math.round(s.x * fx),
          y: Math.round(s.y * fy),
          width: Math.round(s.width * fx),
          height: Math.round(s.height * fy)
        })),
        imageElements: l.imageElements.map((im) => ({
          ...im,
          x: Math.round(im.x * fx),
          y: Math.round(im.y * fy),
          width: Math.round(im.width * fx),
          height: Math.round(im.height * fy)
        })),
        textElements: l.textElements.map((t) => ({
          ...t,
          x: Math.round(t.x * fx),
          y: Math.round(t.y * fy),
          width: Math.round(t.width * fx),
          fontSize: Math.max(8, Math.round(t.fontSize * f))
        }))
      }
    })
  }

  async function pickBackgroundImage(): Promise<void> {
    const path = await window.api.pickImage()
    if (path) edit((l) => ({ ...l, backgroundImage: path }))
  }

  // ---- leave / save ------------------------------------------------------
  const dirty = past.length > 0
  const canSave = layout.slots.length >= 1 && layout.name.trim().length > 0

  async function save(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    try {
      await window.api.saveLayout({ ...layout, name: layout.name.trim() })
      setLayouts(await window.api.listLayouts())
      setScreen(returnScreen)
    } finally {
      setSaving(false)
    }
  }

  function requestLeave(): void {
    if (dirty) setConfirmLeave(true)
    else setScreen(returnScreen)
  }

  // Keyboard: Delete removes the selection, Ctrl/Cmd+Z / Y undo and redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, past, future])

  const selSlot = selected?.type === 'slot' ? layout.slots.find((s) => s.id === selected.id) : undefined
  const selText = selected?.type === 'text' ? layout.textElements.find((t) => t.id === selected.id) : undefined
  const selImage = selected?.type === 'image' ? layout.imageElements.find((im) => im.id === selected.id) : undefined

  const selectionRect: Rect | undefined = selSlot ?? selImage

  function centerSelected(axis: 'h' | 'v'): void {
    if (!selected) return
    if (selected.type === 'text' && selText) {
      if (axis === 'h') edit((l) => ({ ...l, textElements: l.textElements.map((t) => t.id === selText.id ? { ...t, x: Math.round((l.canvasWidth - t.width) / 2) } : t) }))
      return
    }
    const r = selSlot ?? selImage
    if (!r) return
    const patch = axis === 'h'
      ? { x: Math.round((layout.canvasWidth - r.width) / 2) }
      : { y: Math.round((layout.canvasHeight - r.height) / 2) }
    if (selected.type === 'slot') edit((l) => ({ ...l, slots: l.slots.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)) }))
    else edit((l) => ({ ...l, imageElements: l.imageElements.map((im) => (im.id === selected.id ? { ...im, ...patch } : im)) }))
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={requestLeave}>
          <IconChevronLeft size={18} />
        </button>
        <input
          className="editor-title-input"
          value={layout.name}
          onFocus={beginEdit}
          onChange={(e) => live((l) => ({ ...l, name: e.target.value }))}
        />
        <div className="editor-topbar-actions">
          <button className="btn icon-btn" title="Undo (Ctrl+Z)" disabled={past.length === 0} onClick={undo}>
            <IconUndo size={16} />
          </button>
          <button className="btn icon-btn" title="Redo (Ctrl+Y)" disabled={future.length === 0} onClick={redo}>
            <IconRedo size={16} />
          </button>
          <button
            className="btn primary"
            disabled={!canSave || saving}
            title={layout.slots.length === 0 ? 'Add at least one photo area' : undefined}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="editor-layout">
          <div className="editor-canvas-wrap" ref={wrapRef}>
            <div className="editor-stage" style={{ width: displayWidth, height: displayHeight }}>
              <div
                className="editor-canvas"
                style={{ width: displayWidth, height: displayHeight, backgroundColor: layout.backgroundColor }}
                onPointerDown={() => setSelected(null)}
              >
                {layout.backgroundImage && <img className="bg" src={toFileUrl(layout.backgroundImage)} alt="" draggable={false} />}

                {layout.imageElements.map((im) => (
                  <img
                    key={im.id}
                    src={toFileUrl(im.src)}
                    draggable={false}
                    className={`editor-element ${selected?.id === im.id ? 'selected' : ''}`}
                    style={{
                      left: im.x * scale,
                      top: im.y * scale,
                      width: im.width * scale,
                      height: im.height * scale,
                      opacity: im.opacity,
                      transform: `rotate(${im.rotation}deg)`,
                      objectFit: 'contain',
                      zIndex: im.behindPhotos ? 1 : 3
                    }}
                    onPointerDown={(e) => startMove(e, { type: 'image', id: im.id }, im.x, im.y)}
                  />
                ))}

                {layout.slots.map((slot, i) => (
                  <div
                    key={slot.id}
                    className={`editor-element slot ${selected?.id === slot.id ? 'selected' : ''}`}
                    style={{
                      left: slot.x * scale,
                      top: slot.y * scale,
                      width: slot.width * scale,
                      height: slot.height * scale,
                      transform: `rotate(${slot.rotation}deg)`,
                      zIndex: 2
                    }}
                    onPointerDown={(e) => startMove(e, { type: 'slot', id: slot.id }, slot.x, slot.y)}
                  >
                    <span className="slot-number">{i + 1}</span>
                  </div>
                ))}

                {layout.textElements.map((t) => (
                  <div
                    key={t.id}
                    className={`editor-element editor-text ${selected?.id === t.id ? 'selected' : ''}`}
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
                      lineHeight: 1.2,
                      transform: `rotate(${t.rotation}deg)`,
                      zIndex: 4
                    }}
                    onPointerDown={(e) => startMove(e, { type: 'text', id: t.id }, t.x, t.y)}
                  >
                    {t.text}
                    {selected?.id === t.id &&
                      [-1, 1].map((sx) => (
                        <div
                          key={sx}
                          className="editor-handle editor-handle-side"
                          style={{ left: sx < 0 ? 0 : '100%' }}
                          onPointerDown={(e) =>
                            startResize(e, { type: 'text', id: t.id }, sx, 0, {
                              x: t.x,
                              y: t.y,
                              width: t.width,
                              height: 0,
                              rotation: 0
                            })
                          }
                        />
                      ))}
                  </div>
                ))}
              </div>

              {selected && selectionRect && (
                <div
                  className="editor-selection"
                  style={{
                    left: selectionRect.x * scale,
                    top: selectionRect.y * scale,
                    width: selectionRect.width * scale,
                    height: selectionRect.height * scale,
                    transform: `rotate(${selectionRect.rotation}deg)`
                  }}
                >
                  {HANDLES.map((h) => (
                    <div
                      key={h.id}
                      className="editor-handle"
                      style={{ left: h.sx < 0 ? 0 : '100%', top: h.sy < 0 ? 0 : '100%', cursor: h.cursor }}
                      onPointerDown={(e) =>
                        startResize(e, selected, h.sx, h.sy, {
                          x: selectionRect.x,
                          y: selectionRect.y,
                          width: selectionRect.width,
                          height: selectionRect.height,
                          rotation: selectionRect.rotation
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="editor-panel">
            <div className="panel-section">
              <h3>Add</h3>
              <div className="editor-add-grid">
                <button className="btn secondary" onClick={addSlot}>
                  <IconPlus size={15} />
                  Photo area
                </button>
                <button className="btn secondary" onClick={addText}>
                  <IconPlus size={15} />
                  Text
                </button>
                <button className="btn secondary" onClick={() => addImage(false)}>
                  <IconUpload size={15} />
                  Frame / logo
                </button>
                <button className="btn secondary" onClick={() => addImage(true)}>
                  <IconImage size={15} />
                  Backdrop art
                </button>
              </div>
              <p className="editor-hint">
                Frames and logos sit on top of the guest photos; backdrop art sits underneath them. Drag to
                move, drag a corner to resize (Shift flips aspect lock).
              </p>
            </div>

            {selected && (
              <div className="panel-section">
                <h3>
                  {selected.type === 'slot' ? 'Photo area' : selected.type === 'text' ? 'Text' : 'Image'}
                </h3>
                <div className="row">
                  <button className="btn secondary" onClick={duplicateSelected}>
                    <IconCopy size={15} />
                    Duplicate
                  </button>
                  <button className="btn secondary" onClick={deleteSelected}>
                    <IconTrash size={15} />
                    Delete
                  </button>
                </div>
                <div className="row">
                  <button className="btn ghost" onClick={() => centerSelected('h')}>
                    Center ↔
                  </button>
                  {selected.type !== 'text' && (
                    <button className="btn ghost" onClick={() => centerSelected('v')}>
                      Center ↕
                    </button>
                  )}
                </div>

                {selSlot && (
                  <>
                    <div className="row">
                      <NumField label="X (in)" px={selSlot.x} onFocus={beginEdit} onChange={(v) => patchSlot(selSlot.id, { x: v })} />
                      <NumField label="Y (in)" px={selSlot.y} onFocus={beginEdit} onChange={(v) => patchSlot(selSlot.id, { y: v })} />
                    </div>
                    <div className="row">
                      <NumField label="Width (in)" px={selSlot.width} onFocus={beginEdit} onChange={(v) => patchSlot(selSlot.id, { width: Math.max(MIN_SIZE, v) })} />
                      <NumField label="Height (in)" px={selSlot.height} onFocus={beginEdit} onChange={(v) => patchSlot(selSlot.id, { height: Math.max(MIN_SIZE, v) })} />
                    </div>
                    <div className="field">
                      <label>Rotation (deg)</label>
                      <input
                        type="number"
                        value={selSlot.rotation}
                        onFocus={beginEdit}
                        onChange={(e) => patchSlot(selSlot.id, { rotation: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}

                {selText && (
                  <>
                    <div className="field">
                      <label>Text</label>
                      <textarea value={selText.text} onFocus={beginEdit} onChange={(e) => patchText(selText.id, { text: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Font</label>
                      <select
                        value={selText.fontFamily}
                        onChange={(e) => {
                          beginEdit()
                          patchText(selText.id, { fontFamily: e.target.value })
                        }}
                      >
                        {!FONTS.some((f) => f.value === selText.fontFamily) && (
                          <option value={selText.fontFamily}>{selText.fontFamily}</option>
                        )}
                        {FONTS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Size</label>
                        <input
                          type="number"
                          min={8}
                          value={selText.fontSize}
                          onFocus={beginEdit}
                          onChange={(e) => patchText(selText.id, { fontSize: Math.max(8, Number(e.target.value)) })}
                        />
                      </div>
                      <div className="field">
                        <label>Color</label>
                        <input
                          className="color-swatch"
                          type="color"
                          value={selText.color}
                          onFocus={beginEdit}
                          onChange={(e) => patchText(selText.id, { color: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Alignment</label>
                      <select
                        value={selText.align}
                        onChange={(e) => {
                          beginEdit()
                          patchText(selText.id, { align: e.target.value as TextElement['align'] })
                        }}
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
                          checked={selText.bold}
                          onChange={(e) => {
                            beginEdit()
                            patchText(selText.id, { bold: e.target.checked })
                          }}
                        />{' '}
                        Bold
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={selText.italic}
                          onChange={(e) => {
                            beginEdit()
                            patchText(selText.id, { italic: e.target.checked })
                          }}
                        />{' '}
                        Italic
                      </label>
                    </div>
                    <NumField label="Box width (in)" px={selText.width} onFocus={beginEdit} onChange={(v) => patchText(selText.id, { width: Math.max(MIN_SIZE, v) })} />
                  </>
                )}

                {selImage && (
                  <>
                    <div className="row">
                      <NumField label="Width (in)" px={selImage.width} onFocus={beginEdit} onChange={(v) => patchImage(selImage.id, { width: Math.max(MIN_SIZE, v) })} />
                      <NumField label="Height (in)" px={selImage.height} onFocus={beginEdit} onChange={(v) => patchImage(selImage.id, { height: Math.max(MIN_SIZE, v) })} />
                    </div>
                    <div className="field">
                      <label>Opacity</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selImage.opacity}
                        onPointerDown={beginEdit}
                        onChange={(e) => patchImage(selImage.id, { opacity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Rotation (deg)</label>
                      <input
                        type="number"
                        value={selImage.rotation}
                        onFocus={beginEdit}
                        onChange={(e) => patchImage(selImage.id, { rotation: Number(e.target.value) })}
                      />
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selImage.behindPhotos)}
                        onChange={(e) => {
                          beginEdit()
                          patchImage(selImage.id, { behindPhotos: e.target.checked })
                        }}
                      />{' '}
                      Place behind guest photos
                    </label>
                    <button
                      className="btn ghost"
                      onClick={() =>
                        edit((l) => ({
                          ...l,
                          imageElements: l.imageElements.map((im) =>
                            im.id === selImage.id
                              ? { ...im, x: 0, y: 0, width: l.canvasWidth, height: l.canvasHeight, rotation: 0 }
                              : im
                          )
                        }))
                      }
                    >
                      Fit to page
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="panel-section">
              <h3>Page</h3>
              <div className="field">
                <label>Paper size</label>
                <select value={layout.paperSizeId} onChange={(e) => resizeCanvas(e.target.value, landscape)}>
                  {PAPER_SIZES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Orientation</label>
                <select
                  value={landscape ? 'landscape' : 'portrait'}
                  onChange={(e) => resizeCanvas(layout.paperSizeId, e.target.value === 'landscape')}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="field">
                <label>Background color</label>
                <input
                  className="color-swatch"
                  type="color"
                  value={layout.backgroundColor}
                  onFocus={beginEdit}
                  onChange={(e) => live((l) => ({ ...l, backgroundColor: e.target.value }))}
                />
              </div>
              <div className="row">
                <button className="btn secondary" onClick={pickBackgroundImage}>
                  <IconUpload size={15} />
                  Background image
                </button>
                {layout.backgroundImage && (
                  <button className="btn ghost" onClick={() => edit((l) => ({ ...l, backgroundImage: null }))}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="panel-section">
              <h3>Layers</h3>
              {layout.slots.length === 0 && (
                <p className="editor-hint">Add at least one photo area to save this template.</p>
              )}
              {layout.slots.map((s, i) => (
                <div
                  key={s.id}
                  className={`element-list-item ${selected?.id === s.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'slot', id: s.id })}
                >
                  <span>Photo {i + 1}</span>
                  <span className="element-list-actions">
                    <button
                      className="mini-btn"
                      title="Earlier in shot order"
                      disabled={i === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveSlot(i, -1)
                      }}
                    >
                      <IconArrowUp size={13} />
                    </button>
                    <button
                      className="mini-btn"
                      title="Later in shot order"
                      disabled={i === layout.slots.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveSlot(i, 1)
                      }}
                    >
                      <IconArrowDown size={13} />
                    </button>
                  </span>
                </div>
              ))}
              {layout.textElements.map((t) => (
                <div
                  key={t.id}
                  className={`element-list-item ${selected?.id === t.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'text', id: t.id })}
                >
                  <span>Text: {t.text.slice(0, 18) || '(empty)'}</span>
                </div>
              ))}
              {layout.imageElements.map((im, i) => (
                <div
                  key={im.id}
                  className={`element-list-item ${selected?.id === im.id ? 'selected' : ''}`}
                  onClick={() => setSelected({ type: 'image', id: im.id })}
                >
                  <span>
                    {im.behindPhotos ? 'Backdrop' : 'Frame/logo'} {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {confirmLeave && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Unsaved changes</h3>
            <p>Save this template before leaving, or discard your edits?</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmLeave(false)}>
                Keep editing
              </button>
              <button className="btn secondary" onClick={() => setScreen(returnScreen)}>
                Discard
              </button>
              <button className="btn primary" disabled={!canSave} onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
