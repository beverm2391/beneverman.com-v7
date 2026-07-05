import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { emitDebugTimelineEvent } from './debugTimeline'
import {
  canopyClumps,
  getDensityCount,
  getWindowRects,
  makeLeafGeometryVariants,
  stableNoise,
} from './shadowFoliage'
import type { ShadowMapMode } from './shadowMapModes'

// v3: physically-based shadows. A real DirectionalLight shadow-maps the oak
// foliage onto a ShadowMaterial page plane using three r185's native soft PCF
// (5 Vogel-disk samples x hardware 4-tap bilinear compare, noise-rotated per
// pixel). Edge softness is light.shadow.radius -- a per-frame uniform driven
// from the crispness setting and the day cycle, no shader hacks, no
// recompiles. (drei's <SoftShadows> PCSS injection silently no-ops on r185's
// restructured shadow chunk + program cache; we shipped it for a while and it
// was provably never in the compiled shader.)

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

const tau = Math.PI * 2
const zAxis = new THREE.Vector3(0, 0, 1)
const unitPlane = new THREE.PlaneGeometry(1, 1)

// Light-space half-extent of the shadow frustum. Casters span x ~[-1.95, 1.95]
// and project slightly wider under a tilted light; 2.6 covers the worst case
// with margin. Keep this and the camera args below in sync.
const shadowFrustum = 2.6

// Size the shadow map to the device instead of hardcoding: aim for roughly one
// texel per rendered pixel across the frustum, snapped to a power of two. A
// phone lands at 1024-2048 (cheap), a 2x desktop at 4096 (sharp). The penumbra
// floor in PcssSoftShadows hides the texel grid either way, so undershooting
// on weak devices degrades to "slightly softer", never to staircase edges.
function pickShadowMapSize(viewportWidth: number, dpr: number) {
  const pixelsPerWorldUnit = (viewportWidth / 2) * dpr
  const wanted = shadowFrustum * 2 * pixelsPerWorldUnit
  let mapSize = 1024
  while (mapSize < wanted && mapSize < 4096) mapSize *= 2
  return mapSize
}

// Distance from the receiving page plane. PCSS penumbra grows with this, so
// the v2 "depth" values translate directly into physical z separation.
function depthToZ(depth: number) {
  return 0.3 + depth * 2
}

function bakeGeometry(
  source: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(zAxis, rotation),
    new THREE.Vector3(scaleX, scaleY, 1),
  )
  return source.clone().applyMatrix4(matrix)
}

