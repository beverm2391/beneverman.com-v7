import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { emitDebugTimelineEvent } from './debugTimeline'
import { createBlobLSystemSource, createLeafLSystemSource } from './lSystemShadowSource'
import type { ShadowMapMode } from './shadowMapModes'
import { publishShadowSourcePreview, type ShadowSourceSamplerPoint } from './shadowSourcePreview'

type ShadowTextureState = {
  dataUrl?: string
  height: number
  sampler: {
    contributingSamples: number
    points: ShadowSourceSamplerPoint[]
    sampleX: number
    sampleY: number
    shadowFactor: number
  }
  texture: THREE.DataTexture
  width: number
}

type ShadowSettings = {
  blindStrength: number
  canopyStrength: number
  contrast: number
  crispness: number
  density: number
  depthMix: number
  layerSpread: number
  opacity: number
  resolution: number
  sampleCount: number
  samplerX: number
  samplerY: number
  scale: number
  speed: number
  strength: number
  sunAngle: number
}

type ShadowDrawingSurface = HTMLCanvasElement

const maxShadowTextureDpr = 1
const maxShadowTextureSize = 960
const diskSize = 80
const diskSamples = 100
const minShadowCasterSize = 20
const maxShadowCasterSize = 300

const shadowVertexShader = `
  varying vec2 vUv;
  varying vec2 vTexCoord;

  void main() {
    vUv = uv;
    vTexCoord = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const shadowFragmentShader = `
precision highp float;
uniform sampler2D uTexture;
uniform highp float wSize;
uniform highp float hSize;
uniform highp float uTime;
uniform highp float uAnimationSpeed;
uniform highp float uAnimationStrength;
uniform highp float uEdgeCrispness;
uniform highp float uSampleCount;
uniform highp float uShadowContrast;
uniform highp float uSunAngle;
uniform highp float uWarpStrength;
uniform highp float uDepthMix;
uniform highp float uLayerSpread;

varying vec2 vTexCoord;

const float pi = 3.1415926535897932384626433832795;
const float goldenAngle = pi * (3.0 - sqrt(5.0)); // Golden angle in radians
const float diskSize = 80.0;
const int diskSamples = 100;
const float minSize = 20.;
const float maxSize = 300.;
vec3 rand(vec2 uv) {
  return vec3(
    fract(sin(dot(uv, vec2(12.75613, 38.12123))) * 13234.76575),
    fract(sin(dot(uv, vec2(19.45531, 58.46547))) * 43678.23431),
    fract(sin(dot(uv, vec2(23.67817, 78.23121))) * 93567.23423)
  );
}

float sampleShadowLayer(vec2 animatedUv, float activeSamples, float edgeCrispness, vec2 lightDirection, vec2 lightPerpendicular, float radiusScale, float projectionScale) {
  float shadowInfluence = 0.0;
  float sampleDiskSize = diskSize * radiusScale / edgeCrispness;

  for (int i = 1; i <= diskSamples; i++) {
    if (float(i) > activeSamples) {
      continue;
    }

    vec3 jitter = rand(animatedUv * vec2(wSize, hSize) + vec2(float(i) * 0.37, radiusScale * 91.0));
    float r = sampleDiskSize * sqrt((float(i) + jitter.x * 0.7) / activeSamples);
    float theta = float(i) * goldenAngle + (jitter.y - 0.5) * 1.15;

    vec2 offset;
    offset.x = r * cos(theta);
    offset.y = r * sin(theta);
    float projectedAlong = (abs(offset.y) * (1.16 + jitter.z * 0.42) + r * 0.18) * projectionScale;
    float projectedAcross = offset.x * (0.32 + jitter.x * 0.24);
    vec2 rotatedOffset = lightDirection * projectedAlong + lightPerpendicular * projectedAcross;

    vec4 color = texture2D(uTexture, animatedUv + rotatedOffset / vec2(wSize, hSize));
    if (color.r > 0.0 && color.g == 1.0) {
      float dist = length(offset);
      float size = color.r;
      size = (size * (maxSize - minSize)) + minSize;
      size = size / edgeCrispness;
      if (size / 2.0 >= dist) {
        shadowInfluence += mix(8.0, 0.5, size / maxSize) * color.b;
      }
    }
  }

  float shadowFactor = shadowInfluence / activeSamples;
  return clamp(shadowFactor * uShadowContrast, 0.0, 0.96);
}

