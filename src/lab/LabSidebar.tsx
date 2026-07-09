import { useEffect, useState } from 'react'
import { Box, ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AnimatedParam, SliderRow, type AnimState } from './animatedParam'
import { getLayerDef, LAYER_TYPES, type Control } from './layers'
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

function itemsFrom(options: { value: string; label: string }[]) {
  return Object.fromEntries(options.map((option) => [option.value, option.label]))
}

export function LabSidebar({
  actions,
  scene,
  sunAnim,
  onSunAnim,
  inspectedIds,
  onToggleInspect,
}: {
  actions: LabActions
  scene: Scene
  sunAnim: AnimState
  onSunAnim: (next: AnimState) => void
  inspectedIds: Set<string>
  onToggleInspect: (instanceId: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  // A layer is only draggable while its grip handle is held, so dragging on a
  // slider or select never starts a reorder.
  const [armedId, setArmedId] = useState<string | null>(null)

  useEffect(() => {
    if (!armedId) return
    const disarm = () => setArmedId(null)
    document.addEventListener('mouseup', disarm)
    return () => document.removeEventListener('mouseup', disarm)
  }, [armedId])

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="lab__sidebar">
      <section className="lab__scene-params">
        <AnimatedParam
          anim={sunAnim}
          label="Sun angle"
          max={TAU}
          min={0}
          onAnimChange={onSunAnim}
          onChange={actions.setSunAngle}
          step={0.01}
          value={scene.sunAngle}
        />
      </section>

      <section className="lab__layers">
        <div className="lab__layers-head">
          <span className="lab__section-title">Layers</span>
          <div className="lab__add">
            <Button onClick={() => setAddOpen((v) => !v)} size="xs" variant="ghost">
              <Plus /> Add layer
            </Button>
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
              draggable={armedId === layer.instanceId}
              key={layer.instanceId}
              onDragEnd={() => {
                setDragFrom(null)
                setArmedId(null)
              }}
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
                inspecting={inspectedIds.has(layer.instanceId)}
                layer={layer}
                onGrip={() => setArmedId(layer.instanceId)}
                onToggleCollapsed={() => toggleCollapsed(layer.instanceId)}
                onToggleInspect={() => onToggleInspect(layer.instanceId)}
              />
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}

function LayerCard({
  actions,
  collapsed,
  inspecting,
  layer,
  onGrip,
  onToggleCollapsed,
  onToggleInspect,
}: {
  actions: LabActions
  collapsed: boolean
  inspecting: boolean
  layer: LayerInstance
  onGrip: () => void
  onToggleCollapsed: () => void
  onToggleInspect: () => void
}) {
  const def = getLayerDef(layer.type)
  return (
    <>
      <div className="lab__layer-head">
        <button aria-label="Drag to reorder" className="lab__grip" onMouseDown={onGrip} type="button">
          <GripVertical aria-hidden size={14} />
        </button>
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
        {def.inspectable ? (
          <Button
            aria-label="Mesh inspector"
            aria-pressed={inspecting}
            onClick={onToggleInspect}
            size="icon-xs"
            title="Mesh inspector"
            variant={inspecting ? 'secondary' : 'ghost'}
          >
            <Box />
          </Button>
        ) : null}
        <Button aria-label="Remove layer" onClick={() => actions.removeLayer(layer.instanceId)} size="icon-xs" variant="ghost">
          <Trash2 />
        </Button>
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
  onChange: (value: number | string | boolean) => void
}) {
  if (control.kind === 'switch') {
    return (
      <label className="lab__control lab__control--row">
        <span className="lab__control-label">{control.label}</span>
        <Switch checked={config[control.key] === true} onCheckedChange={(checked) => onChange(checked)} />
      </label>
    )
  }

  if (control.kind === 'select') {
    const value = typeof config[control.key] === 'string' ? (config[control.key] as string) : control.options[0]?.value
    return (
      <div className="lab__control">
        <span className="lab__control-label">{control.label}</span>
        <Select items={itemsFrom(control.options)} onValueChange={(next) => onChange(String(next))} value={value}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {control.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
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

