import type { ShadowMapMode } from './shadowMapModes'

export const siteVisualConfig = {
  background: 'paper',
  font: 'geist',
  shadowMapMode: 'mixed' satisfies ShadowMapMode,
  shadowSettings: {
    crispness: 3,
    density: 1,
    opacity: 0.19,
    scale: 1.4,
    speed: 0.55,
    strength: 1.5,
    sunAngle: 2.95,
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
  responsivePresets: {
    mobilePortrait: {
      maxAspect: 1.25,
      shadowSettings: {
        crispness: 3,
        density: 1.45,
        opacity: 0.2,
        scale: 1.35,
        speed: 1.1,
        strength: 1.5,
        sunAngle: 2.95,
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
    },
  },
} as const
