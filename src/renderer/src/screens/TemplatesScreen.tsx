import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../state/useAppStore'
import LayoutThumb from '../components/LayoutThumb'
import { createBlankLayout } from '../lib/defaultLayouts'
import { IconChevronLeft, IconCopy, IconEdit, IconPlus, IconTrash } from '../components/Icon'
import type { LayoutTemplate } from '@shared/types'

const PREVIEW_W = 200
const PREVIEW_H = 260

function previewHeight(layout: LayoutTemplate): number {
  const ratio = layout.canvasWidth / layout.canvasHeight
  return ratio > PREVIEW_W / PREVIEW_H ? PREVIEW_W / ratio : PREVIEW_H
}

export default function TemplatesScreen(): JSX.Element {
  const layouts = useAppStore((s) => s.layouts)
  const setLayouts = useAppStore((s) => s.setLayouts)
  const events = useAppStore((s) => s.events)
  const settings = useAppStore((s) => s.settings)
  const setEditingLayout = useAppStore((s) => s.setEditingLayout)
  const setScreen = useAppStore((s) => s.setScreen)

  const [pendingDelete, setPendingDelete] = useState<LayoutTemplate | null>(null)

  function openEditor(layout: LayoutTemplate): void {
    setEditingLayout(layout, 'templates')
    setScreen('layoutEditor')
  }

  function newTemplate(): void {
    // Not saved until the designer hits Save, so cancelling leaves nothing behind.
    openEditor(createBlankLayout(settings.paperSizeId))
  }

  async function duplicate(layout: LayoutTemplate): Promise<void> {
    const now = new Date().toISOString()
    const copy: LayoutTemplate = {
      ...layout,
      id: uuid(),
      name: `${layout.name} copy`,
      slots: layout.slots.map((s) => ({ ...s, id: uuid() })),
      textElements: layout.textElements.map((t) => ({ ...t, id: uuid() })),
      imageElements: layout.imageElements.map((im) => ({ ...im, id: uuid() })),
      createdAt: now,
      updatedAt: now
    }
    await window.api.saveLayout(copy)
    setLayouts(await window.api.listLayouts())
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return
    await window.api.deleteLayout(pendingDelete.id)
    setLayouts(await window.api.listLayouts())
    setPendingDelete(null)
  }

  const eventsUsingPending = pendingDelete ? events.filter((e) => e.layoutId === pendingDelete.id) : []

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={() => setScreen('home')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Templates</h2>
        <button className="btn primary" onClick={newTemplate}>
          <IconPlus size={16} />
          New Template
        </button>
      </div>

      <div className="content">
        <div className="template-grid">
          {layouts.map((l) => (
            <div key={l.id} className="template-card">
              <button className="template-preview" onClick={() => openEditor(l)} title="Edit template">
                <LayoutThumb layout={l} displayHeight={previewHeight(l)} />
              </button>
              <div className="template-meta">
                <strong>{l.name}</strong>
                <span>
                  {l.slots.length} photo{l.slots.length === 1 ? '' : 's'} · {l.paperSizeId.toUpperCase()}
                </span>
              </div>
              <div className="template-actions">
                <button className="btn secondary" onClick={() => openEditor(l)}>
                  <IconEdit size={15} />
                  Edit
                </button>
                <button className="btn ghost icon-btn" title="Duplicate" onClick={() => duplicate(l)}>
                  <IconCopy size={15} />
                </button>
                <button className="btn ghost icon-btn" title="Delete" onClick={() => setPendingDelete(l)}>
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
          ))}

          <button className="template-card template-add" onClick={newTemplate}>
            <IconPlus size={28} strokeWidth={1.4} />
            <span>Add another template</span>
          </button>
        </div>
      </div>

      {pendingDelete && (
        <div className="modal-overlay">
          <div className="modal-box">
            {eventsUsingPending.length > 0 ? (
              <>
                <h3>Template in use</h3>
                <p>
                  “{pendingDelete.name}” is used by {eventsUsingPending.length} event
                  {eventsUsingPending.length === 1 ? '' : 's'} ({eventsUsingPending.map((e) => e.name).join(', ')}).
                  Switch those events to another template before deleting it.
                </p>
                <div className="modal-actions">
                  <button className="btn primary" onClick={() => setPendingDelete(null)}>
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Delete template?</h3>
                <p>“{pendingDelete.name}” will be permanently removed.</p>
                <div className="modal-actions">
                  <button className="btn secondary" onClick={() => setPendingDelete(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" onClick={confirmDelete}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
