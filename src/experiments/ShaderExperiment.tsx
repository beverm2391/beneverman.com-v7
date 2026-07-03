import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './ShaderExperiment.css'
import shadertoyCoarseNoiseUrl from '../assets/shadertoy/noise-64.png'
import {
  bufferVertexShader,
  jupiterBufferAFragmentShader,
  jupiterBufferBFragmentShader,
} from '../shaders/shadertoyJupiter'

const JUPITER_BUFFER_WIDTH = 960
const JUPITER_BUFFER_HEIGHT = 540

const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const backgroundFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uCameraPitch;
  uniform float uObserverAltitude;
  uniform vec3 uSunDirection;
  uniform float uStarStrength;
  uniform float uStarSize;
  uniform float uDriftSpeed;

  varying vec2 vUv;

  const float PI = 3.141592653589793;
  const float RAYLEIGH_SCALE_HEIGHT = 8.0;
  const float ATMOSPHERE_HEIGHT = 100.0;
  const float VIEW_DISTANCE = 200.0;
  const int PRIMARY_STEPS = 24;
  const vec3 rayleighBeta = vec3(0.0058, 0.0135, 0.0331);
  const vec3 SPACE_COLOR = vec3(0.0);
  const float SUN_INTENSITY = 20.0;

  mat2 rotate(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  float rayleighDensity(float altitude) {
    return exp(-max(altitude, 0.0) / RAYLEIGH_SCALE_HEIGHT);
  }

  float rayleighPhase(float mu) {
    return 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  }

  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
      value += noise2(p) * amplitude;
      p = p * 2.03 + vec2(3.7, -1.9);
      amplitude *= 0.5;
    }

    return value;
  }

  vec4 starField(vec2 uv, float density, float radius, float gate, float time) {
    vec2 gridUv = uv * density;
    vec2 baseCell = floor(gridUv);
    vec2 local = fract(gridUv);
    float brightness = 0.0;
    float tint = 0.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cellOffset = vec2(float(x), float(y));
        vec2 cell = baseCell + cellOffset;
        float seed = hash2(cell);
        float visible = step(gate, seed);
        vec2 starOffset = vec2(hash2(cell + 17.13), hash2(cell + 41.79));
        vec2 starLocal = cellOffset + starOffset - local;
        float starDistance = length(starLocal);
        float starCore = smoothstep(radius * 0.42, 0.0, starDistance);
        float starGlow = smoothstep(radius * 1.35, 0.0, starDistance) * 0.36;
        float star = starCore + starGlow;
        float phase = hash2(cell + 83.3) * 6.28318530718;
        float twinkle = 0.78 + 0.22 * sin(time * (0.35 + hash2(cell + 11.0) * 0.75) + phase);
        float value = star * visible * twinkle;

        brightness += value;
        tint += value * hash2(cell + 19.0);
      }
    }

    return vec4(brightness, brightness, tint, 1.0);
  }

  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float animatedTime = uTime * max(uDriftSpeed, 0.0);
    float hazeWaveA = 0.5 + 0.5 * sin((p.x * 1.35 + p.y * 0.42) * PI + animatedTime * 0.11);
    float hazeWaveB = 0.5 + 0.5 * sin((p.x * -0.62 + p.y * 0.85) * PI + animatedTime * 0.07 + 1.9);
    float movingHaze = mix(hazeWaveA, hazeWaveB, 0.38);

    vec3 viewDir = normalize(vec3(p.x, p.y, 1.0));
    viewDir.yz = rotate(radians(uCameraPitch)) * viewDir.yz;
    vec3 skyDir = normalize(vec3(viewDir.x, max(viewDir.y, 0.0), viewDir.z));

    float stepSize = VIEW_DISTANCE / float(PRIMARY_STEPS);
    float viewOpticalDepth = 0.0;
    vec3 scattering = vec3(0.0);

    for (int i = 0; i < PRIMARY_STEPS; i++) {
      float t = (float(i) + 0.5) * stepSize;
      float h = uObserverAltitude + t * skyDir.y;

      if (h < 0.0) break;
      if (h > ATMOSPHERE_HEIGHT) break;

      float dR = rayleighDensity(h);
      viewOpticalDepth += dR * stepSize;

      vec3 transmittance = exp(-rayleighBeta * viewOpticalDepth);
      scattering += dR * transmittance * stepSize;
    }

    vec3 sunDirection = normalize(uSunDirection);
    float phase = rayleighPhase(dot(skyDir, sunDirection));
    float sunElevation = clamp(sunDirection.y * 0.5 + 0.5, 0.0, 1.0);
    float lowSun = 1.0 - smoothstep(0.18, 0.72, sunElevation);
    float horizonBand = smoothstep(-0.04, 0.24, skyDir.y) * (1.0 - smoothstep(0.22, 0.62, skyDir.y));
    horizonBand *= mix(0.76, 1.18, movingHaze);
    vec3 sunsetTint = mix(vec3(1.08, 0.62, 0.26), vec3(0.82, 0.94, 1.18), smoothstep(0.12, 0.86, sunElevation));
    scattering *= SUN_INTENSITY * phase * rayleighBeta * sunsetTint * mix(0.72, 1.18, sunElevation) * mix(0.92, 1.08, movingHaze);

    float horizon = smoothstep(-0.12, 0.05, skyDir.y);
    vec3 color = mix(SPACE_COLOR, scattering, horizon);
    vec3 horizonTint = mix(vec3(0.9, 0.32, 0.08), vec3(0.18, 0.34, 0.56), sunElevation);
    color += horizonTint * horizonBand * mix(0.012, 0.072, lowSun);
    color += mix(vec3(0.08, 0.16, 0.28), vec3(0.22, 0.38, 0.62), sunElevation) * horizonBand * movingHaze * 0.018;

    vec2 starUv = p * vec2(1.0, 0.62) + vec2(animatedTime * 0.018, -animatedTime * 0.009);
    float spaceMask = 1.0 - smoothstep(0.0, 0.34, skyDir.y);
    float highSkyMask = smoothstep(0.02, 0.55, skyDir.y);
    vec4 backgroundStars = starField(starUv, 190.0, 0.04 * uStarSize, 0.986, animatedTime);
    vec3 starTint = mix(vec3(0.46, 0.62, 0.88), vec3(0.68, 0.82, 1.0), clamp(backgroundStars.z, 0.0, 1.0));
    color += starTint * backgroundStars.x * spaceMask * highSkyMask * 0.85 * uStarStrength;

    color = acesFilm(color);

    gl_FragColor = vec4(color, 1.0);
  }
