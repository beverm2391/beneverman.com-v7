import { Activity, Copy, Eye, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { ShadowMapMode } from '../shadowMapModes'
import type { ShadowSettings } from '../V2ShadowLayer'

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
  scene: ShadowMapMode
  sceneLink: (mode: ShadowMapMode) => { pathname: string; search: string }
  scenes: readonly ShadowMapMode[]
  setParam: (key: string, value: number) => void
  settings: ShadowSettings
  sunAngle: number
}

const sceneInitials: Record<ShadowMapMode, string> = {
  canopy: 'Ca',
  mixed: 'Mx',
  pool: 'Po',
  sun: 'Su',
  sundial: 'Sd',
  window: 'Wi',
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
  setParam,
  settings,
  sunAngle,
}: LabShellProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [showSourcePreview, setShowSourcePreview] = useState(false)

  return (
    <div className="lab">
      <aside className="lab__rail" aria-label="Lab navigation">
        <div className="lab__rail-mark">BE</div>
        <nav className="lab__rail-scenes" aria-label="Scene shortcuts">
          {scenes.map((mode) => (
            <Link
              aria-current={mode === scene ? 'page' : undefined}
              className={mode === scene ? 'lab__rail-scene is-active' : 'lab__rail-scene'}
              key={mode}
              to={sceneLink(mode)}
              title={mode}
            >
              {sceneInitials[mode]}
            </Link>
          ))}
        </nav>
        <Button
          aria-label={isInspectorOpen ? 'Collapse inspector' : 'Open inspector'}
          className="lab__rail-button"
          onClick={() => setIsInspectorOpen((isOpen) => !isOpen)}
          size="icon-sm"
          variant="ghost"
        >
          {isInspectorOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </aside>

      <main className="lab__workbench">
        <header className="lab__topline">
          <nav className="lab__scene-tabs" aria-label="Scene modes">
            {scenes.map((mode) => (
              <Link
                aria-current={mode === scene ? 'page' : undefined}
                className={mode === scene ? 'lab__scene-tab is-active' : 'lab__scene-tab'}
                key={mode}
                to={sceneLink(mode)}
              >
                {mode}
              </Link>
            ))}
          </nav>

          <div className="lab__sun-control">
            <Badge variant="outline">
              <Sun aria-hidden="true" />
              {sunAngle.toFixed(2)}
            </Badge>
            <Slider
              className="lab__sun-slider"
              max={Math.PI * 2}
              min={0}
              onValueChange={(value) => setParam('sun', sliderValue(value, sunAngle))}
              step={0.01}
              value={[sunAngle]}
            />
          </div>
        </header>

        <section className={isInspectorOpen ? 'lab__stage' : 'lab__stage is-inspector-collapsed'}>
          <aside className="lab__inspector" aria-label="Shader controls">
            <div className="lab__inspector-heading">
              <span>
                <SlidersHorizontal aria-hidden="true" />
                Controls
              </span>
              <Badge variant="secondary">{controls.length}</Badge>
            </div>

            <div className="lab__control-stack">
              {controls.map((control) => (
                <label className="lab__control" key={control.key}>
                  <span className="lab__control-label">
                    <span>{control.label}</span>
                    <Badge size="sm" variant="outline">
                      {settings[control.key].toFixed(2)}
                    </Badge>
                  </span>
                  <Slider
                    max={control.max}
                    min={control.min}
                    onValueChange={(value) => setParam(control.key, sliderValue(value, settings[control.key]))}
                    step={control.step}
                    value={[settings[control.key]]}
                  />
                </label>
              ))}
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
            <Badge variant="outline">battery ok</Badge>
            <Badge variant="outline">/lab/{scene}</Badge>
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
