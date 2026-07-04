import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { emitDebugTimelineEvent } from './debugTimeline'
import { createBlobLSystemSource } from './lSystemShadowSource'
import type { ShadowMapMode } from './shadowMapModes'
import { publishShadowSourcePreview, type ShadowSourceSamplerPoint } from './shadowSourcePreview'

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

const maxShadowTextureDpr = 1
const maxShadowTextureSize = 960
const diskSize = 80
const diskSamples = 100
const minShadowCasterSize = 20
const maxShadowCasterSize = 300
const desktopShadowAspect = 16 / 9

const shadowVertexShader = `
  varying vec2 vTexCoord;

  void main() {
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
uniform highp vec3 uShadowTint;
uniform highp float uSampleCount;
uniform highp float uShadowContrast;
uniform highp float uSunAngle;
uniform highp float uWarpStrength;
uniform highp float uDepthMix;
uniform highp float uLayerSpread;

varying vec2 vTexCoord;

const float pi = 3.1415926535897932384626433832795;
const float goldenAngle = pi * (3.0 - sqrt(5.0));
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
  animatedUv.x += sin(animatedTime * 0.24) * 0.028 * uAnimationStrength * uWarpStrength;
  animatedUv.y += cos(animatedTime * 0.18) * 0.018 * uAnimationStrength * uWarpStrength;
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
  vec3 color = mix(vec3(1.0), uShadowTint, combinedShadow);

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

function stableNoise(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function getDensityCount(count: number, density: number) {
  return Math.max(1, Math.round(count * Math.max(0.1, density)))
}

function getSourceCameraVerticalSpan(width: number, height: number) {
  const aspect = width / Math.max(1, height)
  if (aspect >= desktopShadowAspect) return 1

  return Math.min(1.55, 1 + (desktopShadowAspect / Math.max(0.1, aspect) - 1) * 0.18)
}

function makeCasterMaterial(depth: number, strength = 1) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      Math.max(0, Math.min(1, depth)),
      1,
      Math.max(0, Math.min(1, strength)),
    ),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
}

function makeLeafGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(1, 0)
  shape.bezierCurveTo(0.5, -0.52, -0.55, -0.42, -1, 0)
  shape.bezierCurveTo(-0.55, 0.42, 0.5, 0.52, 1, 0)

  return new THREE.ShapeGeometry(shape, 18)
}

function addLeaf(parent: THREE.Object3D, geometry: THREE.BufferGeometry, x: number, y: number, length: number, width: number, depth: number, rotation: number, strength = 1) {
  const leaf = new THREE.Mesh(geometry, makeCasterMaterial(depth, strength))
  leaf.position.set(x, y, 0)
  leaf.rotation.z = rotation
  leaf.scale.set(length, width, 1)
  parent.add(leaf)
}

function addRect(parent: THREE.Object3D, x: number, y: number, width: number, height: number, depth: number, rotation = 0, strength = 1) {
  const rect = new THREE.Mesh(new THREE.PlaneGeometry(width, height), makeCasterMaterial(depth, strength))
  rect.position.set(x, y, 0)
  rect.rotation.z = rotation
  parent.add(rect)
}

function addEllipse(scene: THREE.Scene, geometry: THREE.BufferGeometry, x: number, y: number, radiusX: number, radiusY: number, depth: number, rotation = 0, strength = 1) {
  const ellipse = new THREE.Mesh(geometry, makeCasterMaterial(depth, strength))
  ellipse.position.set(x, y, 0)
  ellipse.rotation.z = rotation
  ellipse.scale.set(radiusX, radiusY, 1)
  scene.add(ellipse)
}

// Real canopy shadows read as connected foliage masses with light dappled
// through gaps, not scattered individual leaves. Each clump is its own group
// (anchored mostly along the top edge, hanging into view) so the wind can
// sway them independently while the window blinds stay rigid.
function addCanopy(scene: THREE.Scene, leafGeometry: THREE.BufferGeometry, settings: ShadowSettings, strength = 1) {
  const canopy = new THREE.Group()
  canopy.name = 'canopy'

  const clumps = [
    { radius: 0.62, tilt: -0.42, x: -0.72, y: 0.92 },
    { radius: 0.52, tilt: 0.24, x: -0.02, y: 1.04 },
    { radius: 0.46, tilt: 0.72, x: 0.68, y: 0.86 },
    { radius: 0.4, tilt: -1.08, x: -1.02, y: 0.18 },
  ]

  clumps.forEach((clump, clumpIndex) => {
    const group = new THREE.Group()
    group.position.set(clump.x, clump.y, 0)
    group.userData = { baseX: clump.x, baseY: clump.y, phase: clumpIndex * 1.7 }

    const baseSeed = 4200 + clumpIndex * 733

    // supporting branches running through the mass
    addRect(group, 0, 0, clump.radius * 1.7 * settings.scale, 0.02 * settings.scale, 0.5, clump.tilt, strength)
    addRect(
      group,
      Math.cos(clump.tilt + 0.9) * clump.radius * 0.4,
      Math.sin(clump.tilt + 0.9) * clump.radius * 0.4,
      clump.radius * 0.9 * settings.scale,
      0.013 * settings.scale,
      0.44,
      clump.tilt + 0.9,
      strength,
    )

    const leafCount = getDensityCount(64, settings.density)
    const gapAngle = stableNoise(baseSeed + 1) * Math.PI * 2

    for (let index = 0; index < leafCount; index += 1) {
      const seed = baseSeed + index * 13
      // dense overlapping core, ragged rim
      const radial = Math.pow(stableNoise(seed), 0.6) * clump.radius
      const theta = stableNoise(seed + 3) * Math.PI * 2
      const rimFade = radial / clump.radius
      // dappled gap: thin one angular wedge outside the core so light punches
      // through the mass instead of the mass reading as a solid blob
      const gapDistance = Math.abs(((theta - gapAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      if (gapDistance < 0.52 && rimFade > 0.38 && stableNoise(seed + 5) < 0.7) continue

      const length = (0.06 + (1 - rimFade) * 0.085 + stableNoise(seed + 7) * 0.035) * settings.scale
      addLeaf(
        group,
        leafGeometry,
        Math.cos(theta) * radial * 1.12,
        Math.sin(theta) * radial * 0.82,
        length,
        length * (0.34 + stableNoise(seed + 9) * 0.16),
        0.32 + (1 - rimFade) * 0.2 + stableNoise(seed + 11) * 0.15,
        theta + Math.PI / 2 + (stableNoise(seed + 13) - 0.5) * 0.9,
        strength,
      )
    }

    canopy.add(group)
  })

  scene.add(canopy)
}

function addWindow(scene: THREE.Scene, settings: ShadowSettings, strength = 1) {
  const rotation = -0.13
  const slatCount = getDensityCount(10, settings.density)

  for (let index = 0; index < slatCount; index += 1) {
    const t = index / Math.max(1, slatCount - 1)
    const seed = 720 + index * 19
    const x = (stableNoise(seed + 17) - 0.5) * 0.08
    const y = 1.08 - t * 2.16 + (stableNoise(seed) - 0.5) * 0.032
    const width = (2.66 + stableNoise(seed + 11) * 0.36) * settings.scale
    const height = (0.026 + stableNoise(seed + 5) * 0.022) * settings.scale
    const depth = 0.36 + t * 0.42 + (stableNoise(seed + 23) - 0.5) * 0.16

    addRect(scene, x, y, width, height, depth, rotation + (stableNoise(seed + 29) - 0.5) * 0.03, strength)
  }

  addRect(scene, -0.62, 0.04, 0.032 * settings.scale, 2.36 * settings.scale, 0.38, rotation, strength)
  addRect(scene, 0.62, 0, 0.026 * settings.scale, 2.26 * settings.scale, 0.46, rotation, strength)
  addRect(scene, 0, 1.02, 2.7 * settings.scale, 0.04 * settings.scale, 0.5, rotation, strength)
}

function addPaper(scene: THREE.Scene, settings: ShadowSettings) {
  addRect(scene, -0.62, 0.78, 1.7 * settings.scale, 0.52 * settings.scale, 0.38, -0.08)
  addRect(scene, 0.66, 0.42, 1.25 * settings.scale, 0.72 * settings.scale, 0.54, 0.14)
  addRect(scene, -0.54, -0.78, 1.45 * settings.scale, 0.52 * settings.scale, 0.7, 0.08)
  addRect(scene, 0.78, -0.8, 0.88 * settings.scale, 0.5 * settings.scale, 0.46, -0.12)
}

function addBranch(scene: THREE.Scene, leafGeometry: THREE.BufferGeometry, settings: ShadowSettings) {
  for (let index = 0; index < getDensityCount(4, settings.density); index += 1) {
    const seed = 1100 + index * 41
    const x = -0.9 + stableNoise(seed) * 0.32
    const y = 0.58 - index * 0.38 + stableNoise(seed + 5) * 0.16
    const length = (1.65 + stableNoise(seed + 11) * 0.38) * settings.scale
    const thickness = (0.035 + index * 0.008) * settings.scale
    const rotation = -0.2 + stableNoise(seed + 17) * 0.45

    addRect(scene, x + length * 0.45, y, length, thickness, 0.42 + index * 0.09, rotation)

    for (let twig = 0; twig < getDensityCount(7, settings.density); twig += 1) {
      const twigSeed = seed + twig * 13
      const t = 0.18 + twig * 0.11
      const side = twig % 2 === 0 ? -1 : 1
      addRect(
        scene,
        x + length * t,
        y + side * (0.08 + stableNoise(twigSeed) * 0.06),
        (0.22 + stableNoise(twigSeed + 3) * 0.18) * settings.scale,
        0.015 * settings.scale,
        0.48 + stableNoise(twigSeed + 7) * 0.24,
        rotation + side * (0.78 + stableNoise(twigSeed + 11) * 0.36),
      )
    }
  }

  for (let index = 0; index < getDensityCount(22, settings.density); index += 1) {
    const seed = 1300 + index * 17
    addLeaf(
      scene,
      leafGeometry,
      -0.92 + stableNoise(seed) * 1.84,
      -0.86 + stableNoise(seed + 3) * 1.72,
      (0.05 + stableNoise(seed + 5) * 0.07) * settings.scale,
      (0.017 + stableNoise(seed + 7) * 0.02) * settings.scale,
      0.36 + stableNoise(seed + 11) * 0.42,
      -Math.PI + stableNoise(seed + 13) * Math.PI * 2,
    )
  }
}

function buildSourceScene(mode: ShadowMapMode, settings: ShadowSettings) {
  const scene = new THREE.Scene()
  const leafGeometry = makeLeafGeometry()
  const ellipseGeometry = new THREE.CircleGeometry(1, 32)

  if (mode === 'canopy') addCanopy(scene, leafGeometry, settings)
  if (mode === 'window') addWindow(scene, settings)
  if (mode === 'paper') addPaper(scene, settings)
  if (mode === 'branch') addBranch(scene, leafGeometry, settings)
  if (mode === 'mixed') {
    addWindow(scene, settings, settings.blindStrength)
    addCanopy(scene, leafGeometry, settings, settings.canopyStrength)
  }
  if (mode === 'blobs') {
    createBlobLSystemSource(settings.density).blobs.forEach((blob) => {
      addEllipse(
        scene,
        ellipseGeometry,
        blob.x,
        blob.y,
        blob.radiusX * settings.scale,
        blob.radiusY * settings.scale,
        blob.depth,
        blob.rotation,
      )
    })
  }

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) object.renderOrder = 1
  })

  return scene
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

  for (let index = 1; index <= activeSamples; index += 1) {
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

function createPreviewDataUrl(pixels: Uint8Array, width: number, height: number) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return undefined

  canvas.width = width
  canvas.height = height

  const flipped = new Uint8ClampedArray(pixels.length)
  const rowSize = width * 4
  for (let row = 0; row < height; row += 1) {
    const sourceStart = (height - row - 1) * rowSize
    const targetStart = row * rowSize
    flipped.set(pixels.slice(sourceStart, sourceStart + rowSize), targetStart)
  }

  context.putImageData(new ImageData(flipped, width, height), 0, 0)
  return {
    dataUrl: canvas.toDataURL('image/png'),
    imageData: context.getImageData(0, 0, width, height),
  }
}

function SourceSceneShadowPlane({ crispnessScale, mode, settings, shadowTint, sunAngle }: { crispnessScale: number; mode: ShadowMapMode; settings: ShadowSettings; shadowTint: readonly [number, number, number]; sunAngle: number }) {
  const { gl, size } = useThree()
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const previewKeyRef = useRef('')
  const { height: textureHeight, width: textureWidth } = getShadowTextureSize(size.width, size.height, settings.resolution)
  const sourceCameraVerticalSpan = getSourceCameraVerticalSpan(size.width, size.height)
  const sourceCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10), [])
  const sourceScene = useMemo(() => buildSourceScene(mode, settings), [mode, settings])
  const renderTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(textureWidth, textureHeight, {
      depthBuffer: false,
      format: THREE.RGBAFormat,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
    })
    target.texture.colorSpace = THREE.NoColorSpace
    target.texture.generateMipmaps = false

    return target
  }, [textureHeight, textureWidth])
  const uniforms = useMemo(
    () => ({
      hSize: { value: textureHeight },
      uAnimationSpeed: { value: settings.speed },
      uAnimationStrength: { value: settings.strength },
      uDepthMix: { value: settings.depthMix },
      uEdgeCrispness: { value: settings.crispness },
      uLayerSpread: { value: settings.layerSpread },
      uSampleCount: { value: settings.sampleCount },
      uShadowContrast: { value: settings.contrast },
      uShadowTint: { value: [...shadowTint] },
      uSunAngle: { value: settings.sunAngle },
      uTexture: { value: renderTarget.texture },
      uTime: { value: 0 },
      // mixed gets zero texture warp: the blinds must stay rigid, and the
      // canopy's motion comes from real mesh animation in useFrame instead
      uWarpStrength: { value: mode === 'window' || mode === 'mixed' ? 0 : 1 },
      wSize: { value: textureWidth },
    }),
    [mode, renderTarget.texture, settings.contrast, settings.crispness, settings.depthMix, settings.layerSpread, settings.sampleCount, settings.speed, settings.strength, settings.sunAngle, textureHeight, textureWidth],
  )

  useEffect(() => {
    sourceCamera.top = sourceCameraVerticalSpan
    sourceCamera.bottom = -sourceCameraVerticalSpan
    sourceCamera.left = -1
    sourceCamera.right = 1
    sourceCamera.position.set(0, 0, 2)
    sourceCamera.lookAt(0, 0, 0)
    sourceCamera.updateProjectionMatrix()
  }, [sourceCamera, sourceCameraVerticalSpan])

  useEffect(() => () => renderTarget.dispose(), [renderTarget])

  useFrame(({ clock }) => {
    const animatedTime = clock.elapsedTime * settings.speed
    const canopyGroup = sourceScene.getObjectByName('canopy')

    if (canopyGroup) {
      // Hierarchical wind: each foliage clump sways with its own phase --
      // slow large motion plus a faster small flutter -- while everything
      // else in the scene (window blinds, frame) stays rigid.
      for (const clump of canopyGroup.children) {
        const { baseX, baseY, phase } = clump.userData
        clump.rotation.z =
          Math.sin(animatedTime * 0.32 + phase) * 0.024 * settings.strength +
          Math.sin(animatedTime * 0.86 + phase * 2.3) * 0.009 * settings.strength
        clump.position.x = baseX + Math.sin(animatedTime * 0.21 + phase) * 0.016 * settings.strength
        clump.position.y = baseY + Math.cos(animatedTime * 0.27 + phase * 1.4) * 0.009 * settings.strength
      }
    } else {
      sourceScene.position.x = Math.sin(animatedTime * 0.16) * 0.035 * settings.strength
      sourceScene.position.y = Math.cos(animatedTime * 0.12) * 0.025 * settings.strength
      sourceScene.rotation.z = Math.sin(animatedTime * 0.08) * 0.018 * settings.strength
    }

    gl.setRenderTarget(renderTarget)
    gl.setClearColor(0x000000, 1)
    gl.clear()
    gl.render(sourceScene, sourceCamera)
    gl.setRenderTarget(null)

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime
      materialRef.current.uniforms.uAnimationSpeed.value = settings.speed
      materialRef.current.uniforms.uAnimationStrength.value = settings.strength
      materialRef.current.uniforms.uDepthMix.value = settings.depthMix
      materialRef.current.uniforms.uEdgeCrispness.value = settings.crispness * crispnessScale
      materialRef.current.uniforms.uLayerSpread.value = settings.layerSpread
      materialRef.current.uniforms.uSampleCount.value = settings.sampleCount
      materialRef.current.uniforms.uShadowContrast.value = settings.contrast
      materialRef.current.uniforms.uShadowTint.value = shadowTint
      materialRef.current.uniforms.uSunAngle.value = sunAngle
      materialRef.current.uniforms.uWarpStrength.value = mode === 'window' || mode === 'mixed' ? 0 : 1
    }

    const previewKey = [
      mode,
      textureWidth,
      textureHeight,
      settings.blindStrength,
      settings.canopyStrength,
      settings.contrast,
      settings.crispness,
      settings.density,
      settings.sampleCount,
      settings.samplerX,
      settings.samplerY,
      settings.scale,
    ].join(':')

    if (previewKeyRef.current !== previewKey) {
      const pixels = new Uint8Array(textureWidth * textureHeight * 4)
      gl.readRenderTargetPixels(renderTarget, 0, 0, textureWidth, textureHeight, pixels)
      const preview = createPreviewDataUrl(pixels, textureWidth, textureHeight)

      if (preview) {
        publishShadowSourcePreview({
          dataUrl: preview.dataUrl,
          height: textureHeight,
          mode,
          sampler: sampleShadowSource(preview.imageData, settings),
          width: textureWidth,
        })
      }

      previewKeyRef.current = previewKey
    }
  })

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

// opacityScale is a separate prop (not folded into settings.opacity) so the
// per-frame day-cycle fade cannot change the settings object's identity --
// buildSourceScene memoizes on it and would rebuild the THREE scene every
// frame otherwise.
export default function V2ShadowLayer({ crispnessScale, mode, opacityScale, settings, shadowTint, sunAngle }: { crispnessScale: number; mode: ShadowMapMode; opacityScale: number; settings: ShadowSettings; shadowTint: readonly [number, number, number]; sunAngle: number }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    emitDebugTimelineEvent('v2 source scene mounted')
  }, [])

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div
      className={`daylight-shadow-layer ${isVisible ? 'is-visible' : ''}`}
      aria-hidden="true"
      style={{ ['--shadow-opacity' as string]: settings.opacity * opacityScale }}
    >
      <Canvas
        camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0xf2f0ee, 0)
        }}
      >
        <SourceSceneShadowPlane crispnessScale={crispnessScale} mode={mode} settings={settings} shadowTint={shadowTint} sunAngle={sunAngle} />
      </Canvas>
    </div>
  )
}