// Same clump/sprig layout math as v2's addCanopy/addSprig, but baked into one
// merged geometry per clump (a single shadow-pass draw call) with real z per
// sprig instead of an encoded caster size.
function buildCanopyGroup(settings: ShadowSettings, leafGeometries: THREE.BufferGeometry[], casterMaterial: THREE.Material) {
  const canopy = new THREE.Group()
  canopy.name = 'canopy'

  canopyClumps.forEach((clump, clumpIndex) => {
    const group = new THREE.Group()
    group.position.set(clump.x, clump.y, 0)
    group.userData = { baseX: clump.x, baseY: clump.y, phase: clumpIndex * 1.7 }

    const parts: THREE.BufferGeometry[] = []
    const baseSeed = 4200 + clumpIndex * 733
    // branches live at the same plane as their sprigs -- deeper z would smear
    // them into wide scaffolding beams instead of twigs under foliage
    const branchZ = depthToZ(0.05 + clump.depthBias)

    parts.push(bakeGeometry(unitPlane, 0, 0, branchZ, clump.tilt, clump.radius * 1.7 * settings.scale, 0.011 * settings.scale))
    parts.push(
      bakeGeometry(
        unitPlane,
        Math.cos(clump.tilt + 0.9) * clump.radius * 0.4,
        Math.sin(clump.tilt + 0.9) * clump.radius * 0.4,
        branchZ,
        clump.tilt + 0.9,
        clump.radius * 0.9 * settings.scale,
        0.008 * settings.scale,
      ),
    )

    const sprigCount = getDensityCount(20, settings.density)
    const gapAngle = stableNoise(baseSeed + 1) * tau

    for (let index = 0; index < sprigCount; index += 1) {
      const seed = baseSeed + index * 47
      const radial = Math.pow(stableNoise(seed), 0.55) * clump.radius
      const theta = stableNoise(seed + 3) * tau
      const rimFade = radial / clump.radius
      const gapDistance = Math.abs(((theta - gapAngle + Math.PI * 3) % tau) - Math.PI)
      if (gapDistance < 0.5 && rimFade > 0.4 && stableNoise(seed + 5) < 0.65) continue

      const sprigX = Math.cos(theta) * radial * 1.12
      const sprigY = Math.sin(theta) * radial * 0.82
      const sprigDepth = 0.04 + (1 - rimFade) * 0.05 + stableNoise(seed + 11) * 0.06 + clump.depthBias
      const sprigZ = depthToZ(sprigDepth)
      const leafletSize = (0.031 + (1 - rimFade) * 0.033 + stableNoise(seed + 9) * 0.013) * settings.scale

      const stemAngle = Math.atan2(sprigY, sprigX)
      const stemLength = radial * 0.55
      if (stemLength > 0.03) {
        parts.push(
          bakeGeometry(
            unitPlane,
            sprigX - Math.cos(stemAngle) * stemLength * 0.5,
            sprigY - Math.sin(stemAngle) * stemLength * 0.5,
            sprigZ - 0.02,
            stemAngle,
            stemLength,
            0.009 * settings.scale,
          ),
        )
      }

      const sprigAngle = theta + (stableNoise(seed + 7) - 0.5) * 1.4
      const cosA = Math.cos(sprigAngle)
      const sinA = Math.sin(sprigAngle)
      const leafletCount = 4 + Math.round(stableNoise(seed + 21) * 2)
      const twigLength = leafletSize * leafletCount * 0.62

      parts.push(
        bakeGeometry(
          unitPlane,
          sprigX + (twigLength * 0.5) * cosA,
          sprigY + (twigLength * 0.5) * sinA,
          sprigZ - 0.01,
          sprigAngle,
          twigLength,
          leafletSize * 0.09,
        ),
      )

      for (let leaflet = 0; leaflet <= leafletCount; leaflet += 1) {
        const fan = leafletCount === 0 ? 0.5 : leaflet / leafletCount
        const spreadAngle =
          (fan - 0.5) * (1.25 + stableNoise(seed + leaflet * 5) * 0.45) +
          (stableNoise(seed + leaflet * 11) - 0.5) * 0.4
        const attachT = 0.5 + fan * 0.5
        const baseX = twigLength * attachT
        const leafletLength = leafletSize * (0.85 + stableNoise(seed + leaflet * 7) * 0.45)
        const rotation = spreadAngle + (stableNoise(seed + leaflet * 19) - 0.5) * 0.5
        const geometry =
          leafGeometries[Math.floor(stableNoise(seed + leaflet * 13) * leafGeometries.length) % leafGeometries.length]

        const localX = baseX + Math.cos(rotation) * leafletLength * 0.92
        const localY = Math.sin(rotation) * leafletLength * 0.92

        parts.push(
          bakeGeometry(
            geometry,
            sprigX + localX * cosA - localY * sinA,
            sprigY + localX * sinA + localY * cosA,
            sprigZ + (stableNoise(seed + leaflet * 23) - 0.5) * 0.08,
            sprigAngle + rotation,
            leafletLength,
            leafletLength * (0.4 + stableNoise(seed + leaflet * 17) * 0.14),
          ),
        )
      }
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), casterMaterial)
    mesh.castShadow = true
    for (const part of parts) part.dispose()
    group.add(mesh)
    canopy.add(group)
  })

  return canopy
}

function buildWindowGroup(settings: ShadowSettings, casterMaterial: THREE.Material) {
  const window = new THREE.Group()
  window.name = 'window'

  // blinds sit almost on the page plane: minimal penumbra keeps architecture
  // crisp and rigid regardless of light softness
  const parts = getWindowRects(settings.density, settings.scale).map((rect) =>
    bakeGeometry(unitPlane, rect.x, rect.y, 0.06, rect.rotation, rect.width, rect.height),
  )

  const mesh = new THREE.Mesh(mergeGeometries(parts, false), casterMaterial)
  mesh.castShadow = true
  for (const part of parts) part.dispose()
  window.add(mesh)

  return window
}

