import type { ShadowMapMode } from './shadowMapModes'

export const siteVisualConfig = {
  background: 'paper',
  font: 'geist',
  shadowMapMode: 'mixed' satisfies ShadowMapMode,
  shadowSettings: {
    blindStrength: 0.12,
    canopyStrength: 1,
    contrast: 1,
    crispness: 1.45,
    density: 1,
    depthMix: 0.85,
    layerSpread: 1,
    opacity: 0.24,
    resolution: 1,
    sampleCount: 100,
    samplerX: 0.52,
    samplerY: 0.5,
    scale: 1.4,
    speed: 0.55,
    strength: 1.5,
    sunAngle: 1.16,
  },
  textureSettings: {
    opacity: 0.17,
    scale: 200,
  },
  typeSettings: {
    lineHeight: 1.55,
    size: 1.02,
    tracking: 0,
    weight: 300,
    width: 35,
  },
} as const
