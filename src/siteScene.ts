// Promote a lab scene to the live homepage — in code, no UI.
//
// The homepage doesn't render via the lab's LayerStack (that's where the
// animation/battery/responsive logic lives); it just needs its BASE config.
// sceneToSiteConfig maps a saved scene's layers onto the fields the homepage
// consumes, so promoting a scene is a one-liner: set PROMOTED_SCENE_ID below.
//
// Constraint: this maps the homepage's fixed shape — one shadow, one gradient,
// one sun indicator. A scene with multiple shadow layers can't be represented
// here; the first enabled one wins.

import type { BackgroundMode } from './HomeSunGradientConfig'
import type { Scene } from './lab/scene'
import { getSceneById } from './lab/sceneStore'
import type { ShadowMapMode } from './shadowMapModes'
import { siteVisualConfig } from './siteVisualConfig'
import type { SunWidgetVariant } from './SunWidget'
import type { ShadowSettings } from './V2ShadowLayer'

// Set to a saved scene id to drive the homepage from it, or null to use the
// hand-written siteVisualConfig defaults.
export const PROMOTED_SCENE_ID: string | null = null

// The shadow knobs the lab exposes; everything else stays at the site default.
const SHADOW_KEYS = ['lightGlow', 'opacity', 'contrast', 'depthMix', 'density', 'scale'] as const

export type SiteSceneConfig = {
  background: BackgroundMode
  shadowMapMode: ShadowMapMode
  shadowSettings: ShadowSettings
  sunWidget: SunWidgetVariant
  showSunWidget: boolean
}

export function sceneToSiteConfig(scene: Scene): SiteSceneConfig {
  const shadow = scene.layers.find((layer) => layer.type === 'shadow' && layer.enabled)
  const gradient = scene.layers.find((layer) => layer.type === 'sunGradient' && layer.enabled)
  const sun = scene.layers.find((layer) => layer.type === 'sunWidget' && layer.enabled)

  const shadowSettings = { ...siteVisualConfig.shadowSettings, sunAngle: scene.sunAngle } as ShadowSettings
  if (shadow) {
    for (const key of SHADOW_KEYS) {
      const value = shadow.config[key]
      if (typeof value === 'number') shadowSettings[key] = value
    }
  }

  return {
    background: (gradient?.config.mode as BackgroundMode) ?? siteVisualConfig.background,
    shadowMapMode: (shadow?.config.preset as ShadowMapMode) ?? siteVisualConfig.shadowMapMode,
    shadowSettings,
    sunWidget: (sun?.config.variant as SunWidgetVariant) ?? 'gnomon',
    showSunWidget: Boolean(sun),
  }
}

const promoted = PROMOTED_SCENE_ID ? getSceneById(PROMOTED_SCENE_ID) : undefined

// The effective base config for the homepage: a promoted scene if set, else the
// site defaults.
export const activeSiteConfig: SiteSceneConfig = promoted
  ? sceneToSiteConfig(promoted)
  : {
      background: siteVisualConfig.background,
      shadowMapMode: siteVisualConfig.shadowMapMode,
      shadowSettings: { ...siteVisualConfig.shadowSettings } as ShadowSettings,
      sunWidget: 'gnomon',
      showSunWidget: true,
    }
