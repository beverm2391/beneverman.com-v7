export const shadowMapModes = ['canopy', 'window', 'mixed'] as const

export type ShadowMapMode = (typeof shadowMapModes)[number]
