import * as THREE from 'three'

// Shared foliage/layout primitives for the shadow layers. v2 (caster-map
// shader) and v3 (PCSS scene) consume the same leaf geometry and layout
// tables so the tree reads identically across pipelines.

export function stableNoise(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function getDensityCount(count: number, density: number) {
  return Math.max(1, Math.round(count * Math.max(0.1, density)))
}

// Procedural oak leaf: base at (-1, 0), tip at (1, 0). An obovate envelope
// (widest past the middle) is cut by rounded lobes with deep sinuses -- the
// signature oak margin. Margin roughness is notch-scale (not tooth-scale) so
// it survives shadow blur; phase offsets keep the two sides from mirroring.
export function makeOakLeafGeometry(lobeCount: number, lobeDepth: number, halfWidth: number, phase: number) {
  const samples = 72
  const envelopePeak = Math.pow(0.62, 0.9) * Math.pow(0.38, 0.55)
  const envelope = (u: number) => (Math.pow(u, 0.9) * Math.pow(1 - u, 0.55)) / envelopePeak
  const ramp = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }
  const sideWidth = (u: number, sidePhase: number, scale: number) => {
    // lobe amplitude fades near the stem and the tip so both stay smooth
    const amp = ramp(0.12, 0.34, u) * (1 - ramp(0.82, 0.97, u))
    const sinus = Math.pow(0.5 + 0.5 * Math.cos(u * lobeCount * Math.PI * 2 + sidePhase), 1.6)
    const serration =
      (stableNoise(u * 29 + sidePhase * 13) - 0.5) * 0.36 +
      (stableNoise(u * 13 + sidePhase * 7) - 0.5) * 0.22
    return Math.max(
      0.004,
      halfWidth * scale * envelope(u) * (1 - lobeDepth * amp * sinus) * (1 + serration * amp),
    )
  }

  const upper: THREE.Vector2[] = []
  const lower: THREE.Vector2[] = []
  for (let index = 1; index < samples; index += 1) {
    const u = index / samples
    const x = -1 + u * 2
    upper.push(new THREE.Vector2(x, sideWidth(u, phase, 1)))
    lower.push(new THREE.Vector2(x, -sideWidth(u, phase + 2.4, 0.9)))
  }
  lower.reverse()

  // straight segments (no spline smoothing) keep the notches crisp; the
  // shadow blur softens them back to organic
  const shape = new THREE.Shape()
  shape.moveTo(-1, 0)
  for (const point of upper) shape.lineTo(point.x, point.y)
  shape.lineTo(1, 0)
  for (const point of lower) shape.lineTo(point.x, point.y)
  shape.lineTo(-1, 0)

  return new THREE.ShapeGeometry(shape, 24)
}

export function makeLeafGeometryVariants() {
  return [
    makeOakLeafGeometry(4, 0.62, 0.3, 0.4),
    makeOakLeafGeometry(3, 0.68, 0.34, 1.9),
    makeOakLeafGeometry(4, 0.58, 0.27, 3.1),
    makeOakLeafGeometry(5, 0.6, 0.32, 0.9),
  ]
}

// Foliage masses hung mostly along the top edge. depthBias sets
// distance-from-window per clump: near-zero keeps leaf silhouettes tight,
// the biased clump renders as a soft far layer.
export const canopyClumps = [
  { depthBias: 0, radius: 0.62, tilt: -0.42, x: -0.72, y: 0.92 },
  { depthBias: 0.04, radius: 0.52, tilt: 0.24, x: -0.02, y: 1.04 },
  { depthBias: 0.02, radius: 0.46, tilt: 0.72, x: 0.68, y: 0.86 },
  { depthBias: 0.34, radius: 0.4, tilt: -1.08, x: -1.02, y: 0.18 },
] as const

export type WindowRectSpec = {
  depth: number
  height: number
  rotation: number
  width: number
  x: number
  y: number
}

export function getWindowRects(density: number, scale: number): WindowRectSpec[] {
  const rotation = -0.13
  const slatCount = getDensityCount(10, density)
  const rects: WindowRectSpec[] = []

  for (let index = 0; index < slatCount; index += 1) {
    const t = index / Math.max(1, slatCount - 1)
    const seed = 720 + index * 19
    rects.push({
      depth: 0.36 + t * 0.42 + (stableNoise(seed + 23) - 0.5) * 0.16,
      height: (0.026 + stableNoise(seed + 5) * 0.022) * scale,
      // slats must share one rotation: per-slat angle jitter makes lines
      // converge/kink across the viewport, which crisp rendering exposes
      rotation,
      width: (2.66 + stableNoise(seed + 11) * 0.36) * scale,
      x: (stableNoise(seed + 17) - 0.5) * 0.08,
      y: 1.08 - t * 2.16 + (stableNoise(seed) - 0.5) * 0.016,
    })
  }

  rects.push({ depth: 0.38, height: 2.36 * scale, rotation, width: 0.032 * scale, x: -0.62, y: 0.04 })
  rects.push({ depth: 0.46, height: 2.26 * scale, rotation, width: 0.026 * scale, x: 0.62, y: 0 })
  rects.push({ depth: 0.5, height: 0.04 * scale, rotation, width: 2.7 * scale, x: 0, y: 1.02 })

  return rects
}
