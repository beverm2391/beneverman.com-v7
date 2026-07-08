import { Copy, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { backgroundModes, type BackgroundMode } from '../HomeSunGradientConfig'
import type { ShadowMapMode } from '../shadowMapModes'
import type { ShadowSettings } from '../V2ShadowLayer'
import type { LabLayer, LabScene } from './labModel'

type NumericSetting = Exclude<keyof ShadowSettings, 'canopyStyle'>

export type LabControl = {
  key: NumericSetting
  label: string
  max: number
  min: number
  step: number
}

type LabShellProps = {
  children: ReactNode
  controls: LabControl[]
  copyJson: () => void
  scene: LabScene
  sceneLink: (mode: ShadowMapMode) => { pathname: string; search: string }
  scenes: readonly ShadowMapMode[]
  setLayerEnabled: (layerId: LabLayer['id'], enabled: boolean) => void
  setShadowParam: (key: string, value: number) => void
  setShadowPreset: (presetId: ShadowMapMode) => void
  setSunAngle: (value: number) => void
  setSunGradientMode: (mode: BackgroundMode) => void
  setTextOpacity: (value: number) => void
  shadowSettings: ShadowSettings
}

function sliderValue(value: number | readonly number[], fallback: number) {
  return typeof value === 'number' ? value : Number(value[0] ?? fallback)
}

export function LabShell({
  children,
  controls,
  copyJson,
  scene,
  sceneLink,
  scenes,
  setLayerEnabled,
  setShadowParam,
  setShadowPreset,
  setSunAngle,
  setSunGradientMode,
  setTextOpacity,
  shadowSettings,
}: LabShellProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)

  const toggleLayer = (event: MouseEvent<HTMLButtonElement>, layer: LabLayer) => {
    event.preventDefault()
    event.stopPropagation()
    setLayerEnabled(layer.id, !layer.enabled)
  }

  return (
    <div className="lab">
      <main className="lab__workbench">
        <header className="lab__topline">
          <div className="lab__topline-left">
            <Button
              aria-label={isInspectorOpen ? 'Collapse layers' : 'Open layers'}
              className="lab__chrome-button"
              onClick={() => setIsInspectorOpen((isOpen) => !isOpen)}
              size="icon-sm"
              variant="outline"
            >
              {isInspectorOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>

            <nav className="lab__scene-tabs" aria-label="Scenes">
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
          {isInspectorOpen ? (
            <aside className="lab__inspector" aria-label="Layer controls">
              <Accordion className="lab__accordion" defaultValue={scene.layers.map((layer) => layer.id)}>
                {scene.layers.map((layer) => (
                  <AccordionItem className="lab__accordion-item" key={layer.id} value={layer.id}>
                    <AccordionTrigger className="lab__accordion-trigger">
                      <span className="lab__layer-trigger-title">
                        <span className="lab__layer-dot" data-enabled={layer.enabled} />
                        {layer.name}
                      </span>
                      <button className={layer.enabled ? 'lab__layer-toggle is-on' : 'lab__layer-toggle'} onClick={(event) => toggleLayer(event, layer)} type="button">
                        {layer.enabled ? 'on' : 'off'}
                      </button>
                    </AccordionTrigger>

                    <AccordionPanel className="lab__accordion-panel">
                      {layer.kind === 'sunGradient' ? (
                        <div className="lab__control-stack">
                          <div className="lab__preset-group" aria-label="Sun gradient modes">
                            {backgroundModes.map((mode) => (
                              <button
                                className={mode.label === layer.config.mode ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
                                key={mode.label}
                                onClick={() => setSunGradientMode(mode.label)}
                                type="button"
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>

                          <label className="lab__control">
                            <span className="lab__control-label">
                              <span>Sun angle</span>
                              <Badge size="sm" variant="outline">
                                {scene.config.sunAngle.toFixed(2)}
                              </Badge>
                            </span>
                            <Slider
                              max={Math.PI * 2}
                              min={0}
                              onValueChange={(value) => setSunAngle(sliderValue(value, scene.config.sunAngle))}
                              step={0.01}
                              value={[scene.config.sunAngle]}
                            />
                          </label>
                        </div>
                      ) : null}

                      {layer.kind === 'text' ? (
                        <div className="lab__control-stack">
                          <div className="lab__fixed-copy-note">
                            <strong>Homepage intro</strong>
                            <span>Fixed copy and formatting from the live home screen.</span>
                          </div>
                          <label className="lab__control">
                            <span className="lab__control-label">
                              <span>Opacity</span>
                              <Badge size="sm" variant="outline">
                                {layer.config.opacity.toFixed(2)}
                              </Badge>
                            </span>
                            <Slider max={1} min={0} onValueChange={(value) => setTextOpacity(sliderValue(value, layer.config.opacity))} step={0.01} value={[layer.config.opacity]} />
                          </label>
                        </div>
                      ) : null}

                      {layer.kind === 'shadow' ? (
                        <div className="lab__control-stack">
                          <div className="lab__preset-group" aria-label="Shadow presets">
                            {scenes.map((mode) => (
                              <button
                                className={mode === layer.config.presetId ? 'lab__preset-chip is-active' : 'lab__preset-chip'}
                                key={mode}
                                onClick={() => setShadowPreset(mode)}
                                type="button"
                              >
                                {mode}
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
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </aside>
          ) : null}

          <div className="lab__viewer-wrap">
            <div className="lab__viewer">{children}</div>
          </div>
        </section>

        <footer className="lab__statusbar">
          <div className="lab__status-cluster">
            <Badge variant="outline">scene {scene.name}</Badge>
            <Badge variant="outline">{scene.layers.filter((layer) => layer.enabled).length}/{scene.layers.length} layers</Badge>
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
