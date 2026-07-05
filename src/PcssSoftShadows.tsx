import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

// Vendored from @react-three/drei's <SoftShadows> (PCSS by N8Programs et al,
// Vogel disk + per-pixel noise rotation) with three structural changes:
//
// 1. Minimum filter radius (basement.studio's Daylight minSize trick). Stock
//    PCSS scales the filter disk purely by penumbraRatio, so casters that
//    nearly touch the receiver (our window blinds at z=0.06) get a ~1-texel
//    disk and the raw shadow-map texel grid shows through as staircase edges.
//    Flooring the disk guarantees every edge a few texels of noise-dithered
//    penumbra regardless of shadow map size or device.
// 2. Bilinear depth comparison per filter tap, so shadow edge positions are
//    continuous instead of quantized to the texel grid -- without it, long
//    straight casters render with a one-texel ripple that dithering only
//    softens, never straightens.
// 3. size / focus / minTexels are uniforms instead of baked constants. drei
//    recompiles every material through a global ShaderChunk swap on each prop
//    change, which hitches and proved fragile across vite HMR (stale patched
//    chunks made slider changes silently no-op). Uniforms update per frame
//    with no recompile, which also lets the day cycle animate edge softness.
//    Only the sample count stays compile-time (it sizes unrolled loops).

// Shared uniform objects: the receiver material binds these via
// bindPcssUniforms, and <PcssSoftShadows> writes prop values into them each
// frame. Module-level singleton is fine -- there is one shadow canvas.
export const pcssUniforms = {
  pcssFocus: { value: 0 },
  pcssMinTexels: { value: 2.5 },
  pcssSize: { value: 25 },
}

// Set as onBeforeCompile on every material that should receive PCSS shadows.
// Kept module-level so its identity (and the program cache key derived from
// its source) stays stable across renders.
export function bindPcssUniforms(shader: { uniforms: Record<string, { value: unknown }> }) {
  Object.assign(shader.uniforms, pcssUniforms)
}

