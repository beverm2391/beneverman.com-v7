import { useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { siteVisualConfig } from '../siteVisualConfig'
import { shadowMapModes, type ShadowMapMode } from '../shadowMapModes'
import V2ShadowLayer, { type ShadowSettings } from '../V2ShadowLayer'
import './Lab.css'

// The lab is a dev-only shader/scene workshop. It is lazy-loaded and excluded
// from the production bundle (see main.tsx), so it can stay elaborate without
// weighing down the shipped page.
//
// State model: URL-as-state. The scene lives in the path (/lab/:sceneId) and
// every tweaked setting lives in the query string (/lab/pool?lightRays=0.8).
// The browser owns the state -- that makes the view bookmarkable, shareable,
// and turns "copy settings" into "read the current params". No store, no
// localStorage.

// Page-lighting note: production derives shadowTint / crispnessScale /
// opacityScale from the animated day-cycle sun angle (App.tsx). The lab uses
// static neutral page-lighting for now and drives only the shader's own sun
// angle. Day-cycle-accurate tinting belongs on the planned top-bar time
// scrubber; when it lands we extract App's derivation into a shared helper so
// the two views can't drift.
const NEUTRAL_TINT = [0.08, 0.09, 0.12] as const
const DEFAULT_SUN = siteVisualConfig.shadowSettings.sunAngle

// The controls exposed as sliders in the scaffold. Kept as one flat list on
// purpose -- per-scene param filtering is a co-design decision, not baked in
// yet. These are placeholders: swap the native inputs for Ben's UI primitives.
type NumericSetting = Exclude<keyof ShadowSettings, 'canopyStyle'>
type Control = { key: NumericSetting; label: string; min: number; max: number; step: number }
const CONTROLS: Control[] = [
  { key: 'lightRays', label: 'Light rays', min: 0, max: 1, step: 0.01 },
  { key: 'rayDiffusion', label: 'Ray diffusion', min: 0, max: 1, step: 0.01 },
  { key: 'lightGlow', label: 'Light glow', min: 0, max: 1, step: 0.01 },
  { key: 'opacity', label: 'Shadow opacity', min: 0, max: 0.6, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 1.5, step: 0.01 },
  { key: 'depthMix', label: 'Depth mix', min: 0, max: 1, step: 0.01 },
  { key: 'density', label: 'Density', min: 0.2, max: 2, step: 0.05 },
  { key: 'scale', label: 'Scale', min: 0.5, max: 2.5, step: 0.05 },
]

function isValidScene(id: string | undefined): id is ShadowMapMode {
  return !!id && (shadowMapModes as readonly string[]).includes(id)
}

export default function Lab() {
  const { sceneId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  // Effective settings = production preset with any URL overrides applied.
  // Computed before the validity guard so hooks run unconditionally.
  const settings = useMemo<ShadowSettings>(() => {
    const base = { ...siteVisualConfig.shadowSettings } as ShadowSettings
    for (const { key } of CONTROLS) {
      const raw = searchParams.get(key)
      if (raw !== null && raw !== '') base[key] = Number(raw)
    }
    return base
  }, [searchParams])

  // Redirect unknown scenes to a sane default rather than crash.
  if (!isValidScene(sceneId)) {
    return <Navigate to="/lab/pool" replace />
  }
  const scene: ShadowMapMode = sceneId

  const sunAngle = Number(searchParams.get('sun') ?? DEFAULT_SUN)

  const setParam = (key: string, value: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(key, String(value))
        return next
      },
      { replace: true },
    )
  }

  // Preserve the current tweaks when switching scenes.
  const sceneLink = (mode: ShadowMapMode) => ({
    pathname: `/lab/${mode}`,
    search: searchParams.toString(),
  })

  const copyJson = () => {
    const payload = { shadowMapMode: scene, shadowSettings: settings, sunAngle }
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
  }

  return (
    <div className="lab">
      {/* TOP BAR — scene switcher + sun angle. Placeholder chrome. */}
      <header className="lab__topbar">
        <nav className="lab__scenes">
          {shadowMapModes.map((mode) => (
            <Link
              key={mode}
              to={sceneLink(mode)}
              className={mode === scene ? 'lab__scene lab__scene--active' : 'lab__scene'}
            >
              {mode}
            </Link>
          ))}
        </nav>
        <label className="lab__sun">
          sun {sunAngle.toFixed(2)}
          <input
            type="range"
            min={0}
            max={Math.PI * 2}
            step={0.01}
            value={sunAngle}
            onChange={(e) => setParam('sun', Number(e.target.value))}
          />
        </label>
      </header>

      <div className="lab__body">
        {/* LEFT SIDEBAR — param controls. Placeholder native inputs. */}
        <aside className="lab__sidebar">
          {CONTROLS.map((control) => (
            <label key={control.key} className="lab__control">
              <span className="lab__control-label">
                {control.label}
                <em>{settings[control.key].toFixed(2)}</em>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={settings[control.key]}
                onChange={(e) => setParam(control.key, Number(e.target.value))}
              />
            </label>
          ))}
        </aside>

        {/* CENTER — live preview over paper. */}
        <main className="lab__preview">
          <V2ShadowLayer
            crispnessScale={1}
            mode={scene}
            opacityScale={1}
            settings={settings}
            shadowTint={NEUTRAL_TINT}
            sunAngle={sunAngle}
          />
        </main>
      </div>

      {/* BOTTOM BAR — status + copy JSON. Placeholder chrome. */}
      <footer className="lab__bottombar">
        <span className="lab__status">
          {scene} · {CONTROLS.length} params
        </span>
        <button type="button" className="lab__copy" onClick={copyJson}>
          Copy settings JSON
        </button>
      </footer>
    </div>
  )
}
