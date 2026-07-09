// Layer registry: the single source of truth for every layer type the lab can
// compose. Adding a new layer type = add one entry here (default config,
// control schema, render). The sidebar and renderer are schema-driven, so
// nothing else needs to change.

import { HomeIntro } from '../HomeIntro'
import { HomeSunGradientLayer } from '../HomeSunGradientLayer'
import { backgroundModes } from '../HomeSunGradientConfig'
import { getHomeIntroStyle } from '../homeVisualConfig'
import { shadowMapModes, type ShadowMapMode } from '../shadowMapModes'
import { siteVisualConfig } from '../siteVisualConfig'
import { SunWidget, sunWidgetVariants, type SunWidgetVariant } from '../SunWidget'
import { cycleTimeAtSunAngle, formatTimeOfDay, sunCycleDurationSeconds } from '../sunClock'
import V2ShadowLayer, { type ShadowSettings } from '../V2ShadowLayer'
import { newInstanceId, slugify, type LayerConfig, type LayerInstance, type LayerType, type Scene } from './scene'

const NEUTRAL_TINT = [0.08, 0.09, 0.12] as const

export type Control =
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'switch'; key: string; label: string }

export type LayerDef = {
  type: LayerType
  label: string
  defaultConfig: LayerConfig
  controls: Control[]
  // Layers that can render a raw-geometry inspector get a mesh button in their
  // header; it toggles the boolean `inspect` config key.
  inspectable?: boolean
  Render: (props: { config: LayerConfig; sunAngle: number }) => React.ReactNode
}

const num = (config: LayerConfig, key: string, fallback: number) =>
  typeof config[key] === 'number' ? (config[key] as number) : fallback

// The shadow layer exposes a curated subset of ShadowSettings; everything else
// falls back to the production preset in siteVisualConfig.
const SHADOW_KNOBS = [
  { key: 'lightGlow', label: 'Light glow', min: 0, max: 1, step: 0.01 },
  { key: 'opacity', label: 'Shadow opacity', min: 0, max: 0.6, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 1.5, step: 0.01 },
  { key: 'depthMix', label: 'Depth mix', min: 0, max: 1, step: 0.01 },
  { key: 'density', label: 'Density', min: 0.2, max: 2, step: 0.05 },
  { key: 'scale', label: 'Scale', min: 0.5, max: 2.5, step: 0.05 },
] as const

const sunGradient: LayerDef = {
  type: 'sunGradient',
  label: 'Sun gradient',
  defaultConfig: { mode: siteVisualConfig.background },
  controls: [
    {
      kind: 'select',
      key: 'mode',
      label: 'Palette',
      options: backgroundModes.map((mode) => ({ value: mode.label, label: mode.label })),
    },
  ],
  Render: ({ config, sunAngle }) => {
    const mode = backgroundModes.find((m) => m.label === config.mode) ?? backgroundModes[0]
    return <HomeSunGradientLayer mode={mode} sunAngle={sunAngle} />
  },
}

const text: LayerDef = {
  type: 'text',
  label: 'Homepage text',
  defaultConfig: { opacity: 1 },
  controls: [{ kind: 'slider', key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 }],
  Render: ({ config }) => (
    <div className="lab-text-layer" style={{ ...getHomeIntroStyle(), opacity: num(config, 'opacity', 1) }}>
      <HomeIntro />
    </div>
  ),
}

const shadow: LayerDef = {
  type: 'shadow',
  label: 'Shadow',
  // Mesh inspector (header button) toggles this: show the raw caster map (the
  // geometry casting the shadow) instead of the shaded result.
  inspectable: true,
  defaultConfig: {
    preset: 'sundial',
    inspect: false,
    lightGlow: 0.6,
    opacity: 0.19,
    contrast: 0.9,
    depthMix: 0.75,
    density: 1,
    scale: 1.4,
  },
  controls: [
    {
      kind: 'select',
      key: 'preset',
      label: 'Preset',
      options: shadowMapModes.map((mode) => ({ value: mode, label: mode })),
    },
    ...SHADOW_KNOBS.map((knob) => ({ kind: 'slider' as const, ...knob })),
  ],
  Render: ({ config, sunAngle }) => {
    const settings = { ...siteVisualConfig.shadowSettings, sunAngle } as ShadowSettings
    for (const { key } of SHADOW_KNOBS) {
      settings[key] = num(config, key, settings[key])
    }
    const preset = (typeof config.preset === 'string' ? config.preset : 'sundial') as ShadowMapMode
    return (
      <V2ShadowLayer
        crispnessScale={1}
        mode={preset}
        opacityScale={1}
        settings={settings}
        shadowTint={NEUTRAL_TINT}
        showSource={config.inspect === true}
        sunAngle={sunAngle}
      />
    )
  },
}

const sunWidget: LayerDef = {
  type: 'sunWidget',
  label: 'Sun indicator',
  defaultConfig: { variant: 'gnomon', showTime: false },
  controls: [
    {
      kind: 'select',
      key: 'variant',
      label: 'Style',
      options: sunWidgetVariants.map((variant) => ({ value: variant, label: variant })),
    },
    { kind: 'switch', key: 'showTime', label: 'Show time' },
  ],
  Render: ({ config, sunAngle }) => {
    const variant = (sunWidgetVariants as readonly string[]).includes(config.variant as string)
      ? (config.variant as SunWidgetVariant)
      : 'gnomon'
    const time = formatTimeOfDay(cycleTimeAtSunAngle(Math.PI - sunAngle) / sunCycleDurationSeconds)
    return (
      <div aria-hidden className="lab-sun-widget">
        <SunWidget angle={sunAngle} variant={variant} />
        {config.showTime === true ? <span className="sun-widget-clock">{time}</span> : null}
      </div>
    )
  },
}

export const LAYER_REGISTRY: Record<LayerType, LayerDef> = { sunGradient, text, shadow, sunWidget }

// Order shown in the "add layer" picker; also the default new-scene stack
// (top of the list = front-most).
export const LAYER_TYPES: LayerType[] = ['sunWidget', 'shadow', 'text', 'sunGradient']

export function getLayerDef(type: LayerType): LayerDef {
  return LAYER_REGISTRY[type]
}

export function createLayerInstance(type: LayerType): LayerInstance {
  return {
    instanceId: newInstanceId(),
    type,
    enabled: true,
    config: { ...getLayerDef(type).defaultConfig },
  }
}

// A fresh scene with the full default stack (shadow over text over gradient),
// matching the seeded starter.
export function createScene(name: string): Scene {
  return {
    id: slugify(name),
    name,
    sunAngle: siteVisualConfig.shadowSettings.sunAngle,
    layers: LAYER_TYPES.map(createLayerInstance),
  }
}
