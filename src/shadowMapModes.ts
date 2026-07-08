export const shadowMapModes = ['canopy', 'window', 'paper', 'branch', 'mixed', 'blobs'] as const

export type ShadowMapMode = (typeof shadowMapModes)[number]

// Distinct canopy aesthetics selectable from the debug panel; the generator
// parameterizations live in V2ShadowLayer. This module stays THREE-free so
// the eager App chunk can import it without pulling in three.js.
export const canopyStyles = ['oak', 'willow', 'sparse'] as const

export type CanopyStyle = (typeof canopyStyles)[number]
