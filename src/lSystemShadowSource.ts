export type LSystemSegment = {
  depth: number
  thickness: number
  x1: number
  x2: number
  y1: number
  y2: number
}

export type LSystemLeaf = {
  bend: number
  depth: number
  length: number
  rotation: number
  width: number
  x: number
  y: number
}

export type LSystemBlob = {
  depth: number
  radiusX: number
  radiusY: number
  rotation: number
  x: number
  y: number
}

type TurtleState = {
  angle: number
  depth: number
  step: number
  thickness: number
  x: number
  y: number
}

type LSystemSource = {
  blobs: LSystemBlob[]
  leaves: LSystemLeaf[]
  segments: LSystemSegment[]
}

function stableNoise(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function pickVariant(variants: string[], seed: number) {
  return variants[Math.floor(stableNoise(seed) * variants.length) % variants.length]
}

function rewriteLSystem(iterations: number, seedOffset: number) {
  const rules: Record<string, string[]> = {
    F: ['F', 'FF', 'F[+L]F', 'F[-L]F'],
    X: [
      'F[+X][-X]FLX',
      'F[-X][+LX]FX',
      'F[+L]F[-X]X',
      'F[+X]F[-LX][L]',
      'F[-L][+X]FL',
    ],
  }
  let sentence = 'X'

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    sentence = Array.from(sentence, (token, index) => {
      const variants = rules[token]
      if (!variants) return token

      return pickVariant(variants, seedOffset + iteration * 997 + index * 37)
    }).join('')
  }

  return sentence
}

function readLSystem(sentence: string, root: TurtleState, seedOffset: number, density: number) {
  const source: LSystemSource = {
    blobs: [],
    leaves: [],
    segments: [],
  }
  const stack: TurtleState[] = []
  let state: TurtleState = { ...root }
  let tokenIndex = 0

  for (const token of sentence) {
    const seed = seedOffset + tokenIndex * 17

    if (token === 'F') {
      const step = state.step * (0.82 + stableNoise(seed + 1) * 0.32)
      const nextX = state.x + Math.cos(state.angle) * step
      const nextY = state.y + Math.sin(state.angle) * step

      if (Math.abs(nextX) < 1.45 && Math.abs(nextY) < 1.35) {
        source.segments.push({
          depth: state.depth + (stableNoise(seed + 3) - 0.5) * 0.12,
          thickness: state.thickness,
          x1: state.x,
          x2: nextX,
          y1: state.y,
          y2: nextY,
        })
      }

      state = {
        ...state,
        depth: Math.min(0.82, state.depth + 0.018),
        step: state.step * 0.965,
        thickness: state.thickness * 0.96,
        x: nextX,
        y: nextY,
      }
    }

    if (token === 'L' && Math.abs(state.x) < 1.35 && Math.abs(state.y) < 1.25) {
      const direction = stableNoise(seed + 5) > 0.5 ? 1 : -1
      source.leaves.push({
        bend: (stableNoise(seed + 7) - 0.5) * 0.18,
        depth: Math.min(0.9, state.depth + stableNoise(seed + 11) * 0.18),
        length: (0.034 + stableNoise(seed + 13) * 0.045) * density,
        rotation: state.angle + direction * (0.7 + stableNoise(seed + 17) * 0.6),
        width: (0.01 + stableNoise(seed + 19) * 0.014) * density,
        x: state.x,
        y: state.y,
      })
    }

    if (token === '+') {
      state = {
        ...state,
        angle: state.angle + 0.48 + stableNoise(seed + 23) * 0.34,
        depth: Math.min(0.86, state.depth + 0.025),
        step: state.step * 0.9,
        thickness: state.thickness * 0.92,
      }
    }

    if (token === '-') {
      state = {
        ...state,
        angle: state.angle - 0.48 - stableNoise(seed + 29) * 0.34,
        depth: Math.min(0.86, state.depth + 0.025),
        step: state.step * 0.9,
        thickness: state.thickness * 0.92,
      }
    }

    if (token === '[') stack.push({ ...state })
    if (token === ']') {
      const previousState = stack.pop()
      if (previousState) state = previousState
    }

    tokenIndex += 1
  }

  return source
}

function mergeSources(sources: LSystemSource[]) {
  return sources.reduce<LSystemSource>(
    (merged, source) => ({
      blobs: [...merged.blobs, ...source.blobs],
      leaves: [...merged.leaves, ...source.leaves],
      segments: [...merged.segments, ...source.segments],
    }),
    { blobs: [], leaves: [], segments: [] },
  )
}

