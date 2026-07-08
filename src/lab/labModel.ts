import { shadowMapModes, type ShadowMapMode } from '../shadowMapModes'

export type LabScenePresetId = ShadowMapMode
export type ShadowLayerPresetId = ShadowMapMode

export const textLayerPresetIds = ['headline', 'caption', 'mark'] as const
export type TextLayerPresetId = (typeof textLayerPresetIds)[number]

export type TextLayerConfig = {
  opacity: number
  size: number
  text: string
  x: number
  y: number
}

export type LabScene = {
  id: ShadowMapMode
  layers: LabLayer[]
  name: string
  presetId: LabScenePresetId
}

export type ShadowLabLayer = {
  enabled: boolean
  id: 'shadow'
  kind: 'shadow'
  name: string
  presetId: ShadowLayerPresetId
}

export type TextLabLayer = {
  config: TextLayerConfig
  enabled: boolean
  id: 'text'
  kind: 'text'
  name: string
  presetId: TextLayerPresetId
}

export type LabLayer = ShadowLabLayer | TextLabLayer

export const labScenePresetIds = shadowMapModes
export const shadowLayerPresetIds = shadowMapModes

export const textLayerPresets: Record<TextLayerPresetId, TextLayerConfig> = {
  caption: {
    opacity: 0.64,
    size: 18,
    text: 'a small light study',
    x: 10,
    y: 78,
  },
  headline: {
    opacity: 0.86,
    size: 56,
    text: 'daylight lab',
    x: 10,
    y: 44,
  },
  mark: {
    opacity: 0.72,
    size: 30,
    text: 'BE',
    x: 50,
    y: 50,
  },
}

export function isLabScenePresetId(value: string | null | undefined): value is LabScenePresetId {
  return !!value && (labScenePresetIds as readonly string[]).includes(value)
}

export function isShadowLayerPresetId(value: string | null | undefined): value is ShadowLayerPresetId {
  return !!value && (shadowLayerPresetIds as readonly string[]).includes(value)
}

export function isTextLayerPresetId(value: string | null | undefined): value is TextLayerPresetId {
  return !!value && (textLayerPresetIds as readonly string[]).includes(value)
}

export function buildLabScene({
  sceneId,
  scenePresetId,
  shadowEnabled,
  shadowPresetId,
  textConfig,
  textEnabled,
  textPresetId,
}: {
  sceneId: ShadowMapMode
  scenePresetId: LabScenePresetId
  shadowEnabled: boolean
  shadowPresetId: ShadowLayerPresetId
  textConfig: TextLayerConfig
  textEnabled: boolean
  textPresetId: TextLayerPresetId
}): LabScene {
  return {
    id: sceneId,
    layers: [
      {
        enabled: textEnabled,
        id: 'text',
        kind: 'text',
        name: 'Text',
        presetId: textPresetId,
        config: textConfig,
      },
      {
        enabled: shadowEnabled,
        id: 'shadow',
        kind: 'shadow',
        name: 'Shadow',
        presetId: shadowPresetId,
      },
    ],
    name: sceneId,
    presetId: scenePresetId,
  }
}