`

const planetVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const foregroundStarsFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uStarStrength;
  uniform float uStarSize;
  uniform float uDriftSpeed;

  varying vec2 vUv;

  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  vec4 starField(vec2 uv, float density, float radius, float gate, float time) {
    vec2 gridUv = uv * density;
    vec2 baseCell = floor(gridUv);
    vec2 local = fract(gridUv);
    float brightness = 0.0;
    float tint = 0.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cellOffset = vec2(float(x), float(y));
        vec2 cell = baseCell + cellOffset;
        float seed = hash2(cell);
        float visible = step(gate, seed);
        vec2 starOffset = vec2(hash2(cell + 17.13), hash2(cell + 41.79));
        vec2 starLocal = cellOffset + starOffset - local;
        float starDistance = length(starLocal);
        float starCore = smoothstep(radius * 0.42, 0.0, starDistance);
        float starGlow = smoothstep(radius * 1.35, 0.0, starDistance) * 0.36;
        float star = starCore + starGlow;
        float phase = hash2(cell + 83.3) * 6.28318530718;
        float twinkle = 0.78 + 0.22 * sin(time * (0.35 + hash2(cell + 11.0) * 0.75) + phase);
        float value = star * visible * twinkle;

        brightness += value;
        tint += value * hash2(cell + 19.0);
      }
    }

    return vec4(brightness, brightness, tint, 1.0);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float animatedTime = uTime * max(uDriftSpeed, 0.0);

    vec2 nearUv = p * vec2(1.12, 0.72) + vec2(animatedTime * 0.035, -animatedTime * 0.018);
    vec4 nearStars = starField(nearUv, 78.0, 0.036 * uStarSize, 0.965, animatedTime);

    vec2 farUv = p * vec2(1.0, 0.64) + vec2(-animatedTime * 0.018, animatedTime * 0.009);
    vec4 farStars = starField(farUv, 145.0, 0.028 * uStarSize, 0.982, animatedTime);

    vec3 nearTint = mix(vec3(0.56, 0.72, 0.96), vec3(0.78, 0.9, 1.0), clamp(nearStars.z, 0.0, 1.0));
    vec3 farTint = mix(vec3(0.42, 0.58, 0.84), vec3(0.62, 0.76, 0.98), clamp(farStars.z, 0.0, 1.0));
    vec3 color = nearTint * nearStars.x;
    color += farTint * farStars.x * 0.65;

    float alpha = clamp((nearStars.x * 0.75 + farStars.x * 0.42) * uStarStrength, 0.0, 0.9);
    if (alpha <= 0.001) discard;

    gl_FragColor = vec4(color * uStarStrength, alpha);
  }
`

const planetFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uSunElevation;
  uniform float uObserverAltitude;
  uniform sampler2D uChannel0;

  varying vec2 vUv;

  const float PI = 3.141592653589793;

  float noise3D(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 128.852))) * 43758.5453) * 2.0 - 1.0;
  }

  float simplex3D(vec3 p) {
    float f3 = 1.0 / 3.0;
    float s = (p.x + p.y + p.z) * f3;
    int i = int(floor(p.x + s));
    int j = int(floor(p.y + s));
    int k = int(floor(p.z + s));

    float g3 = 1.0 / 6.0;
    float t = float(i + j + k) * g3;
    float x0 = p.x - (float(i) - t);
    float y0 = p.y - (float(j) - t);
    float z0 = p.z - (float(k) - t);

    int i1;
    int j1;
    int k1;
    int i2;
    int j2;
    int k2;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      }
    }

    float x1 = x0 - float(i1) + g3;
    float y1 = y0 - float(j1) + g3;
    float z1 = z0 - float(k1) + g3;
    float x2 = x0 - float(i2) + 2.0 * g3;
    float y2 = y0 - float(j2) + 2.0 * g3;
    float z2 = z0 - float(k2) + 2.0 * g3;
    float x3 = x0 - 1.0 + 3.0 * g3;
    float y3 = y0 - 1.0 + 3.0 * g3;
    float z3 = z0 - 1.0 + 3.0 * g3;

    vec3 ijk0 = vec3(float(i), float(j), float(k));
    vec3 ijk1 = vec3(float(i + i1), float(j + j1), float(k + k1));
    vec3 ijk2 = vec3(float(i + i2), float(j + j2), float(k + k2));
    vec3 ijk3 = vec3(float(i + 1), float(j + 1), float(k + 1));

    vec3 gr0 = normalize(vec3(noise3D(ijk0), noise3D(ijk0 * 2.01), noise3D(ijk0 * 2.02)));
    vec3 gr1 = normalize(vec3(noise3D(ijk1), noise3D(ijk1 * 2.01), noise3D(ijk1 * 2.02)));
    vec3 gr2 = normalize(vec3(noise3D(ijk2), noise3D(ijk2 * 2.01), noise3D(ijk2 * 2.02)));
    vec3 gr3 = normalize(vec3(noise3D(ijk3), noise3D(ijk3 * 2.01), noise3D(ijk3 * 2.02)));

    float n0 = 0.0;
    float n1 = 0.0;
    float n2 = 0.0;
    float n3 = 0.0;

    float t0 = 0.5 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0.0) {
      t0 *= t0;
      n0 = t0 * t0 * dot(gr0, vec3(x0, y0, z0));
    }

    float t1 = 0.5 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0.0) {
      t1 *= t1;
      n1 = t1 * t1 * dot(gr1, vec3(x1, y1, z1));
    }

    float t2 = 0.5 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0.0) {
      t2 *= t2;
      n2 = t2 * t2 * dot(gr2, vec3(x2, y2, z2));
    }

    float t3 = 0.5 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0.0) {
      t3 *= t3;
      n3 = t3 * t3 * dot(gr3, vec3(x3, y3, z3));
    }

    return 96.0 * (n0 + n1 + n2 + n3);
  }

  float fbm(vec3 p) {
    float f;
    f = 0.50000 * simplex3D(p); p = p * 2.01;
    f += 0.25000 * simplex3D(p); p = p * 2.02;
    f += 0.12500 * simplex3D(p); p = p * 2.03;
    f += 0.06250 * simplex3D(p); p = p * 2.04;
    f += 0.03125 * simplex3D(p); p = p * 2.05;
    f += 0.015625 * simplex3D(p);
    return f;
  }

  vec4 generateSphereSurfaceWithMask(vec2 uv, float radius) {
    float radiusSquared = radius * radius;
    float uvLengthSquared = dot(uv, uv);
    float uvLength = sqrt(uvLengthSquared);
    float edgeWidth = max(fwidth(uvLength) * 1.5, 0.0015);
    float mask = smoothstep(radius + edgeWidth, radius - edgeWidth, uvLength);
    vec3 surface = vec3(0.0);

    if (uvLength <= radius) {
      surface = vec3(uv / radius, sqrt(max(radiusSquared - uvLengthSquared, 0.0)) / radius);
    } else {
      surface = vec3(uv / max(uvLength, 0.0001), uvLength - radius);
    }

    return vec4(surface, mask);
  }

  vec2 generateSphericalUV(vec3 position, float spin, float scale) {
    float width = max(sqrt(max(1.0 - position.y * position.y, 0.0)), 0.0001);
    float leftRightSign = sign(position.x);
    float frontBackSign = position.z < 0.0 ? -1.0 : 1.0;
    float generatrixX = position.x / width * frontBackSign;
    vec2 generatrix = clamp(vec2(generatrixX, position.y), vec2(-1.0), vec2(1.0));
    vec2 uv = asin(generatrix) / PI * scale + vec2(0.5 + spin, 0.5);

    if (frontBackSign < 0.0) {
      uv.x += leftRightSign;
    }

    return uv;
  }

  mat3 createRotationMatrix(float pitch, float roll) {
    float cosPitch = cos(pitch);
    float sinPitch = sin(pitch);
    float cosRoll = cos(roll);
    float sinRoll = sin(roll);

    return mat3(
      cosRoll, -sinRoll * cosPitch, sinRoll * sinPitch,
      sinRoll, cosRoll * cosPitch, -cosRoll * sinPitch,
      0.0, sinPitch, cosPitch
    );
  }

  vec4 atmosphere(vec4 sphereSurfaceWithMask, vec3 lightDirection, vec3 atmosphereColor, float haloWidth, float minAtmosphere, float maxAtmosphere, float falloff) {
    vec3 absorbtion = vec3(2.0, 3.0, 4.0);
    float inverseWidth = 1.0 / haloWidth;
    float fresnelBlend = pow(1.0 - sphereSurfaceWithMask.z, falloff);
    float amount = mix(minAtmosphere, maxAtmosphere, fresnelBlend);
    vec3 normal = sphereSurfaceWithMask.xyz;

    if (sphereSurfaceWithMask.w < 0.5) {
      float haloBlend = pow(max(1.0 - sphereSurfaceWithMask.z * inverseWidth, 0.0), 5.0);
      amount = haloBlend * maxAtmosphere;
      normal = vec3(sphereSurfaceWithMask.xy, 0.0);
    }

    float light = max((dot(normal, lightDirection) + 0.3) / 1.3, 0.0);
    vec3 absorbedLight = vec3(pow(light, absorbtion.x), pow(light, absorbtion.y), pow(light, absorbtion.z));
    vec3 litAtmosphere = absorbedLight * atmosphereColor;

    return vec4(litAtmosphere, amount);
  }

  float wrappedDiffuse(vec3 normal, vec3 lightDirection, float wrap, float shadowFloor) {
    float light = dot(normal, lightDirection);
    float wrappedLight = clamp((light + wrap) / (1.0 + wrap), 0.0, 1.0);
    float softenedLight = smoothstep(0.0, 1.0, wrappedLight);

    return mix(shadowFloor, 1.0, pow(softenedLight, 0.92));
  }

  vec3 coolPlanetPalette(vec3 channelColor) {
    float heat = clamp(dot(channelColor, vec3(0.45, 0.36, 0.19)), 0.0, 1.0);
    float cloud = clamp(channelColor.g * 0.72 + channelColor.b * 0.28, 0.0, 1.0);
    vec3 deepIndigo = vec3(0.035, 0.055, 0.12);
    vec3 stormBlue = vec3(0.11, 0.2, 0.34);
    vec3 hazeBlue = vec3(0.32, 0.5, 0.72);
    vec3 ice = vec3(0.72, 0.82, 0.88);
    vec3 color = mix(deepIndigo, stormBlue, smoothstep(0.08, 0.55, heat));
    color = mix(color, hazeBlue, smoothstep(0.34, 0.86, cloud) * 0.72);
    color = mix(color, ice, smoothstep(0.78, 1.0, channelColor.r) * 0.3);

    return color;
  }

  vec2 quakeLavaUV(vec2 uv, float amplitudeA, float amplitudeB, float frequency, float time) {
    vec2 waveA = vec2(
      sin(uv.y * frequency + time * 0.65),
      cos(uv.x * frequency * 0.73 - time * 0.52)
    ) * amplitudeA;
    vec2 waveB = vec2(
      cos((uv.x + uv.y) * frequency * 0.62 + time * 0.31),
      sin((uv.x - uv.y) * frequency * 0.81 - time * 0.43)
    ) * amplitudeB;

    return uv + waveA + waveB;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    vec3 lightDirection = normalize(vec3(uSunDirection.x, uSunDirection.y, -uSunDirection.z));

    float jupiterDistance = length(uv + vec2(0.2, 0.15));
    vec4 jupiterSurfaceWithMask = generateSphereSurfaceWithMask(uv + vec2(0.2, 0.15), 0.6);
    float jupiterRawLight = dot(lightDirection, jupiterSurfaceWithMask.xyz);
    float jupiterLight = wrappedDiffuse(jupiterSurfaceWithMask.xyz, lightDirection, 0.48, 0.035);
    float jupiterTerminatorHaze = smoothstep(-0.55, 0.2, jupiterRawLight) * (1.0 - smoothstep(0.08, 0.55, jupiterRawLight));
    vec4 jupiterAtmosphere = atmosphere(jupiterSurfaceWithMask, lightDirection, vec3(0.32, 0.52, 1.0) * 2.1, 0.2, 0.04, 0.46, 2.0);
    float jupiterMask = clamp(jupiterSurfaceWithMask.w, 0.0, 1.0);
    mat3 jupiterRotationMatrix = createRotationMatrix(-0.2, 0.3);
    vec3 rotatedJupiter = jupiterRotationMatrix * (jupiterSurfaceWithMask.xyz * jupiterMask);
    vec2 jupiterUV = generateSphericalUV(rotatedJupiter, uTime * 0.02, 1.0);
    vec2 jupiterAspectFactor = vec2(1.7777778, 1.0);
    vec2 jupiterChannelUV = fract((jupiterUV * 2.2 + vec2(0.0, 0.8)) * jupiterAspectFactor) / jupiterAspectFactor;
    vec3 jupiterTexture = texture2D(uChannel0, jupiterChannelUV).xyz;
    float jupiterGranularA = texture2D(uChannel0, fract(jupiterChannelUV * 5.7 + vec2(0.31, 0.17))).g;
    float jupiterGranularB = texture2D(uChannel0, fract(jupiterChannelUV * 17.0 + vec2(0.73, 0.41))).b;
    float jupiterFlow = texture2D(uChannel0, fract(jupiterChannelUV * 2.3 + vec2(0.09, 0.62))).r;
    jupiterTexture = clamp(
      jupiterTexture + (jupiterGranularA - 0.5) * 0.1 + (jupiterGranularB - 0.5) * 0.055,
      vec3(0.0),
      vec3(1.0)
    );
    vec3 jupiterChannelTexture = jupiterTexture;
    jupiterTexture = vec3(pow(jupiterTexture.x, 3.5), pow(jupiterTexture.y, 6.0), pow(jupiterTexture.z, 8.0)) * 3.5;
    jupiterTexture = coolPlanetPalette(clamp(jupiterTexture, vec3(0.0), vec3(1.0))) * 1.38;
    float gasContrast = (jupiterChannelTexture.r - 0.5) * 0.72 + (jupiterGranularA - 0.5) * 0.42 + (jupiterGranularB - 0.5) * 0.24;
    float gasFlow = smoothstep(0.38, 0.9, jupiterFlow) * smoothstep(0.12, 0.88, jupiterChannelTexture.g);
    jupiterTexture *= 1.0 + gasContrast;
    jupiterTexture += vec3(0.06, 0.14, 0.28) * gasFlow * 0.42;
    jupiterTexture += vec3(0.05, 0.12, 0.24) * jupiterTerminatorHaze * 0.42;
    jupiterTexture = clamp(jupiterTexture, vec3(0.0), vec3(1.8));

    vec3 jupiterWithBackground = jupiterTexture * jupiterLight * jupiterMask;
    vec3 jupiterWithAtmosphere = mix(jupiterWithBackground, jupiterAtmosphere.xyz, jupiterAtmosphere.w);

    vec2 overlayUV = vUv;
    vec3 overlayColor = mix(vec3(0.18), vec3(0.68), pow(overlayUV.x, 1.7)) * vec3(0.34, 0.52, 1.0) * 1.1;
    float sceneHazeBlend = jupiterAtmosphere.w * 0.45;
    float overlayAmount = (pow(1.0 - overlayUV.y * 0.5, 5.0) * 0.18 + 0.025) * jupiterMask;
    vec3 color = mix(jupiterWithAtmosphere, overlayColor, overlayAmount);
    color += overlayColor * sceneHazeBlend * 0.16;

    float jupiterEdge = smoothstep(0.6 + 0.18, 0.6 - 0.002, jupiterDistance);
    float alpha = max(jupiterMask * jupiterEdge, jupiterAtmosphere.w * 0.82);
    if (alpha <= 0.002) {
      discard;
    }

    gl_FragColor = vec4(color, alpha);
  }
