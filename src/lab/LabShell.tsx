import { Activity, Copy, Eye, Layers, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
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
  setTextParam: (key: 'opacity' | 'size' | 'x' | 'y', value: number) => void
  setTextPreset: (presetId: TextLayerPresetId) => void
  setTextValue: (value: string) => void
  shadowSettings: ShadowSettings
  sunAngle: number
}

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
  setTextParam,
  setTextPreset,
  setTextValue,
  shadowSettings,
  sunAngle,
}: LabShellProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [showSourcePreview, setShowSourcePreview] = useState(false)
  const selectedLayer = inspectorTarget.type === 'layer' ? scene.layers.find((layer) => layer.id === inspectorTarget.layerId) : undefined

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

            <nav className="lab__scene-tabs" aria-label="Scene modes">
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
            </nav>
          </div>
        </header>

        <section className={isInspectorOpen ? 'lab__stage' : 'lab__stage is-inspector-collapsed'}>
          <aside className="lab__inspector" aria-label="Scene and layer controls">
            <div className="lab__tree" aria-label="Scene tree">
              <button
                className={inspectorTarget.type === 'scene' ? 'lab__tree-row is-active' : 'lab__tree-row'}
                onClick={() => setInspectorTarget({ type: 'scene' })}
                type="button"
              >
                <span className="lab__tree-row-label">
                  <Layers aria-hidden="true" />
                  Scene
                </span>
                <Badge size="sm" variant="outline">
                  {scene.presetId}
                </Badge>
              </button>

              <div className="lab__tree-section">
                <span className="lab__tree-kicker">layers</span>
                {scene.layers.map((layer) => (
                  <div className={isActiveLayer(inspectorTarget, layer.id) ? 'lab__tree-row is-active' : 'lab__tree-row'} key={layer.id}>
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
                  </div>
                ))}
              </div>
            </div>

            <div className="lab__inspector-panel">
              <div className="lab__inspector-heading">
                <span>
                  <SlidersHorizontal aria-hidden="true" />
                  {inspectorTarget.type === 'scene' ? 'Scene' : selectedLayer?.name ?? 'Layer'}
                </span>
                <Badge variant="secondary">{inspectorTarget.type}</Badge>
              </div>

              {inspectorTarget.type === 'scene' ? (
                <div className="lab__control-stack">
                  <div className="lab__preset-group" aria-label="Scene presets">
                    {scenePresetIds.map((presetId) => (
                      <button
                        className={presetId === scene.presetId ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
                        key={presetId}
                        onClick={() => setScenePreset(presetId)}
                        type="button"
                      >
                        {presetId}
                      </button>
                    ))}
                  </div>

                  <label className="lab__control">
                    <span className="lab__control-label">
                      <span>Sun angle</span>
                      <Badge size="sm" variant="outline">
                        {sunAngle.toFixed(2)}
                      </Badge>
                    </span>
                    <Slider max={Math.PI * 2} min={0} onValueChange={(value) => setSunAngle(sliderValue(value, sunAngle))} step={0.01} value={[sunAngle]} />
                  </label>
                </div>
              ) : null}

              {selectedLayer?.kind === 'shadow' ? (
                <div className="lab__control-stack">
                  <div className="lab__preset-group" aria-label="Shadow layer presets">
                    {shadowLayerPresetIds.map((presetId) => (
                      <button
                        className={presetId === selectedLayer.presetId ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
                        key={presetId}
                        onClick={() => setShadowPreset(presetId)}
                        type="button"
                      >
                        {presetId}
                      </button>
                    ))}
                  </div>

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
              ) : null}

              {selectedLayer?.kind === 'text' ? (
                <div className="lab__control-stack">
                  <div className="lab__preset-group" aria-label="Text layer presets">
                    {textLayerPresetIds.map((presetId) => (
                      <button
                        className={presetId === selectedLayer.presetId ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
                        key={presetId}
                        onClick={() => setTextPreset(presetId)}
                        type="button"
                      >
                        {presetId}
                      </button>
                    ))}
                  </div>

                  <label className="lab__control">
                    <span className="lab__control-label">Text</span>
                    <Input nativeInput onChange={(event) => setTextValue(event.currentTarget.value)} size="sm" value={selectedLayer.config.text} />
                  </label>

                  {(['size', 'x', 'y', 'opacity'] as const).map((key) => (
                    <label className="lab__control" key={key}>
                      <span className="lab__control-label">
                        <span>{key}</span>
                        <Badge size="sm" variant="outline">
                          {selectedLayer.config[key].toFixed(key === 'opacity' ? 2 : 0)}
                        </Badge>
                      </span>
                      <Slider
                        max={key === 'size' ? 96 : key === 'opacity' ? 1 : 100}
                        min={key === 'size' ? 12 : 0}
                        onValueChange={(value) => setTextParam(key, sliderValue(value, selectedLayer.config[key]))}
                        step={key === 'opacity' ? 0.01 : 1}
                        value={[selectedLayer.config[key]]}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>

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

            <div className="lab__viewer">{children}</div>

            {showSourcePreview ? (
              <aside className="lab__source-card" aria-label="Caster map preview placeholder">
                <span>caster map</span>
                <div className="lab__source-thumb" />
              </aside>
            ) : null}
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
