import type { ShadowMapMode } from '../shadowMapModes'

export type LabScene = {
  config: LabSceneConfig
  id: ShadowMapMode
  layers: LabLayer[]
  name: string
}

export type LabSceneConfig = {
  sunAngle: number
}

export type TextLayerConfig = {
  opacity: number
}

export type ShadowLayerConfig = {
  presetId: ShadowMapMode
}

export type TextLabLayer = {
  config: TextLayerConfig
  enabled: boolean
  id: 'text'
  kind: 'text'
  name: string
}

export type ShadowLabLayer = {
  config: ShadowLayerConfig
  enabled: boolean
  id: 'shadow'
  kind: 'shadow'
  name: string
}

export type LabLayer = TextLabLayer | ShadowLabLayer

export function buildLabScene({
  sceneId,
  shadowEnabled,
  shadowPresetId,
  sunAngle,
  textEnabled,
  textOpacity,
}: {
  sceneId: ShadowMapMode
  shadowEnabled: boolean
  shadowPresetId: ShadowMapMode
  sunAngle: number
  textEnabled: boolean
  textOpacity: number
}): LabScene {
  return {
    config: { sunAngle },
    id: sceneId,
    layers: [
      {
        config: { opacity: textOpacity },
        enabled: textEnabled,
        id: 'text',
        kind: 'text',
        name: 'Homepage text',
      },
      {
        config: { presetId: shadowPresetId },
        enabled: shadowEnabled,
        id: 'shadow',
        kind: 'shadow',
        name: 'Shadow',
      },
    ],
    name: sceneId,
  }
}
