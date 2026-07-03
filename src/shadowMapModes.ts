export const shadowMapModes = ['canopy', 'window', 'paper', 'branch', 'mixed', 'blobs'] as const

export type ShadowMapMode = (typeof shadowMapModes)[number]
