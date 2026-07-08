import { useMemo } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { HomeIntro } from '../HomeIntro'
import { backgroundModes, type BackgroundMode } from '../HomeSunGradientConfig'
import { HomeSunGradientLayer } from '../HomeSunGradientLayer'
import { getHomeIntroStyle } from '../homeVisualConfig'
import { siteVisualConfig } from '../siteVisualConfig'
import { shadowMapModes, type ShadowMapMode } from '../shadowMapModes'
import V2ShadowLayer, { type ShadowSettings } from '../V2ShadowLayer'
import { LabShell, type LabControl } from './LabShell'
import { buildLabScene, type LabLayer } from './labModel'
import './coss.css'
import './Lab.css'

const NEUTRAL_TINT = [0.08, 0.09, 0.12] as const
const DEFAULT_SUN = siteVisualConfig.shadowSettings.sunAngle
const DEFAULT_TEXT_OPACITY = 1

const SHADOW_CONTROLS: LabControl[] = [
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

function isValidBackgroundMode(id: string | null): id is BackgroundMode {
  return !!id && backgroundModes.some((mode) => mode.label === id)
}

function readNumber(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function readEnabled(params: URLSearchParams, layerId: LabLayer['id']) {
  return params.get(`${layerId}Enabled`) !== '0'
}

export default function Lab() {
  const { sceneId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const resolvedSceneId: ShadowMapMode = isValidScene(sceneId) ? sceneId : 'pool'

  const shadowPresetParam = searchParams.get('shadowPreset')
  const sunGradientModeParam = searchParams.get('sunGradientMode')
  const shadowPresetId: ShadowMapMode = shadowPresetParam && isValidScene(shadowPresetParam) ? shadowPresetParam : resolvedSceneId
  const sunGradientMode = isValidBackgroundMode(sunGradientModeParam) ? sunGradientModeParam : siteVisualConfig.background
  const sunAngle = readNumber(searchParams, 'sun', DEFAULT_SUN)
  const textOpacity = readNumber(searchParams, 'textOpacity', DEFAULT_TEXT_OPACITY)
  const homeIntroStyle = getHomeIntroStyle()

  const shadowSettings = useMemo<ShadowSettings>(() => {
    const base = { ...siteVisualConfig.shadowSettings } as ShadowSettings
    for (const { key } of SHADOW_CONTROLS) {
      base[key] = readNumber(searchParams, key, base[key])
    }
    return base
  }, [searchParams])

  const scene = useMemo(
    () =>
      buildLabScene({
        sceneId: resolvedSceneId,
        shadowEnabled: readEnabled(searchParams, 'shadow'),
        shadowPresetId,
        sunAngle,
        sunGradientEnabled: readEnabled(searchParams, 'sunGradient'),
        sunGradientMode,
        textEnabled: readEnabled(searchParams, 'text'),
        textOpacity,
      }),
    [resolvedSceneId, searchParams, shadowPresetId, sunAngle, sunGradientMode, textOpacity],
  )

  if (!isValidScene(sceneId)) {
    return <Navigate to="/lab/pool" replace />
  }

  const setQuery = (key: string, value: string | number | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, String(value))
        return next
      },
      { replace: true },
    )
  }

  const sceneLink = (mode: ShadowMapMode) => ({
    pathname: `/lab/${mode}`,
    search: searchParams.toString(),
  })

  const copyJson = () => {
    navigator.clipboard?.writeText(JSON.stringify({ scene, shadowSettings }, null, 2))
  }

  return (
    <LabShell
      controls={SHADOW_CONTROLS}
      copyJson={copyJson}
      scene={scene}
      sceneLink={sceneLink}
      scenes={shadowMapModes}
      setLayerEnabled={(layerId, enabled) => setQuery(`${layerId}Enabled`, enabled ? 1 : 0)}
      setShadowParam={setQuery}
      setShadowPreset={(presetId) => setQuery('shadowPreset', presetId)}
      setSunAngle={(value) => setQuery('sun', value)}
      setSunGradientMode={(mode) => setQuery('sunGradientMode', mode)}
      setTextOpacity={(value) => setQuery('textOpacity', value)}
      shadowSettings={shadowSettings}
    >
      {scene.layers.map((layer) => {
        if (!layer.enabled) return null
        if (layer.kind === 'sunGradient') {
          const mode = backgroundModes.find((backgroundMode) => backgroundMode.label === layer.config.mode) ?? backgroundModes[0]
          return (
            <div className="lab__render-layer lab__sun-gradient-layer" key={layer.id}>
              <HomeSunGradientLayer mode={mode} sunAngle={scene.config.sunAngle} />
            </div>
          )
        }
        if (layer.kind === 'text') {
          return (
            <div
              className="lab__render-layer lab__homepage-text-layer"
              key={layer.id}
              style={{ ...homeIntroStyle, opacity: layer.config.opacity }}
            >
              <HomeIntro />
            </div>
          )
        }
        return (
          <div className="lab__render-layer lab__shadow-layer" key={layer.id}>
            <V2ShadowLayer
              crispnessScale={1}
              mode={layer.config.presetId}
              opacityScale={1}
              settings={shadowSettings}
              shadowTint={NEUTRAL_TINT}
              sunAngle={scene.config.sunAngle}
            />
          </div>
        )
      })}
    </LabShell>
  )
}
