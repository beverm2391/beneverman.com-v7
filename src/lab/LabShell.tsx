import { Activity, Copy, Eye, Layers, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { ShadowMapMode } from '../shadowMapModes'
import type { ShadowSettings } from '../V2ShadowLayer'
import {
  shadowLayerPresetIds,
  textLayerPresetIds,
  type LabLayer,
  type LabScene,
  type LabScenePresetId,
  type ShadowLayerPresetId,
  type TextLayerPresetId,
} from './labModel'

type NumericSetting = Exclude<keyof ShadowSettings, 'canopyStyle'>

export type LabControl = {
  key: NumericSetting
  label: string
  max: number
  min: number
  step: number
}

export type LabInspectorTarget = { type: 'scene' } | { layerId: LabLayer['id']; type: 'layer' }

type LabShellProps = {
  children: ReactNode
  controls: LabControl[]
  copyJson: () => void
  inspectorTarget: LabInspectorTarget
  scene: LabScene
  sceneLink: (mode: ShadowMapMode) => { pathname: string; search: string }
  scenePresetIds: readonly LabScenePresetId[]
  scenes: readonly ShadowMapMode[]
  setInspectorTarget: (target: LabInspectorTarget) => void
  setLayerEnabled: (layerId: LabLayer['id'], enabled: boolean) => void
  setScenePreset: (presetId: LabScenePresetId) => void
  setShadowParam: (key: string, value: number) => void
  setShadowPreset: (presetId: ShadowLayerPresetId) => void
  setSunAngle: (value: number) => void
  setTextAutoCenter: (enabled: boolean) => void
  setTextParam: (key: 'opacity' | 'size' | 'x' | 'y', value: number) => void
  setTextPreset: (presetId: TextLayerPresetId) => void
  setTextValue: (value: string) => void
  shadowSettings: ShadowSettings
  sunAngle: number
}

const motionTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const

function sliderValue(value: number | readonly number[], fallback: number) {
  return typeof value === 'number' ? value : Number(value[0] ?? fallback)
}

function isActiveLayer(target: LabInspectorTarget, layerId: LabLayer['id']) {
  return target.type === 'layer' && target.layerId === layerId
}

export function LabShell({
  children,
  controls,
  copyJson,
  inspectorTarget,
  scene,
  sceneLink,
  scenePresetIds,
  scenes,
  setInspectorTarget,
  setLayerEnabled,
  setScenePreset,
  setShadowParam,
  setShadowPreset,
  setSunAngle,
  setTextAutoCenter,
  setTextParam,
  setTextPreset,
  setTextValue,
  shadowSettings,
  sunAngle,
}: LabShellProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [showSourcePreview, setShowSourcePreview] = useState(false)
  const selectedLayer = inspectorTarget.type === 'layer' ? scene.layers.find((layer) => layer.id === inspectorTarget.layerId) : undefined
  const inspectorKey = inspectorTarget.type === 'scene' ? 'scene' : inspectorTarget.layerId

  return (
    <div className="lab">
      <main className="lab__workbench">
        <header className="lab__topline">
          <div className="lab__topline-left">
            <Button
              aria-label={isInspectorOpen ? 'Collapse inspector' : 'Open inspector'}
              className="lab__chrome-button"
              onClick={() => setIsInspectorOpen((isOpen) => !isOpen)}
              size="icon-sm"
              variant="outline"
            >
              {isInspectorOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>

            <motion.nav className="lab__scene-tabs" layout aria-label="Scene modes">
              {scenes.map((mode) => (
                <Link
                  aria-current={mode === scene.id ? 'page' : undefined}
                  className={mode === scene.id ? 'lab__scene-tab is-active' : 'lab__scene-tab'}
                  key={mode}
                  to={sceneLink(mode)}
                >
                  {mode}
                </Link>
              ))}
            </motion.nav>
          </div>
        </header>

        <section className={isInspectorOpen ? 'lab__stage' : 'lab__stage is-inspector-collapsed'}>
          <AnimatePresence initial={false}>
            {isInspectorOpen ? (
              <motion.aside
                animate={{ opacity: 1, x: 0 }}
                className="lab__inspector"
                aria-label="Scene and layer controls"
                exit={{ opacity: 0, x: -10 }}
                initial={{ opacity: 0, x: -10 }}
                key="inspector"
                layout
                transition={motionTransition}
              >
                <Accordion className="lab__accordion" defaultValue={['scene', 'layers']}>
                  <AccordionItem className="lab__accordion-item" value="scene">
                    <AccordionTrigger className="lab__accordion-trigger">
                      <span>
                        <Layers aria-hidden="true" />
                        Scene
                      </span>
                      <Badge size="sm" variant="outline">
                        {scene.presetId}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionPanel className="lab__accordion-panel">
                      <motion.button
                        className={inspectorTarget.type === 'scene' ? 'lab__tree-row is-active' : 'lab__tree-row'}
                        layout
                        onClick={() => setInspectorTarget({ type: 'scene' })}
                        type="button"
                      >
                        <span className="lab__tree-row-label">Scene config</span>
                        <span className="lab__tree-meta">{scene.layers.length} layers</span>
                      </motion.button>
                    </AccordionPanel>
                  </AccordionItem>

                  <AccordionItem className="lab__accordion-item" value="layers">
                    <AccordionTrigger className="lab__accordion-trigger">
                      <span>Layers</span>
                      <Badge size="sm" variant="outline">
                        {scene.layers.filter((layer) => layer.enabled).length}/{scene.layers.length}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionPanel className="lab__accordion-panel">
                      <motion.div className="lab__tree-section" layout>
                        {scene.layers.map((layer) => (
                          <motion.div
                            className={isActiveLayer(inspectorTarget, layer.id) ? 'lab__tree-row is-active' : 'lab__tree-row'}
                            key={layer.id}
                            layout
                            transition={motionTransition}
                          >
                            <button
                              className="lab__tree-row-label"
                              onClick={() => setInspectorTarget({ layerId: layer.id, type: 'layer' })}
                              type="button"
                            >
                              <span className="lab__layer-dot" data-enabled={layer.enabled} />
                              {layer.name}
                            </button>
                            <button
                              className={layer.enabled ? 'lab__layer-toggle is-on' : 'lab__layer-toggle'}
                              onClick={() => setLayerEnabled(layer.id, !layer.enabled)}
                              type="button"
                            >
                              {layer.enabled ? 'on' : 'off'}
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>

                <motion.div className="lab__inspector-panel" layout>
                  <div className="lab__inspector-heading">
                    <span>
                      <SlidersHorizontal aria-hidden="true" />
                      {inspectorTarget.type === 'scene' ? 'Scene' : selectedLayer?.name ?? 'Layer'}
                    </span>
                    <Badge variant="secondary">{inspectorTarget.type}</Badge>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      initial={{ opacity: 0, y: 6 }}
                      key={inspectorKey}
                      layout
                      transition={motionTransition}
                    >
                      {inspectorTarget.type === 'scene' ? (
                        <Accordion className="lab__accordion lab__config-accordion" defaultValue={['presets', 'config']}>
                          <AccordionItem className="lab__accordion-item" value="presets">
                            <AccordionTrigger className="lab__accordion-trigger">Scene presets</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <PresetGrid ids={scenePresetIds} activeId={scene.presetId} onSelect={setScenePreset} />
                            </AccordionPanel>
                          </AccordionItem>
                          <AccordionItem className="lab__accordion-item" value="config">
                            <AccordionTrigger className="lab__accordion-trigger">Scene config</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <label className="lab__control">
                                <span className="lab__control-label">
                                  <span>Sun angle</span>
                                  <Badge size="sm" variant="outline">
                                    {sunAngle.toFixed(2)}
                                  </Badge>
                                </span>
                                <Slider max={Math.PI * 2} min={0} onValueChange={(value) => setSunAngle(sliderValue(value, sunAngle))} step={0.01} value={[sunAngle]} />
                              </label>
                            </AccordionPanel>
                          </AccordionItem>
                        </Accordion>
                      ) : null}

                      {selectedLayer?.kind === 'shadow' ? (
                        <Accordion className="lab__accordion lab__config-accordion" defaultValue={['presets', 'config']}>
                          <AccordionItem className="lab__accordion-item" value="presets">
                            <AccordionTrigger className="lab__accordion-trigger">Shadow presets</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <PresetGrid ids={shadowLayerPresetIds} activeId={selectedLayer.presetId} onSelect={setShadowPreset} />
                            </AccordionPanel>
                          </AccordionItem>
                          <AccordionItem className="lab__accordion-item" value="config">
                            <AccordionTrigger className="lab__accordion-trigger">Shadow config</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <div className="lab__control-stack">
                                {controls.map((control) => (
                                  <label className="lab__control" key={control.key}>
                                    <span className="lab__control-label">
                                      <span>{control.label}</span>
                                      <Badge size="sm" variant="outline">
                                        {shadowSettings[control.key].toFixed(2)}
                                      </Badge>
                                    </span>
                                    <Slider
                                      max={control.max}
                                      min={control.min}
                                      onValueChange={(value) => setShadowParam(control.key, sliderValue(value, shadowSettings[control.key]))}
                                      step={control.step}
                                      value={[shadowSettings[control.key]]}
                                    />
                                  </label>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        </Accordion>
                      ) : null}

                      {selectedLayer?.kind === 'text' ? (
                        <Accordion className="lab__accordion lab__config-accordion" defaultValue={['presets', 'config']}>
                          <AccordionItem className="lab__accordion-item" value="presets">
                            <AccordionTrigger className="lab__accordion-trigger">Text presets</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <PresetGrid ids={textLayerPresetIds} activeId={selectedLayer.presetId} onSelect={setTextPreset} />
                            </AccordionPanel>
                          </AccordionItem>
                          <AccordionItem className="lab__accordion-item" value="config">
                            <AccordionTrigger className="lab__accordion-trigger">Text config</AccordionTrigger>
                            <AccordionPanel className="lab__accordion-panel">
                              <div className="lab__control-stack">
                                <label className="lab__control">
                                  <span className="lab__control-label">Text</span>
                                  <Input nativeInput onChange={(event) => setTextValue(event.currentTarget.value)} size="sm" value={selectedLayer.config.text} />
                                </label>

                                <label className="lab__switch-row">
                                  <span>
                                    <strong>Auto center</strong>
                                    <small>lock text to viewer center</small>
                                  </span>
                                  <Switch checked={selectedLayer.config.autoCenter} onCheckedChange={setTextAutoCenter} />
                                </label>

                                {(['size', 'x', 'y', 'opacity'] as const).map((key) => (
                                  <label className="lab__control" data-muted={selectedLayer.config.autoCenter && (key === 'x' || key === 'y')} key={key}>
                                    <span className="lab__control-label">
                                      <span>{key}</span>
                                      <Badge size="sm" variant="outline">
                                        {selectedLayer.config[key].toFixed(key === 'opacity' ? 2 : 0)}
                                      </Badge>
                                    </span>
                                    <Slider
                                      disabled={selectedLayer.config.autoCenter && (key === 'x' || key === 'y')}
                                      max={key === 'size' ? 96 : key === 'opacity' ? 1 : 100}
                                      min={key === 'size' ? 12 : 0}
                                      onValueChange={(value) => setTextParam(key, sliderValue(value, selectedLayer.config[key]))}
                                      step={key === 'opacity' ? 0.01 : 1}
                                      value={[selectedLayer.config[key]]}
                                    />
                                  </label>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        </Accordion>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </motion.aside>
            ) : null}
          </AnimatePresence>

          <div className="lab__viewer-wrap">
            <div className="lab__viewer-toolbar" aria-label="Viewer tools">
              <Badge variant="outline">
                <Eye aria-hidden="true" />
                live viewer
              </Badge>
              <Button
                aria-pressed={showSourcePreview}
                onClick={() => setShowSourcePreview((isVisible) => !isVisible)}
                size="xs"
                variant={showSourcePreview ? 'default' : 'outline'}
              >
                source
              </Button>
            </div>

            <motion.div className="lab__viewer" layout transition={motionTransition}>
              {children}
            </motion.div>

            <AnimatePresence initial={false}>
              {showSourcePreview ? (
                <motion.aside
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="lab__source-card"
                  aria-label="Caster map preview placeholder"
                  exit={{ opacity: 0, scale: 0.98, y: 4 }}
                  initial={{ opacity: 0, scale: 0.98, y: 4 }}
                  transition={motionTransition}
                >
                  <span>caster map</span>
                  <div className="lab__source-thumb" />
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <footer className="lab__statusbar">
          <div className="lab__status-cluster">
            <Badge variant="outline">
              <Activity aria-hidden="true" />
              60 fps
            </Badge>
            <Badge variant="outline">scene {scene.presetId}</Badge>
            <Badge variant="outline">{inspectorTarget.type === 'scene' ? 'editing scene' : `editing ${inspectorTarget.layerId}`}</Badge>
          </div>
          <Button onClick={copyJson} size="sm" variant="outline">
            <Copy aria-hidden="true" />
            Copy JSON
          </Button>
        </footer>
      </main>
    </div>
  )
}

function PresetGrid<T extends string>({
  activeId,
  ids,
  onSelect,
}: {
  activeId: T
  ids: readonly T[]
  onSelect: (id: T) => void
}) {
  return (
    <motion.div className="lab__preset-group" layout>
      {ids.map((id) => (
        <motion.button
          className={id === activeId ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
          key={id}
          layout
          onClick={() => onSelect(id)}
          transition={motionTransition}
          type="button"
        >
          {id}
        </motion.button>
      ))}
    </motion.div>
  )
}
