import { useState } from 'react'
import { ChevronDown, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { getLayerDef, LAYER_TYPES, type Control } from './layers'
import { LabSelect } from './Select'
import type { LayerConfig, LayerInstance, LayerType, Scene } from './scene'

export type LabActions = {
  selectScene: (id: string) => void
  newScene: () => void
  duplicateScene: () => void
  renameScene: (name: string) => void
  deleteScene: () => void
  saveScene: () => void
  copyJson: () => void
  setSunAngle: (value: number) => void
  addLayer: (type: LayerType) => void
  removeLayer: (instanceId: string) => void
  toggleLayer: (instanceId: string) => void
  setLayerConfig: (instanceId: string, key: string, value: number | string | boolean) => void
  reorderLayer: (from: number, to: number) => void
}

const TAU = Math.PI * 2

export function LabSidebar({
  actions,
  dirty,
  savedScenes,
  scene,
  status,
}: {
  actions: LabActions
  dirty: boolean
  savedScenes: Scene[]
  scene: Scene
  status: string
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const isSaved = savedScenes.some((s) => s.id === scene.id)

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="lab__sidebar">
      <header className="lab__scenebar">
        <div className="lab__scene-select-row">
          <LabSelect
            onChange={actions.selectScene}
            options={[
              ...(isSaved ? [] : [{ value: scene.id, label: `${scene.name} (unsaved)` }]),
              ...savedScenes.map((saved) => ({ value: saved.id, label: saved.name })),
            ]}
            value={scene.id}
          />
          {dirty ? <span className="lab__dirty" title="Unsaved changes" /> : null}
        </div>

        <input
          className="lab__scene-name"
          onChange={(event) => actions.renameScene(event.target.value)}
          spellCheck={false}
          value={scene.name}
        />

        <div className="lab__scene-actions">
          <button className="lab__btn" onClick={actions.newScene} type="button">
            New
          </button>
          <button className="lab__btn" onClick={actions.duplicateScene} type="button">
            Duplicate
          </button>
          <button className="lab__btn lab__btn--danger" onClick={actions.deleteScene} type="button">
            Delete
          </button>
        </div>
      </header>

      <section className="lab__scene-params">
        <SliderRow
          label="Sun angle"
          max={TAU}
          min={0}
          onChange={actions.setSunAngle}
          step={0.01}
          value={scene.sunAngle}
        />
      </section>

      <section className="lab__layers">
        <div className="lab__layers-head">
          <span className="lab__section-title">Layers</span>
          <div className="lab__add">
            <button className="lab__btn lab__btn--ghost" onClick={() => setAddOpen((v) => !v)} type="button">
              <Plus aria-hidden size={13} /> Add layer
            </button>
            {addOpen ? (
              <div className="lab__add-menu" onMouseLeave={() => setAddOpen(false)}>
                {LAYER_TYPES.map((type) => (
                  <button
                    className="lab__add-item"
                    key={type}
                    onClick={() => {
                      actions.addLayer(type)
                      setAddOpen(false)
                    }}
                    type="button"
                  >
                    {getLayerDef(type).label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <ul className="lab__layer-list">
          {scene.layers.map((layer, index) => (
            <li
              className={`lab__layer${dragFrom === index ? ' is-dragging' : ''}`}
              draggable
              key={layer.instanceId}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDragFrom(index)}
              onDrop={(event) => {
                event.preventDefault()
                if (dragFrom !== null && dragFrom !== index) actions.reorderLayer(dragFrom, index)
                setDragFrom(null)
              }}
            >
              <LayerCard
                actions={actions}
                collapsed={collapsed.has(layer.instanceId)}
                layer={layer}
                onToggleCollapsed={() => toggleCollapsed(layer.instanceId)}
              />
            </li>
          ))}
        </ul>
      </section>

      <footer className="lab__sidebar-foot">
        <button
          className={`lab__btn lab__btn--primary${dirty ? ' is-dirty' : ''}`}
          onClick={actions.saveScene}
          type="button"
        >
          {dirty ? 'Save •' : 'Saved'}
        </button>
        <button className="lab__btn" onClick={actions.copyJson} type="button">
          <Copy aria-hidden size={13} /> JSON
        </button>
        <span className="lab__status">{status}</span>
      </footer>
    </aside>
  )
}

function LayerCard({
  actions,
  collapsed,
  layer,
  onToggleCollapsed,
}: {
  actions: LabActions
  collapsed: boolean
  layer: LayerInstance
  onToggleCollapsed: () => void
}) {
  const def = getLayerDef(layer.type)
  return (
    <>
      <div className="lab__layer-head">
        <GripVertical aria-hidden className="lab__grip" size={14} />
        <button
          className={`lab__layer-eye${layer.enabled ? ' is-on' : ''}`}
          onClick={() => actions.toggleLayer(layer.instanceId)}
          title={layer.enabled ? 'Hide layer' : 'Show layer'}
          type="button"
        />
        <button className="lab__layer-name" onClick={onToggleCollapsed} type="button">
          <ChevronDown aria-hidden className={collapsed ? 'lab__caret is-collapsed' : 'lab__caret'} size={13} />
          {def.label}
        </button>
        <button
          className="lab__layer-remove"
          onClick={() => actions.removeLayer(layer.instanceId)}
          title="Remove layer"
          type="button"
        >
          <Trash2 aria-hidden size={13} />
        </button>
      </div>

      {!collapsed ? (
        <div className="lab__layer-body">
          {def.controls.map((control) => (
            <LayerControl
              config={layer.config}
              control={control}
              key={control.key}
              onChange={(value) => actions.setLayerConfig(layer.instanceId, control.key, value)}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

function LayerControl({
  config,
  control,
  onChange,
}: {
  config: LayerConfig
  control: Control
  onChange: (value: number | string) => void
}) {
  if (control.kind === 'select') {
    const value = typeof config[control.key] === 'string' ? (config[control.key] as string) : control.options[0]?.value
    return (
      <div className="lab__control">
        <span className="lab__control-label">{control.label}</span>
        <LabSelect onChange={onChange} options={control.options} value={value} />
      </div>
    )
  }

  const numeric = typeof config[control.key] === 'number' ? (config[control.key] as number) : control.min
  return (
    <SliderRow
      label={control.label}
      max={control.max}
      min={control.min}
      onChange={onChange}
      step={control.step}
      value={numeric}
    />
  )
}

function SliderRow({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="lab__control">
      <span className="lab__control-label">
        <span>{label}</span>
        <span className="lab__control-value">{value.toFixed(2)}</span>
      </span>
      <input
        className="lab__range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}