export function createLeafLSystemSource(density: number) {
  const iterations = 4
  const densityScale = Math.max(0.72, Math.min(1.28, density))
  const roots: TurtleState[] = [
    { angle: -0.08, depth: 0.38, step: 0.12, thickness: 0.012, x: -1.12, y: 0.66 },
    { angle: 0.04, depth: 0.48, step: 0.108, thickness: 0.01, x: -1.06, y: 0.18 },
    { angle: -0.12, depth: 0.58, step: 0.1, thickness: 0.009, x: -0.94, y: -0.42 },
    { angle: 0.22, depth: 0.44, step: 0.072, thickness: 0.008, x: -0.2, y: 0.78 },
    { angle: -0.44, depth: 0.52, step: 0.068, thickness: 0.007, x: 0.22, y: -0.72 },
  ]

  return mergeSources(roots.map((root, index) => {
    const seedOffset = 2000 + index * 701
    return readLSystem(rewriteLSystem(iterations, seedOffset), root, seedOffset, densityScale)
  }))
}

export function createBlobLSystemSource(density: number) {
  const iterations = density > 1.15 ? 4 : 3
  const densityScale = Math.max(0.78, Math.min(1.35, density))
  const source = mergeSources([
    readLSystem(
      rewriteLSystem(iterations, 5100),
      { angle: 0.02, depth: 0.42, step: 0.11, thickness: 0.01, x: -0.98, y: 0.28 },
      5100,
      densityScale,
    ),
    readLSystem(
      rewriteLSystem(iterations, 5900),
      { angle: -0.2, depth: 0.54, step: 0.086, thickness: 0.009, x: -0.74, y: -0.3 },
      5900,
      densityScale,
    ),
    readLSystem(
      rewriteLSystem(iterations, 6400),
      { angle: 0.42, depth: 0.46, step: 0.064, thickness: 0.007, x: 0.18, y: 0.34 },
      6400,
      densityScale,
    ),
  ])
  const blobSeeds = [...source.leaves, ...source.segments.filter((_, index) => index % 3 === 0).map((segment) => ({
    depth: segment.depth,
    length: 0.08,
    rotation: Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1),
    width: 0.04,
    x: segment.x2,
    y: segment.y2,
  }))]
  const pockets = [
    { radius: 0.48, x: -0.34, y: -0.42 },
    { radius: 0.38, x: 0.22, y: -0.2 },
    { radius: 0.32, x: -0.08, y: 0.22 },
  ]

  const clusteredBlobs = blobSeeds
    .filter((_, index) => index % Math.max(1, Math.round(1.35 / densityScale)) === 0)
    .map((blob, index) => {
      const seed = 7200 + index * 31
      const pocketStrength = Math.max(
        ...pockets.map((pocket) => {
          const distance = Math.hypot(blob.x - pocket.x, blob.y - pocket.y)
          return Math.max(0, 1 - distance / pocket.radius)
        }),
      )

      return {
        clusterStrength: pocketStrength,
        depth: Math.min(0.9, blob.depth + stableNoise(seed + 1) * 0.16),
        radiusX: (0.014 + stableNoise(seed + 3) * 0.03) * densityScale * (0.72 + pocketStrength * 0.56),
        radiusY: (0.007 + stableNoise(seed + 5) * 0.018) * densityScale * (0.72 + pocketStrength * 0.56),
        rotation: blob.rotation + (stableNoise(seed + 7) - 0.5) * 0.9,
        x: blob.x + (stableNoise(seed + 11) - 0.5) * 0.08,
        y: blob.y + (stableNoise(seed + 13) - 0.5) * 0.08,
      }
    })
    .filter((blob, index) => blob.clusterStrength > 0.16 || stableNoise(8400 + index * 23) > 0.82)

  return {
    blobs: clusteredBlobs.flatMap(({ clusterStrength: _clusterStrength, ...blob }, index) => {
      const seed = 9100 + index * 43
      const satellites = Array.from({ length: 2 }, (_, satelliteIndex) => {
        const satelliteSeed = seed + satelliteIndex * 101
        const distance = 0.025 + stableNoise(satelliteSeed + 1) * 0.055
        const angle = stableNoise(satelliteSeed + 3) * Math.PI * 2

        return {
          depth: Math.min(0.9, blob.depth + (stableNoise(satelliteSeed + 5) - 0.5) * 0.12),
          radiusX: blob.radiusX * (0.38 + stableNoise(satelliteSeed + 7) * 0.34),
          radiusY: blob.radiusY * (0.42 + stableNoise(satelliteSeed + 11) * 0.3),
          rotation: blob.rotation + (stableNoise(satelliteSeed + 13) - 0.5) * 1.2,
          x: blob.x + Math.cos(angle) * distance,
          y: blob.y + Math.sin(angle) * distance,
        }
      })

      return [blob, ...satellites]
    }),
    leaves: [],
    segments: [],
  } satisfies LSystemSource
}