`

type PlanetControls = {
  cameraPitch: number
  observerAltitude: number
  planetX: number
  planetY: number
  planetScale: number
  lightAngle: number
  sunHeight: number
}

type TextureControls = {
  washStrength: number
  grainStrength: number
  speckleStrength: number
  starStrength: number
  starSize: number
  hazeStrength: number
  hazeSize: number
  driftSpeed: number
}

function SkyBackground({
  cameraPitch,
  observerAltitude,
  sunDirection,
  starStrength,
  starSize,
  driftSpeed,
}: Pick<PlanetControls, 'cameraPitch' | 'observerAltitude'> & {
  sunDirection: THREE.Vector3
} & Pick<TextureControls, 'starStrength' | 'starSize' | 'driftSpeed'>) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCameraPitch: { value: cameraPitch },
      uObserverAltitude: { value: observerAltitude },
      uSunDirection: { value: sunDirection.clone() },
      uStarStrength: { value: starStrength },
      uStarSize: { value: starSize },
      uDriftSpeed: { value: driftSpeed },
    }),
    [cameraPitch, driftSpeed, observerAltitude, starSize, starStrength, sunDirection],
  )

  useFrame(({ clock }) => {
    const material = materialRef.current
    if (!material) return

    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCameraPitch.value = cameraPitch
    material.uniforms.uObserverAltitude.value = observerAltitude
    material.uniforms.uSunDirection.value.copy(sunDirection)
    material.uniforms.uStarStrength.value = starStrength
    material.uniforms.uStarSize.value = starSize
    material.uniforms.uDriftSpeed.value = driftSpeed
  })

  return (
    <mesh renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

function ForegroundStars({
  starStrength,
  starSize,
  driftSpeed,
}: Pick<TextureControls, 'starStrength' | 'starSize' | 'driftSpeed'>) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStarStrength: { value: starStrength },
      uStarSize: { value: starSize },
      uDriftSpeed: { value: driftSpeed },
    }),
    [driftSpeed, starSize, starStrength],
  )

  useFrame(({ clock }) => {
    const material = materialRef.current
    if (!material) return

    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uStarStrength.value = starStrength
    material.uniforms.uStarSize.value = starSize
    material.uniforms.uDriftSpeed.value = driftSpeed
  })

  return (
    <mesh renderOrder={-5}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={backgroundVertexShader}
        fragmentShader={foregroundStarsFragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

function configureInputTexture(texture: THREE.Texture) {
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

function createJupiterRenderTarget() {
  const target = new THREE.WebGLRenderTarget(JUPITER_BUFFER_WIDTH, JUPITER_BUFFER_HEIGHT, {
    depthBuffer: false,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  })
  target.texture.generateMipmaps = false

  return target
}

function Planet({
  planetX,
  planetY,
  planetScale,
  sunDirection,
  observerAltitude,
}: Pick<PlanetControls, 'planetX' | 'planetY' | 'planetScale' | 'observerAltitude'> & {
  sunDirection: THREE.Vector3
}) {
  const groupRef = useRef<THREE.Group>(null)
  const planetMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const jupiterFrameRef = useRef(0)
  const { gl, viewport } = useThree()
  const coarseNoiseTexture = useLoader(THREE.TextureLoader, shadertoyCoarseNoiseUrl)

  useEffect(() => {
    configureInputTexture(coarseNoiseTexture)
  }, [coarseNoiseTexture])

  const jupiterPipeline = useMemo(() => {
    const resolution = new THREE.Vector3(JUPITER_BUFFER_WIDTH, JUPITER_BUFFER_HEIGHT, 1)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const bufferATargets = [createJupiterRenderTarget(), createJupiterRenderTarget()] as const
    const bufferBTarget = createJupiterRenderTarget()
    const bufferAMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bufferVertexShader,
      fragmentShader: jupiterBufferAFragmentShader,
      uniforms: {
        iResolution: { value: resolution },
        iTime: { value: 0 },
        iFrame: { value: 0 },
        iChannel0: { value: coarseNoiseTexture },
        iChannel1: { value: bufferATargets[0].texture },
      },
      depthTest: false,
      depthWrite: false,
    })
    const bufferBMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bufferVertexShader,
      fragmentShader: jupiterBufferBFragmentShader,
      uniforms: {
        iResolution: { value: resolution },
        iChannel0: { value: bufferATargets[0].texture },
      },
      depthTest: false,
      depthWrite: false,
    })
    const bufferAScene = new THREE.Scene()
    const bufferBScene = new THREE.Scene()

    bufferAScene.add(new THREE.Mesh(geometry, bufferAMaterial))
    bufferBScene.add(new THREE.Mesh(geometry, bufferBMaterial))

    return {
      bufferAMaterial,
      bufferAScene,
      bufferATargets,
      bufferBMaterial,
      bufferBScene,
      bufferBTarget,
      camera,
      geometry,
    }
  }, [coarseNoiseTexture])

  useEffect(() => {
    return () => {
      jupiterPipeline.bufferAMaterial.dispose()
      jupiterPipeline.bufferBMaterial.dispose()
      jupiterPipeline.bufferATargets.forEach((target) => target.dispose())
      jupiterPipeline.bufferBTarget.dispose()
      jupiterPipeline.geometry.dispose()
    }
  }, [jupiterPipeline])

  const planetUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDirection: { value: sunDirection.clone() },
      uSunElevation: { value: sunDirection.y },
      uObserverAltitude: { value: observerAltitude },
      uChannel0: { value: jupiterPipeline.bufferBTarget.texture },
    }),
    [jupiterPipeline, observerAltitude, sunDirection],
  )

  useFrame(({ clock }) => {
    const frame = jupiterFrameRef.current
    const readTarget = jupiterPipeline.bufferATargets[frame % 2]
    const writeTarget = jupiterPipeline.bufferATargets[(frame + 1) % 2]
    const previousRenderTarget = gl.getRenderTarget()

    jupiterPipeline.bufferAMaterial.uniforms.iTime.value = clock.elapsedTime
    jupiterPipeline.bufferAMaterial.uniforms.iFrame.value = frame
    jupiterPipeline.bufferAMaterial.uniforms.iChannel1.value = readTarget.texture
    gl.setRenderTarget(writeTarget)
    gl.render(jupiterPipeline.bufferAScene, jupiterPipeline.camera)

    jupiterPipeline.bufferBMaterial.uniforms.iChannel0.value = writeTarget.texture
    gl.setRenderTarget(jupiterPipeline.bufferBTarget)
    gl.render(jupiterPipeline.bufferBScene, jupiterPipeline.camera)
    gl.setRenderTarget(previousRenderTarget)
    jupiterFrameRef.current = frame + 1

    const group = groupRef.current
    if (group) {
      group.rotation.z = -0.08 + Math.sin(clock.elapsedTime * 0.2) * 0.012
      group.position.x = planetX * viewport.width * 0.5
      group.position.y = planetY * viewport.height * 0.5
      group.scale.setScalar(planetScale)
    }

    const planetMaterial = planetMaterialRef.current
    if (planetMaterial) {
      planetMaterial.uniforms.uTime.value = clock.elapsedTime
      planetMaterial.uniforms.uSunDirection.value.copy(sunDirection)
      planetMaterial.uniforms.uSunElevation.value = sunDirection.y
      planetMaterial.uniforms.uObserverAltitude.value = observerAltitude
    }
  })

  return (
    <group ref={groupRef} position={[planetX * viewport.width * 0.5, planetY * viewport.height * 0.5, 0]}>
      <mesh>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={planetMaterialRef}
          vertexShader={planetVertexShader}
          fragmentShader={planetFragmentShader}
          uniforms={planetUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

    </group>
  )
}

function ShaderControls({
  planetX,
  planetY,
  planetScale,
  lightAngle,
  sunHeight,
  cameraPitch,
  observerAltitude,
  washStrength,
  grainStrength,
  speckleStrength,
  starStrength,
  starSize,
  hazeStrength,
  hazeSize,
  driftSpeed,
  onCameraPitchChange,
  onObserverAltitudeChange,
  onPlanetXChange,
  onPlanetYChange,
  onPlanetScaleChange,
  onLightAngleChange,
  onSunHeightChange,
  onWashStrengthChange,
  onGrainStrengthChange,
  onSpeckleStrengthChange,
  onStarStrengthChange,
  onStarSizeChange,
  onHazeStrengthChange,
  onHazeSizeChange,
  onDriftSpeedChange,
  isCollapsed,
  onToggleCollapsed,
}: PlanetControls & TextureControls & {
  onCameraPitchChange: (value: number) => void
  onObserverAltitudeChange: (value: number) => void
  onPlanetXChange: (value: number) => void
  onPlanetYChange: (value: number) => void
  onPlanetScaleChange: (value: number) => void
  onLightAngleChange: (value: number) => void
  onSunHeightChange: (value: number) => void
  onWashStrengthChange: (value: number) => void
  onGrainStrengthChange: (value: number) => void
  onSpeckleStrengthChange: (value: number) => void
  onStarStrengthChange: (value: number) => void
  onStarSizeChange: (value: number) => void
  onHazeStrengthChange: (value: number) => void
  onHazeSizeChange: (value: number) => void
  onDriftSpeedChange: (value: number) => void
  isCollapsed: boolean
  onToggleCollapsed: () => void
}) {
  return (
    <form className={`shader-controls${isCollapsed ? ' is-collapsed' : ''}`} aria-label="Shader controls">
      <div className="shader-controls-header">
        <span>Controls</span>
        <button
          type="button"
          className="shader-controls-toggle"
          aria-label={isCollapsed ? 'Show controls' : 'Hide controls'}
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? '+' : '-'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="shader-controls-list">
          <label>
            <span>Camera Pitch</span>
            <output>{cameraPitch.toFixed(2)}</output>
            <input
              type="range"
              min="-20"
              max="80"
              step="0.25"
              value={cameraPitch}
              onChange={(event) => onCameraPitchChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Altitude (km)</span>
            <output>{observerAltitude.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="30"
              step="0.1"
              value={observerAltitude}
              onChange={(event) => onObserverAltitudeChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Planet X</span>
            <output>{planetX.toFixed(2)}</output>
            <input
              type="range"
              min="-0.9"
              max="0.9"
              step="0.01"
              value={planetX}
              onChange={(event) => onPlanetXChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Planet Y</span>
            <output>{planetY.toFixed(2)}</output>
            <input
              type="range"
              min="-0.75"
              max="0.75"
              step="0.01"
              value={planetY}
              onChange={(event) => onPlanetYChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Planet Scale</span>
            <output>{planetScale.toFixed(2)}</output>
            <input
              type="range"
              min="0.35"
              max="2.4"
              step="0.01"
              value={planetScale}
              onChange={(event) => onPlanetScaleChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Light Angle</span>
            <output>{lightAngle.toFixed(2)}</output>
            <input
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step="0.01"
              value={lightAngle}
              onChange={(event) => onLightAngleChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Sun Height</span>
            <output>{sunHeight.toFixed(2)}</output>
            <input
              type="range"
              min="-0.35"
              max="1"
              step="0.01"
              value={sunHeight}
              onChange={(event) => onSunHeightChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Texture Wash</span>
            <output>{washStrength.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={washStrength}
              onChange={(event) => onWashStrengthChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Texture Grain</span>
            <output>{grainStrength.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={grainStrength}
              onChange={(event) => onGrainStrengthChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Texture Speckles</span>
            <output>{speckleStrength.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={speckleStrength}
              onChange={(event) => onSpeckleStrengthChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Stars</span>
            <output>{starStrength.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.01"
              value={starStrength}
              onChange={(event) => onStarStrengthChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Star Size</span>
            <output>{starSize.toFixed(2)}</output>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.01"
              value={starSize}
              onChange={(event) => onStarSizeChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Haze Strength</span>
            <output>{hazeStrength.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={hazeStrength}
              onChange={(event) => onHazeStrengthChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Haze Size</span>
            <output>{hazeSize.toFixed(2)}</output>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.01"
              value={hazeSize}
              onChange={(event) => onHazeSizeChange(event.currentTarget.valueAsNumber)}
            />
          </label>

          <label>
            <span>Drift</span>
            <output>{driftSpeed.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={driftSpeed}
              onChange={(event) => onDriftSpeedChange(event.currentTarget.valueAsNumber)}
            />
          </label>
        </div>
      )}
    </form>
  )
}

function App() {
  const [cameraPitch, setCameraPitch] = useState(24.5)
  const [observerAltitude, setObserverAltitude] = useState(17)
  const [planetX, setPlanetX] = useState(0.58)
  const [planetY, setPlanetY] = useState(0.42)
  const [planetScale, setPlanetScale] = useState(2.05)
  const [lightAngle, setLightAngle] = useState(-0.72)
  const [sunHeight, setSunHeight] = useState(0.49)
  const [washStrength, setWashStrength] = useState(0.23)
  const [grainStrength, setGrainStrength] = useState(0.31)
  const [speckleStrength, setSpeckleStrength] = useState(0.42)
  const [starStrength, setStarStrength] = useState(0.72)
  const [starSize, setStarSize] = useState(1.41)
  const [hazeStrength, setHazeStrength] = useState(0.58)
  const [hazeSize, setHazeSize] = useState(1)
  const [driftSpeed, setDriftSpeed] = useState(1)
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const sunDirection = useMemo(
    () => new THREE.Vector3(Math.cos(lightAngle), sunHeight, Math.sin(lightAngle)).normalize(),
    [lightAngle, sunHeight],
  )
  const textureStyle = useMemo(
    () =>
      ({
        '--texture-wash': washStrength,
        '--texture-grain': grainStrength,
        '--texture-speckles': speckleStrength,
        '--texture-play-state': driftSpeed === 0 ? 'paused' : 'running',
        '--texture-drift-duration': `${Math.max(12, 90 / Math.max(driftSpeed, 0.1))}s`,
        '--texture-shear-duration': `${Math.max(18, 120 / Math.max(driftSpeed, 0.1))}s`,
        '--planet-haze-x': `${50 + planetX * 50}%`,
        '--planet-haze-y': `${50 - planetY * 50}%`,
        '--planet-haze-strength': hazeStrength,
        '--planet-haze-size': hazeSize,
      }) as CSSProperties,
    [driftSpeed, grainStrength, hazeSize, hazeStrength, planetX, planetY, speckleStrength, washStrength],
  )

  return (
    <main className="site-shell" style={textureStyle}>
      <div className="space-stage" aria-hidden="true">
        <Canvas
          orthographic
          camera={{ position: [0, 0, 8], zoom: 100 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
        >
          <SkyBackground
            cameraPitch={cameraPitch}
            observerAltitude={observerAltitude}
            sunDirection={sunDirection}
            starStrength={starStrength}
            starSize={starSize}
            driftSpeed={driftSpeed}
          />
          <ForegroundStars
            starStrength={starStrength}
            starSize={starSize}
            driftSpeed={driftSpeed}
          />
          <Planet
            planetX={planetX}
            planetY={planetY}
            planetScale={planetScale}
            sunDirection={sunDirection}
            observerAltitude={observerAltitude}
          />
        </Canvas>
      </div>
      <div className="planet-haze-overlay" aria-hidden="true" />
      <div className="nebula-fog-overlay" aria-hidden="true" />
      <div className="space-dust-overlay" aria-hidden="true" />

      <section className="intro-copy" aria-label="About Ben Everman">
        <p>
          I'm currently working at Tekmir, where we're building an end-to-end platform for mass-action
          litigation.
        </p>
        <p>
          In my free time, I like to work on technical projects, like training neural nets, AI automation,
          and building full stack apps.
        </p>
        <p>
          On any given day, you can probably find me working at one of my favorite coffee shops in Atlanta.
        </p>
      </section>

      <ShaderControls
        cameraPitch={cameraPitch}
        observerAltitude={observerAltitude}
        planetX={planetX}
        planetY={planetY}
        planetScale={planetScale}
        lightAngle={lightAngle}
        sunHeight={sunHeight}
        washStrength={washStrength}
        grainStrength={grainStrength}
        speckleStrength={speckleStrength}
        starStrength={starStrength}
        starSize={starSize}
        hazeStrength={hazeStrength}
        hazeSize={hazeSize}
        driftSpeed={driftSpeed}
        onCameraPitchChange={setCameraPitch}
        onObserverAltitudeChange={setObserverAltitude}
        onPlanetXChange={setPlanetX}
        onPlanetYChange={setPlanetY}
        onPlanetScaleChange={setPlanetScale}
        onLightAngleChange={setLightAngle}
        onSunHeightChange={setSunHeight}
        onWashStrengthChange={setWashStrength}
        onGrainStrengthChange={setGrainStrength}
        onSpeckleStrengthChange={setSpeckleStrength}
        onStarStrengthChange={setStarStrength}
        onStarSizeChange={setStarSize}
        onHazeStrengthChange={setHazeStrength}
        onHazeSizeChange={setHazeSize}
        onDriftSpeedChange={setDriftSpeed}
        isCollapsed={controlsCollapsed}
        onToggleCollapsed={() => setControlsCollapsed((isCollapsed) => !isCollapsed)}
      />
    </main>
  )
}

export default App