const pcss = ({ samples = 10 } = {}) => /* glsl */ `
uniform float pcssFocus;
uniform float pcssMinTexels;
uniform float pcssSize;

#define RGB_NOISE_FUNCTION(uv) (randRGB(uv))
vec3 randRGB(vec2 uv) {
  return vec3(
    fract(sin(dot(uv, vec2(12.75613, 38.12123))) * 13234.76575),
    fract(sin(dot(uv, vec2(19.45531, 58.46547))) * 43678.23431),
    fract(sin(dot(uv, vec2(23.67817, 78.23121))) * 93567.23423)
  );
}

vec3 lowPassRandRGB(vec2 uv) {
  // 3x3 convolution (average)
  vec3 result = vec3(0);
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0, +1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0, +1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0, +1.0));
  result *= 0.111111111; // 1.0 / 9.0
  return result;
}
vec3 highPassRandRGB(vec2 uv) {
  // hp(x) = x - lp(x)
  return RGB_NOISE_FUNCTION(uv) - lowPassRandRGB(uv) + 0.5;
}

vec2 vogelDiskSample(int sampleIndex, int sampleCount, float angle) {
  const float goldenAngle = 2.399963f; // radians
  float r = sqrt(float(sampleIndex) + 0.5f) / sqrt(float(sampleCount));
  float theta = float(sampleIndex) * goldenAngle + angle;
  float sine = sin(theta);
  float cosine = cos(theta);
  return vec2(cosine, sine) * r;
}
float penumbraSize( const in float zReceiver, const in float zBlocker ) { // Parallel plane estimation
  return (zReceiver - zBlocker) / zBlocker;
}
float findBlocker(sampler2D shadowMap, vec2 uv, float compare, float angle) {
  float texelSize = 1.0 / float(textureSize(shadowMap, 0).x);
  float blockerDepthSum = pcssFocus;
  float blockers = 0.0;

  int j = 0;
  vec2 offset = vec2(0.);
  float depth = 0.;

  #pragma unroll_loop_start
  for(int i = 0; i < ${samples}; i ++) {
    offset = (vogelDiskSample(j, ${samples}, angle) * texelSize) * 2.0 * pcssSize;
    depth = unpackRGBAToDepth( texture2D( shadowMap, uv + offset));
    if (depth < compare) {
      blockerDepthSum += depth;
      blockers++;
    }
    j++;
  }
  #pragma unroll_loop_end

  if (blockers > 0.0) {
    return blockerDepthSum / blockers;
  }
  return -1.0;
}

// Bilinear-filtered depth comparison (the old three.js texture2DShadowLerp).
// A nearest-texel step() quantizes the shadow edge position to the map grid,
// which reads as wavy/stepped lines on long straight casters like blinds;
// interpolating the four neighboring comparisons makes the edge position
// continuous at sub-texel precision.
float depthCompareBilinear(sampler2D shadowMap, vec2 uv, float compare) {
  vec2 res = vec2(textureSize(shadowMap, 0));
  vec2 texel = 1.0 / res;
  vec2 grid = uv * res - 0.5;
  vec2 f = fract(grid);
  vec2 base = (floor(grid) + 0.5) * texel;
  float bl = step(compare, unpackRGBAToDepth(texture2D(shadowMap, base)));
  float br = step(compare, unpackRGBAToDepth(texture2D(shadowMap, base + vec2(texel.x, 0.0))));
  float tl = step(compare, unpackRGBAToDepth(texture2D(shadowMap, base + vec2(0.0, texel.y))));
  float tr = step(compare, unpackRGBAToDepth(texture2D(shadowMap, base + texel)));
  return mix(mix(bl, br, f.x), mix(tl, tr, f.x), f.y);
}

float vogelFilter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterTexels, float angle) {
  float texelSize = 1.0 / float(textureSize(shadowMap, 0).x);
  float shadow = 0.0f;
  int j = 0;
  vec2 vogelSample = vec2(0.0);
  vec2 offset = vec2(0.0);
  #pragma unroll_loop_start
  for (int i = 0; i < ${samples}; i++) {
    vogelSample = vogelDiskSample(j, ${samples}, angle) * texelSize;
    offset = vogelSample * filterTexels;
    shadow += depthCompareBilinear( shadowMap, uv + offset, zReceiver );
    j++;
  }
  #pragma unroll_loop_end
  return shadow * 1.0 / ${samples}.0;
}

float PCSS (sampler2D shadowMap, vec4 coords) {
  vec2 uv = coords.xy;
  float zReceiver = coords.z; // Assumed to be eye-space z in this code
  float angle = highPassRandRGB(gl_FragCoord.xy).r * PI2;
  float avgBlockerDepth = findBlocker(shadowMap, uv, zReceiver, angle);
  if (avgBlockerDepth == -1.0) {
    return 1.0;
  }
  float penumbraRatio = penumbraSize(zReceiver, avgBlockerDepth);
  // the max() keeps the filter disk from collapsing below a few texels, so
  // edges never quantize to the shadow map grid
  float filterTexels = max(1.25 * penumbraRatio * pcssSize, pcssMinTexels);
  return vogelFilter(shadowMap, uv, zReceiver, filterTexels, angle);
}`

function reset(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | undefined
    if (material) {
      gl.properties.remove(material)
      material.dispose?.()
    }
  })
  gl.info.programs!.length = 0
  gl.compile(scene, camera)
}

export function PcssSoftShadows({
  focus = 0,
  minTexels = 2.5,
  samples = 10,
  size = 25,
}: {
  focus?: number
  minTexels?: number
  samples?: number
  size?: number
}) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const original = THREE.ShaderChunk.shadowmap_pars_fragment
    THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment
      .replace('#ifdef USE_SHADOWMAP', '#ifdef USE_SHADOWMAP\n' + pcss({ samples }))
      .replace(
        '#if defined( SHADOWMAP_TYPE_PCF )',
        '\nreturn PCSS(shadowMap, shadowCoord);\n#if defined( SHADOWMAP_TYPE_PCF )',
      )
    reset(gl, scene, camera)
    return () => {
      THREE.ShaderChunk.shadowmap_pars_fragment = original
      reset(gl, scene, camera)
    }
  }, [camera, gl, samples, scene])

  useFrame(() => {
    pcssUniforms.pcssFocus.value = focus
    pcssUniforms.pcssMinTexels.value = minTexels
    pcssUniforms.pcssSize.value = size
  })

  return null
}