void main() {
  vec2 uv = vTexCoord;
  uv.y = 1.0 - uv.y;
  vec2 animatedUv = uv;
  float animatedTime = uTime * uAnimationSpeed;
  animatedUv.x += sin(animatedTime * 0.24) * 0.028 * uAnimationStrength;
  animatedUv.y += cos(animatedTime * 0.18) * 0.018 * uAnimationStrength;
  animatedUv.x += sin((uv.y * 5.5) + (animatedTime * 0.32)) * 0.008 * uAnimationStrength * uWarpStrength;
  animatedUv.y += cos((uv.x * 4.0) - (animatedTime * 0.26)) * 0.006 * uAnimationStrength * uWarpStrength;
  animatedUv.x += sin((uv.y * 12.0) - (animatedTime * 0.72)) * 0.0035 * uAnimationStrength * uWarpStrength;
  animatedUv.y += cos((uv.x * 9.0) + (animatedTime * 0.58)) * 0.0025 * uAnimationStrength * uWarpStrength;

  float edgeCrispness = max(0.25, uEdgeCrispness);
  float activeSamples = clamp(uSampleCount, 1.0, float(diskSamples));
  vec2 lightDirection = normalize(vec2(cos(uSunAngle), -sin(uSunAngle)));
  vec2 lightPerpendicular = vec2(-lightDirection.y, lightDirection.x);
  float spread = max(0.05, uLayerSpread);
  float depthMix = clamp(uDepthMix, 0.0, 1.0);
  float nearLayer = sampleShadowLayer(animatedUv + lightDirection * 0.004 * spread, activeSamples, edgeCrispness * 1.35, lightDirection, lightPerpendicular, 0.58, 0.55 * spread);
  float midLayer = sampleShadowLayer(animatedUv, activeSamples, edgeCrispness, lightDirection, lightPerpendicular, 1.0, spread);
  float farLayer = sampleShadowLayer(animatedUv - lightDirection * 0.006 * spread, activeSamples, edgeCrispness * 0.72, lightDirection, lightPerpendicular, 1.62, 1.75 * spread);
  float nearWeight = mix(0.52, 0.22, depthMix);
  float midWeight = 0.42;
  float farWeight = mix(0.16, 0.48, depthMix);
  float combinedShadow = 1.0 - ((1.0 - nearLayer * nearWeight) * (1.0 - midLayer * midWeight) * (1.0 - farLayer * farWeight));
  combinedShadow = clamp(combinedShadow, 0.0, 0.96);
  vec3 color = vec3(1.0 - combinedShadow);

  gl_FragColor = vec4(color, 1.0);
}
`

function getShadowTextureSize(width: number, height: number, resolution: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxShadowTextureDpr)
  const maxTextureSize = maxShadowTextureSize * Math.max(0.25, resolution)
  const scale = Math.min(1, maxTextureSize / Math.max(width * dpr, height * dpr))

  return {
    height: Math.max(1, Math.round(height * dpr * scale)),
    width: Math.max(1, Math.round(width * dpr * scale)),
  }
}

function createDrawingSurface(width: number, height: number) {
  const surface: ShadowDrawingSurface = document.createElement('canvas')

  surface.width = width
  surface.height = height

  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to create shadow texture drawing context.')

  return { context, surface }
}

function stableNoise(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function getCasterColor(depth: number, strength = 1) {
  const casterDepth = Math.round(Math.max(0, Math.min(1, depth)) * 255)
  const casterStrength = Math.round(Math.max(0, Math.min(1, strength)) * 255)
  return `rgb(${casterDepth}, 255, ${casterStrength})`
}

function getDensityCount(count: number, density: number) {
  return Math.max(1, Math.round(count * Math.max(0.1, density)))
}

function paintEllipse(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  depth: number,
  rotation = 0,
  strength = 1,
) {
  context.save()
  context.translate(centerX, centerY)
  context.rotate(rotation)
  context.scale(radiusX, radiusY)
  context.fillStyle = getCasterColor(depth, strength)
  context.beginPath()
  context.arc(0, 0, 1, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function paintRect(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  depth: number,
  rotation = 0,
  strength = 1,
) {
  context.save()
  context.translate(centerX, centerY)
  context.rotate(rotation)
  context.fillStyle = getCasterColor(depth, strength)
  context.fillRect(width * -0.5, height * -0.5, width, height)
  context.restore()
}

function paintRoundedRect(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  radius: number,
  depth: number,
  rotation = 0,
  strength = 1,
) {
  const halfWidth = width * 0.5
  const halfHeight = height * 0.5
  const cornerRadius = Math.min(radius, halfWidth, halfHeight)

  context.save()
  context.translate(centerX, centerY)
  context.rotate(rotation)
  context.fillStyle = getCasterColor(depth, strength)
  context.beginPath()
  context.moveTo(-halfWidth + cornerRadius, -halfHeight)
  context.lineTo(halfWidth - cornerRadius, -halfHeight)
  context.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + cornerRadius)
  context.lineTo(halfWidth, halfHeight - cornerRadius)
  context.quadraticCurveTo(halfWidth, halfHeight, halfWidth - cornerRadius, halfHeight)
  context.lineTo(-halfWidth + cornerRadius, halfHeight)
  context.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - cornerRadius)
  context.lineTo(-halfWidth, -halfHeight + cornerRadius)
  context.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + cornerRadius, -halfHeight)
  context.fill()
  context.restore()
}

function paintCurvedStroke(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
  lineWidth: number,
  depth: number,
  strength = 1,
) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = lineWidth
  context.strokeStyle = getCasterColor(depth, strength)
  context.beginPath()
  context.moveTo(startX, startY)
  context.quadraticCurveTo(controlX, controlY, endX, endY)
  context.stroke()
  context.restore()
}

function paintLeaf(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  length: number,
  width: number,
  depth: number,
  rotation: number,
  bend: number,
  strength = 1,
) {
  context.save()
  context.translate(centerX, centerY)
  context.rotate(rotation)
  context.scale(length, width)

  context.fillStyle = getCasterColor(depth, strength)
  context.beginPath()
  context.moveTo(1, 0)
  context.bezierCurveTo(0.5, -0.52 + bend, -0.55, -0.42 - bend, -1, 0)
  context.bezierCurveTo(-0.55, 0.42 - bend, 0.5, 0.52 + bend, 1, 0)
  context.fill()

  context.globalCompositeOperation = 'destination-out'
  context.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  context.lineWidth = 0.018
  context.beginPath()
  context.moveTo(-0.82, 0)
  context.bezierCurveTo(-0.2, bend * 0.5, 0.42, -bend * 0.5, 0.86, 0)
  context.stroke()

  context.restore()
}

function paintBranchCanopy(context: CanvasRenderingContext2D, width: number, height: number, density: number, strength = 1) {
  const diagonal = Math.hypot(width, height)
  const source = createLeafLSystemSource(density)
  const toX = (x: number) => ((x + 1) * 0.5) * width
  const toY = (y: number) => (1 - (y + 1) * 0.5) * height

  source.segments.forEach((segment, index) => {
    if (index % 13 !== 0) return

    paintCurvedStroke(
      context,
      toX(segment.x1),
      toY(segment.y1),
      toX((segment.x1 + segment.x2) * 0.5),
      toY((segment.y1 + segment.y2) * 0.5),
      toX(segment.x2),
      toY(segment.y2),
      diagonal * segment.thickness * 0.14,
      segment.depth * 0.52,
      strength,
    )
  })

  source.leaves.forEach((leaf) => {
    paintLeaf(
      context,
      toX(leaf.x),
      toY(leaf.y),
      diagonal * leaf.length * 0.42,
      diagonal * leaf.width * 0.42,
      leaf.depth,
      -leaf.rotation,
      leaf.bend,
      strength,
    )
  })
}

function paintWindowScene(context: CanvasRenderingContext2D, width: number, height: number, density: number, strength = 1) {
  const diagonal = Math.hypot(width, height)
  const rotation = -0.13
  const slatCount = getDensityCount(10, density)

  for (let index = 0; index < slatCount; index += 1) {
    const t = index / Math.max(1, slatCount - 1)
    const seed = 720 + index * 19
    const y = height * (-0.06 + t * 1.12) + (stableNoise(seed) - 0.5) * height * 0.014
    const slatHeight = height * (0.012 + stableNoise(seed + 5) * 0.01)
    const slatWidth = diagonal * (1.18 + stableNoise(seed + 11) * 0.16)
    const x = width * (0.5 + (stableNoise(seed + 17) - 0.5) * 0.05)
    const depth = 0.36 + t * 0.42 + (stableNoise(seed + 23) - 0.5) * 0.16

    paintRect(context, x, y, slatWidth, slatHeight, depth, rotation + (stableNoise(seed + 29) - 0.5) * 0.03, strength)
  }

  paintRect(context, width * 0.22, height * 0.48, width * 0.018, diagonal * 1.08, 0.38, rotation, strength)
  paintRect(context, width * 0.78, height * 0.5, width * 0.014, diagonal * 1.04, 0.46, rotation, strength)
  paintRect(context, width * 0.5, height * 0.08, diagonal * 1.18, height * 0.018, 0.5, rotation, strength)
}

function paintPaperScene(context: CanvasRenderingContext2D, width: number, height: number, density: number) {
  const diagonal = Math.hypot(width, height)

  paintRoundedRect(context, width * 0.2, height * 0.12, width * 0.88, height * 0.36, diagonal * 0.035, 0.38, -0.08)
  paintRoundedRect(context, width * 0.82, height * 0.3, width * 0.66, height * 0.42, diagonal * 0.028, 0.54, 0.14)
  paintRoundedRect(context, width * 0.24, height * 0.86, width * 0.78, height * 0.34, diagonal * 0.03, 0.7, 0.08)
  paintRoundedRect(context, width * 0.88, height * 0.86, width * 0.46, height * 0.3, diagonal * 0.026, 0.46, -0.12)

  for (let index = 0; index < getDensityCount(5, density); index += 1) {
    const seed = 900 + index * 29
    paintRect(
      context,
      width * (0.06 + stableNoise(seed) * 0.88),
      height * (0.08 + stableNoise(seed + 5) * 0.84),
      width * (0.18 + stableNoise(seed + 11) * 0.18),
      height * (0.012 + stableNoise(seed + 17) * 0.018),
      0.34 + stableNoise(seed + 23) * 0.34,
      -0.3 + stableNoise(seed + 31) * 0.6,
    )
  }
}

function paintBranchScene(context: CanvasRenderingContext2D, width: number, height: number, density: number) {
  const diagonal = Math.hypot(width, height)
  const branchDepths = [0.4, 0.58, 0.66, 0.5]

  branchDepths.slice(0, getDensityCount(branchDepths.length, density)).forEach((depth, index) => {
    const seed = 1100 + index * 41
    const startX = width * (-0.08 + stableNoise(seed) * 0.18)
    const startY = height * (0.15 + index * 0.2 + stableNoise(seed + 5) * 0.08)
    const endX = width * (0.78 + stableNoise(seed + 11) * 0.34)
    const endY = height * (0.1 + index * 0.18 + stableNoise(seed + 17) * 0.28)
    const controlX = width * (0.28 + stableNoise(seed + 23) * 0.42)
    const controlY = height * (-0.08 + index * 0.26 + stableNoise(seed + 29) * 0.28)

    paintCurvedStroke(context, startX, startY, controlX, controlY, endX, endY, diagonal * (0.01 + index * 0.0025), depth)

    for (let twig = 0; twig < getDensityCount(7, density); twig += 1) {
      const twigSeed = seed + twig * 13
      const t = 0.16 + twig * 0.11 + stableNoise(twigSeed) * 0.04
      const baseX = startX + (endX - startX) * t
      const baseY = startY + (endY - startY) * t + Math.sin(t * Math.PI) * (controlY - (startY + endY) * 0.5) * 0.7
      const side = twig % 2 === 0 ? -1 : 1
      const twigLength = diagonal * (0.055 + stableNoise(twigSeed + 3) * 0.05)
      const angle = -0.75 + side * (0.55 + stableNoise(twigSeed + 7) * 0.45)

      paintCurvedStroke(
        context,
        baseX,
        baseY,
        baseX + Math.cos(angle) * twigLength * 0.6,
        baseY + Math.sin(angle) * twigLength * 0.6,
        baseX + Math.cos(angle) * twigLength,
        baseY + Math.sin(angle) * twigLength,
        diagonal * 0.0045,
        Math.min(0.85, depth + stableNoise(twigSeed + 11) * 0.16),
      )
    }
  })

  for (let index = 0; index < getDensityCount(22, density); index += 1) {
    const seed = 1300 + index * 17
    paintLeaf(
      context,
      width * (0.08 + stableNoise(seed) * 0.92),
      height * (0.06 + stableNoise(seed + 3) * 0.88),
      diagonal * (0.025 + stableNoise(seed + 5) * 0.035),
      diagonal * (0.008 + stableNoise(seed + 7) * 0.01),
      0.36 + stableNoise(seed + 11) * 0.42,
      -Math.PI + stableNoise(seed + 13) * Math.PI * 2,
      (stableNoise(seed + 17) - 0.5) * 0.18,
    )
  }
}

function paintMixedScene(context: CanvasRenderingContext2D, width: number, height: number, settings: ShadowSettings) {
  paintWindowScene(context, width, height, settings.density, settings.blindStrength)
  paintBranchCanopy(context, width, height, settings.density, settings.canopyStrength)
}

function sampleShadowSource(imageData: ImageData, settings: ShadowSettings) {
  const { data, height, width } = imageData
  const sampleX = width * settings.samplerX
  const sampleY = height * settings.samplerY
  const lightDirectionX = Math.cos(settings.sunAngle)
  const lightDirectionY = -Math.sin(settings.sunAngle)
  const lightPerpendicularX = -lightDirectionY
  const lightPerpendicularY = lightDirectionX
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const points: ShadowSourceSamplerPoint[] = []
  let shadowInfluence = 0
  let contributingSamples = 0

  const activeSamples = Math.max(1, Math.min(diskSamples, Math.round(settings.sampleCount)))
  const sampleDiskSize = diskSize / Math.max(0.25, settings.crispness)

  for (let index = 1; index <= activeSamples; index++) {
    const radius = sampleDiskSize * Math.sqrt(index / activeSamples)
    const theta = index * goldenAngle
    const offsetX = radius * Math.cos(theta)
    const offsetY = radius * Math.sin(theta)
    const projectedAlong = Math.abs(offsetY) * 1.35 + radius * 0.18
    const projectedAcross = offsetX * 0.42
    const rotatedOffsetX = lightDirectionX * projectedAlong + lightPerpendicularX * projectedAcross
    const rotatedOffsetY = lightDirectionY * projectedAlong + lightPerpendicularY * projectedAcross
    const x = Math.min(width - 1, Math.max(0, Math.round(sampleX + rotatedOffsetX)))
    const y = Math.min(height - 1, Math.max(0, Math.round(sampleY + rotatedOffsetY)))
    const pixelIndex = (y * width + x) * 4
    const red = data[pixelIndex]
    const green = data[pixelIndex + 1]
    const hitCaster = red > 0 && green === 255
    const casterSize = hitCaster
      ? (red / 255) * (maxShadowCasterSize - minShadowCasterSize) + minShadowCasterSize
      : 0
    const crispCasterSize = casterSize / Math.max(0.25, settings.crispness)
    const contributes = hitCaster && crispCasterSize / 2 >= radius

    if (contributes) {
      const sourceStrength = data[pixelIndex + 2] / 255
      shadowInfluence += (8 + (0.5 - 8) * (crispCasterSize / maxShadowCasterSize)) * sourceStrength
      contributingSamples += 1
    }

    points.push({
      casterSize: crispCasterSize,
      contributes,
      hitCaster,
      x,
      y,
    })
  }

  return {
    contributingSamples,
    points,
    sampleX,
    sampleY,
    shadowFactor: Math.min(0.96, Math.max(0, (shadowInfluence / activeSamples) * settings.contrast)),
  }
}

function createShadowTexture(mode: ShadowMapMode, width: number, height: number, settings: ShadowSettings) {
  const { context, surface } = createDrawingSurface(width, height)

  context.imageSmoothingEnabled = true
  context.fillStyle = 'rgb(0, 0, 0)'
  context.fillRect(0, 0, width, height)
  context.save()
  context.translate(width * 0.5, height * 0.5)
  context.scale(settings.scale, settings.scale)
  context.translate(width * -0.5, height * -0.5)

  if (mode === 'canopy') {
    paintBranchCanopy(context, width, height, settings.density)
  }

  if (mode === 'window') {
    paintWindowScene(context, width, height, settings.density)
  }

  if (mode === 'paper') {
    paintPaperScene(context, width, height, settings.density)
  }

  if (mode === 'branch') {
    paintBranchScene(context, width, height, settings.density)
  }

  if (mode === 'mixed') {
    paintMixedScene(context, width, height, settings)
  }

  if (mode === 'blobs') {
    const source = createBlobLSystemSource(settings.density)
    const diagonal = Math.hypot(width, height)
    const toX = (x: number) => ((x + 1) * 0.5) * width
    const toY = (y: number) => (1 - (y + 1) * 0.5) * height

    source.blobs.forEach((blob) => {
      paintEllipse(
        context,
        toX(blob.x),
        toY(blob.y),
        diagonal * blob.radiusX * 0.42,
        diagonal * blob.radiusY * 0.42,
        blob.depth,
        -blob.rotation,
      )
    })
  }

  context.restore()

  const imageData = context.getImageData(0, 0, width, height)
  const sampler = sampleShadowSource(imageData, settings)
  const texture = new THREE.DataTexture(imageData.data, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace
  texture.type = THREE.UnsignedByteType
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  const dataUrl = 'toDataURL' in surface ? surface.toDataURL('image/png') : undefined

  return { dataUrl, height, sampler, texture, width }
}

function useIdleShadowTexture(mode: ShadowMapMode, settings: ShadowSettings, width: number, height: number) {
  const [textureState, setTextureState] = useState<ShadowTextureState | null>(null)

  useEffect(() => {
    let isCancelled = false
    let cancelScheduledWork = () => {}
    const detail = `${mode} ${width}x${height}`

    const buildTexture = () => {
      emitDebugTimelineEvent('texture build start', detail)
      const nextTextureState = createShadowTexture(mode, width, height, settings)

      if (isCancelled) {
        nextTextureState.texture.dispose()
        return
      }

      emitDebugTimelineEvent('texture ready', detail)
      publishShadowSourcePreview({
        dataUrl: nextTextureState.dataUrl,
        height: nextTextureState.height,
        mode,
        sampler: nextTextureState.sampler,
        width: nextTextureState.width,
      })
      setTextureState(nextTextureState)
    }

    emitDebugTimelineEvent('texture scheduled', detail)
    if ('requestIdleCallback' in window) {
      const idleHandle = window.requestIdleCallback(buildTexture, { timeout: 700 })
      cancelScheduledWork = () => window.cancelIdleCallback(idleHandle)
    } else {
      const timeoutHandle = globalThis.setTimeout(buildTexture, 60)
      cancelScheduledWork = () => globalThis.clearTimeout(timeoutHandle)
    }

    return () => {
      isCancelled = true
      cancelScheduledWork()
    }
  }, [height, mode, settings, width])

  useEffect(() => {
    return () => textureState?.texture.dispose()
  }, [textureState])

  return textureState
}

function ShadowShaderPlane({ mode, settings }: { mode: ShadowMapMode; settings: ShadowSettings }) {
  const { size } = useThree()
  const { height: textureHeight, width: textureWidth } = getShadowTextureSize(size.width, size.height, settings.resolution)
  const shadowTexture = useIdleShadowTexture(mode, settings, textureWidth, textureHeight)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      hSize: { value: shadowTexture?.height ?? 1 },
      uAnimationSpeed: { value: settings.speed },
      uAnimationStrength: { value: settings.strength },
      uDepthMix: { value: settings.depthMix },
      uEdgeCrispness: { value: settings.crispness },
      uLayerSpread: { value: settings.layerSpread },
      uSampleCount: { value: settings.sampleCount },
      uShadowContrast: { value: settings.contrast },
      uSunAngle: { value: settings.sunAngle },
      uTexture: { value: shadowTexture?.texture ?? null },
      uTime: { value: 0 },
      uWarpStrength: { value: mode === 'window' ? 0 : 1 },
      wSize: { value: shadowTexture?.width ?? 1 },
    }),
    [mode, settings.contrast, settings.crispness, settings.depthMix, settings.layerSpread, settings.sampleCount, settings.speed, settings.strength, settings.sunAngle, shadowTexture],
  )

  useFrame(({ clock }) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value = clock.elapsedTime
    materialRef.current.uniforms.uAnimationSpeed.value = settings.speed
    materialRef.current.uniforms.uAnimationStrength.value = settings.strength
    materialRef.current.uniforms.uDepthMix.value = settings.depthMix
    materialRef.current.uniforms.uEdgeCrispness.value = settings.crispness
    materialRef.current.uniforms.uLayerSpread.value = settings.layerSpread
    materialRef.current.uniforms.uSampleCount.value = settings.sampleCount
    materialRef.current.uniforms.uShadowContrast.value = settings.contrast
    materialRef.current.uniforms.uSunAngle.value = settings.sunAngle
    materialRef.current.uniforms.uWarpStrength.value = mode === 'window' ? 0 : 1
  })

  if (!shadowTexture) return null

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        depthTest={false}
        depthWrite={false}
        fragmentShader={shadowFragmentShader}
        ref={materialRef}
        transparent
        uniforms={uniforms}
        vertexShader={shadowVertexShader}
      />
    </mesh>
  )
}

export default function DaylightShadowLayer({
  mode,
  settings,
}: {
  mode: ShadowMapMode
  settings: ShadowSettings
}) {
  useEffect(() => {
    emitDebugTimelineEvent('shadow mounted')
  }, [])

  return (
    <div className="daylight-shadow-layer" aria-hidden="true" style={{ opacity: settings.opacity }}>
      <Canvas
        camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0xf2f0ee, 0)
        }}
      >
        <ShadowShaderPlane mode={mode} settings={settings} />
      </Canvas>
    </div>
  )
}