function V3Scene({
  crispnessScale,
  mode,
  settings,
  shadowTint,
  sunAngle,
}: {
  crispnessScale: number
  mode: ShadowMapMode
  settings: ShadowSettings
  shadowTint: readonly [number, number, number]
  sunAngle: number
}) {
  const { camera, size, viewport } = useThree()
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const shadowMaterialRef = useRef<THREE.ShadowMaterial>(null)

  const shadowMapSize = pickShadowMapSize(size.width, viewport.dpr)

  const foliage = useMemo(() => {
    const leafGeometries = makeLeafGeometryVariants()
    // invisible to the camera (no color, no depth) but fully present in the
    // light's shadow pass
    const casterMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const root = new THREE.Group()

    if (mode !== 'window') root.add(buildCanopyGroup(settings, leafGeometries, casterMaterial))
    if (mode !== 'canopy') root.add(buildWindowGroup(settings, casterMaterial))
    for (const geometry of leafGeometries) geometry.dispose()

    return root
  }, [mode, settings])

  useEffect(() => {
    return () => {
      foliage.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
    }
  }, [foliage])

  useEffect(() => {
    // orthographic framing matching v2: world x spans [-1, 1] across the
    // viewport width
    camera.zoom = size.width / 2
    camera.updateProjectionMatrix()
  }, [camera, size])

  useFrame(({ clock }) => {
    const animatedTime = clock.elapsedTime * settings.speed
    const canopyGroup = foliage.getObjectByName('canopy')

    if (canopyGroup) {
      // hierarchical wind, identical feel to v2: per-clump phase, slow large
      // sway plus a faster small flutter; blinds stay rigid
      for (const clump of canopyGroup.children) {
        const { baseX, baseY, phase } = clump.userData
        clump.rotation.z =
          Math.sin(animatedTime * 0.32 + phase) * 0.024 * settings.strength +
          Math.sin(animatedTime * 0.86 + phase * 2.3) * 0.009 * settings.strength
        clump.position.x = baseX + Math.sin(animatedTime * 0.21 + phase) * 0.016 * settings.strength
        clump.position.y = baseY + Math.cos(animatedTime * 0.27 + phase * 1.4) * 0.009 * settings.strength
      }
    }

    // the one sun-angle truth becomes the actual light position, so shadow
    // displacement and stretch follow the day physically
    lightRef.current?.position.set(Math.cos(sunAngle) * 3.5, Math.sin(sunAngle) * 3.5, 6.5)
    shadowMaterialRef.current?.color.setRGB(shadowTint[0], shadowTint[1], shadowTint[2])

    if (lightRef.current) {
      // edge softness: the native PCF filter disk radius in shadow-map texels.
      // crispness is the user knob, crispnessScale the day cycle (edges harden
      // toward noon, soften toward the horizons). It's a struct uniform, so
      // animating it per frame is free -- no recompile.
      lightRef.current.shadow.radius = Math.min(
        30,
        Math.max(1, 7.5 / Math.max(0.2, settings.crispness * crispnessScale)),
      )
    }
  })

  return (
    <>
      {/* key remounts the light when the map size tier changes (rotation,
          window resize) so the old shadow map texture is actually disposed */}
      <directionalLight
        castShadow
        intensity={1}
        key={shadowMapSize}
        ref={lightRef}
        shadow-bias={-0.0004}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
      >
        {/* frustum must go through constructor args: mutating shadow-camera-*
            props never triggers updateProjectionMatrix, leaving the default
            +-5 frustum and ~4x coarser shadow texels than intended */}
        <orthographicCamera
          args={[-shadowFrustum, shadowFrustum, shadowFrustum, -shadowFrustum, 0.5, 14]}
          attach="shadow-camera"
        />
      </directionalLight>
      <primitive object={foliage} />
      <mesh receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial ref={shadowMaterialRef} transparent />
      </mesh>
    </>
  )
}

export default function V3ShadowLayer({
  crispnessScale,
  mode,
  opacityScale,
  settings,
  shadowTint,
  sunAngle,
}: {
  crispnessScale: number
  mode: ShadowMapMode
  opacityScale: number
  settings: ShadowSettings
  shadowTint: readonly [number, number, number]
  sunAngle: number
}) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    emitDebugTimelineEvent('v3 pcss scene mounted')
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
      {/* shadows="percentage" = plain PCF: r185 deprecated PCFSoftShadowMap
          (native PCF is already soft -- Vogel disk + hardware bilinear) and
          asking for it warns every frame */}
      <Canvas
        camera={{ far: 30, near: 0.1, position: [0, 0, 10] }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
        orthographic
        shadows="percentage"
      >
        <V3Scene
          crispnessScale={crispnessScale}
          mode={mode}
          settings={settings}
          shadowTint={shadowTint}
          sunAngle={sunAngle}
        />
      </Canvas>
    </div>
  )
}
