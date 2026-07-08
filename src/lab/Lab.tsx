import { useMemo } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { siteVisualConfig } from '../siteVisualConfig'
import { shadowMapModes, type ShadowMapMode } from '../shadowMapModes'
import V2ShadowLayer, { type ShadowSettings } from '../V2ShadowLayer'
import { LabShell, type LabControl, type LabInspectorTarget } from './LabShell'
import {
  buildLabScene,
  isLabScenePresetId,
  isShadowLayerPresetId,
  isTextLayerPresetId,
  labScenePresetIds,
  textLayerPresets,
  type LabLayer,
} from './labModel'
import './coss.css'
import './Lab.css'

// The lab is a dev-only shader/scene workshop. It is lazy-loaded and excluded
// from the production bundle (see main.tsx), so it can stay elaborate without
// weighing down the shipped page.
//
// State model: URL-as-state. The route selects the scene composition while the
// query string owns the active scene preset, layer presets, layer toggles, and
// editable params. That keeps prototypes bookmarkable and makes mix/match
// experiments cheap to share without introducing a store too early.

// Page-lighting note: production derives shadowTint / crispnessScale /
// opacityScale from the animated day-cycle sun angle (App.tsx). The lab uses
// static neutral page-lighting for now and drives only the shader's own sun
// angle. Day-cycle-accurate tinting belongs on the planned scene time control;
// when it lands we extract App's derivation into a shared helper so the two
// views can't drift.
const NEUTRAL_TINT = [0.08, 0.09, 0.12] as const
const DEFAULT_SUN = siteVisualConfig.shadowSettings.sunAngle

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

  const scenePresetParam = searchParams.get('scenePreset')
  const shadowPresetParam = searchParams.get('shadowPreset')
  const textPresetParam = searchParams.get('textPreset')
  const scenePresetId = isLabScenePresetId(scenePresetParam) ? scenePresetParam : resolvedSceneId
  const shadowPresetId = isShadowLayerPresetId(shadowPresetParam) ? shadowPresetParam : scenePresetId
  const textPresetId = isTextLayerPresetId(textPresetParam) ? textPresetParam : 'headline'

  const shadowSettings = useMemo<ShadowSettings>(() => {
    const base = { ...siteVisualConfig.shadowSettings } as ShadowSettings
    for (const { key } of SHADOW_CONTROLS) {
      base[key] = readNumber(searchParams, key, base[key])
    }
    return base
  }, [searchParams])

  const textConfig = useMemo(() => {
    const base = textLayerPresets[textPresetId]
    return {
      opacity: readNumber(searchParams, 'textOpacity', base.opacity),
      size: readNumber(searchParams, 'textSize', base.size),
      text: searchParams.get('text') ?? base.text,
      x: readNumber(searchParams, 'textX', base.x),
      y: readNumber(searchParams, 'textY', base.y),
    }
  }, [searchParams, textPresetId])

  const scene = useMemo(
    () =>
      buildLabScene({
        sceneId: resolvedSceneId,
        scenePresetId,
        shadowEnabled: readEnabled(searchParams, 'shadow'),
        shadowPresetId,
        textConfig,
        textEnabled: readEnabled(searchParams, 'text'),
        textPresetId,
      }),
    [resolvedSceneId, scenePresetId, searchParams, shadowPresetId, textConfig, textPresetId],
  )

  if (!isValidScene(sceneId)) {
    return <Navigate to="/lab/pool" replace />
  }

  const sunAngle = readNumber(searchParams, 'sun', DEFAULT_SUN)
  const inspectParam = searchParams.get('inspect')
  const inspectorTarget: LabInspectorTarget =
    inspectParam === 'shadow' || inspectParam === 'text' ? { layerId: inspectParam, type: 'layer' } : { type: 'scene' }

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
    const payload = {
      scene,
      shadowSettings,
      sunAngle,
    }
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
  }

  return (
    <LabShell
      controls={SHADOW_CONTROLS}
      copyJson={copyJson}
      inspectorTarget={inspectorTarget}
      scene={scene}
      sceneLink={sceneLink}
      scenePresetIds={labScenePresetIds}
      scenes={shadowMapModes}
      setInspectorTarget={(target) => setQuery('inspect', target.type === 'scene' ? null : target.layerId)}
      setLayerEnabled={(layerId, enabled) => setQuery(`${layerId}Enabled`, enabled ? 1 : 0)}
      setScenePreset={(presetId) => setQuery('scenePreset', presetId)}
      setShadowParam={setQuery}
      setShadowPreset={(presetId) => setQuery('shadowPreset', presetId)}
      setSunAngle={(value) => setQuery('sun', value)}
      setTextParam={(key, value) => setQuery(`text${key[0].toUpperCase()}${key.slice(1)}`, value)}
      setTextPreset={(presetId) => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('textPreset', presetId)
            next.delete('text')
            next.delete('textSize')
            next.delete('textX')
            next.delete('textY')
            next.delete('textOpacity')
            return next
          },
          { replace: true },
        )
      }}
      setTextValue={(value) => setQuery('text', value)}
      shadowSettings={shadowSettings}
      sunAngle={sunAngle}
    >
      {scene.layers.map((layer) => {
        if (!layer.enabled) return null
        if (layer.kind === 'text') {
          return (
            <div className="lab__render-layer lab__text-layer" key={layer.id}>
              <span
                style={{
                  fontSize: `${layer.config.size}px`,
                  left: `${layer.config.x}%`,
                  opacity: layer.config.opacity,
                  top: `${layer.config.y}%`,
                }}
              >
                {layer.config.text}
              </span>
            </div>
          )
        }
        return (
          <div className="lab__render-layer lab__shadow-layer" key={layer.id}>
            <V2ShadowLayer
              crispnessScale={1}
              mode={layer.presetId}
              opacityScale={1}
              settings={shadowSettings}
              shadowTint={NEUTRAL_TINT}
              sunAngle={sunAngle}
            />
          </div>
        )
      })}
    </LabShell>
  )
}
