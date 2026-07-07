import type { ShadowMapMode } from './shadowMapModes'

export type ShadowSourcePreview = {
  dataUrl?: string
  height: number
  mode: ShadowMapMode
  sampler?: {
    contributingSamples: number
    points: ShadowSourceSamplerPoint[]
    sampleX: number
    sampleY: number
    shadowFactor: number
  }
  width: number
}

export type ShadowSourceSamplerPoint = {
  casterSize: number
  contributes: boolean
  hitCaster: boolean
  x: number
  y: number
}

const listeners = new Set<(preview: ShadowSourcePreview | null) => void>()
let currentPreview: ShadowSourcePreview | null = null

export function publishShadowSourcePreview(preview: ShadowSourcePreview) {
  currentPreview = preview
  listeners.forEach((listener) => listener(currentPreview))
}

export function getShadowSourcePreview() {
  return currentPreview
}

export function subscribeShadowSourcePreview(listener: (preview: ShadowSourcePreview | null) => void) {
  listeners.add(listener)
  listener(currentPreview)

  return () => {
    listeners.delete(listener)
  }
}
