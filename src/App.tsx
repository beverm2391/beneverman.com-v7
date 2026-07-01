import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import './App.css'

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.04;
      amplitude *= 0.48;
    }

    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

    float slowTime = uTime * 0.035;
    float mist = fbm(centered * 2.2 + vec2(slowTime, -slowTime * 0.7));
    float fineMist = fbm(centered * 5.0 - vec2(slowTime * 2.0, slowTime));
    float vignette = smoothstep(0.92, 0.12, length(centered));

    vec3 ink = vec3(0.018, 0.022, 0.032);
    vec3 blue = vec3(0.09, 0.18, 0.26);
    vec3 rose = vec3(0.32, 0.16, 0.20);
    vec3 amber = vec3(0.55, 0.36, 0.16);

    vec3 color = ink;
    color = mix(color, blue, smoothstep(0.35, 0.92, mist) * 0.72);
    color = mix(color, rose, smoothstep(0.52, 0.88, fineMist) * 0.28);

    float starGrid = hash(floor((uv + vec2(slowTime * 0.16, 0.0)) * 560.0));
    float starMask = step(0.996, starGrid);
    float starTwinkle = 0.55 + 0.45 * sin(uTime * 1.8 + starGrid * 25.0);
    color += vec3(0.78, 0.86, 0.92) * starMask * starTwinkle * vignette;

    float warmDust = smoothstep(0.64, 0.98, fbm(centered * 9.0 + 4.0));
    color += amber * warmDust * 0.035 * vignette;
    color *= 0.55 + vignette * 0.58;

    gl_FragColor = vec4(color, 1.0);
  }
`

function SpaceShader() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
    }),
    [],
  )

  useFrame(({ clock, size }) => {
    const material = materialRef.current
    if (!material) return

    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uResolution.value = [size.width, size.height]
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

function AsciiMoon() {
  return (
    <pre className="ascii-moon" aria-label="ASCII moon">
      {`        _..._
     .:::::::.
   .:::::::::::.
  :::::::::::::::
 :::::::'   '::::
 :::::  .-.  ::::
 :::::  '-'  ::::
  :::::.....::::
   ':::::::::'
      ''::''`}
    </pre>
  )
}

function App() {
  return (
    <main className="site-shell">
      <div className="space-stage" aria-hidden="true">
        <Canvas
          orthographic
          camera={{ position: [0, 0, 1], zoom: 1 }}
          gl={{ antialias: false, alpha: false }}
        >
          <SpaceShader />
        </Canvas>
      </div>

      <div className="comet comet-a" aria-hidden="true" />
      <div className="comet comet-b" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <section className="hero-panel">
        <p className="kicker">beneverman.com v7</p>
        <h1>Ben Everman</h1>
        <p className="lede">
          One human, many agents. Building small systems with strange leverage.
        </p>
      </section>

      <AsciiMoon />

      <nav className="link-dock" aria-label="Primary links">
        <a href="https://github.com/beverm2391">GitHub</a>
        <a href="https://x.com/beverm2391">X</a>
        <a href="mailto:ben@beneverman.com">Email</a>
      </nav>
    </main>
  )
}

export default App
