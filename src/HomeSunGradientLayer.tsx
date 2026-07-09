import { useEffect, useRef, useState } from 'react'
import type { BackgroundModeConfig } from './HomeSunGradientConfig'

const backgroundVertexShader = `
  attribute vec2 aPosition;

  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const backgroundFragmentShader = `
  precision highp float;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uMid;
  uniform vec3 uGlow;
  uniform vec3 uCool;
  uniform float uGlowStrength;
  uniform float uSunAngle;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
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
      value += noise(p) * amplitude;
      p *= 2.02;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    float aspect = uResolution.x / uResolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    float t = uTime * 0.018;
    float broadNoise = fbm(vec2(uv.x * 1.4 + t, uv.y * 1.9 - t * 0.7));
    float paperNoise = fbm(vec2(uv.x * 7.5 - t * 0.5, uv.y * 7.5 + t * 0.4));
    vec2 sunDirection = vec2(cos(uSunAngle), sin(uSunAngle));
    vec2 centered = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float halfSpan = length(vec2(aspect, 1.0)) * 0.5;
    float directionalLight = dot(centered, sunDirection) / halfSpan;
    float portraitScale = 1.0 - smoothstep(0.55, 1.25, aspect);
    float shapedLight = directionalLight - portraitScale * 0.18;
    float sunMix = smoothstep(
      mix(-0.46, 0.04, portraitScale),
      mix(0.56, 0.86, portraitScale),
      shapedLight + (broadNoise - 0.5) * mix(0.16, 0.1, portraitScale)
    );
    float sunGlow = smoothstep(
      mix(0.28, 0.55, portraitScale),
      1.0,
      shapedLight + (paperNoise - 0.5) * 0.08
    );

    float sunElevation = sin(uSunAngle);
    float daylight = smoothstep(-0.12, 0.22, sunElevation);
    float goldenHour = smoothstep(-0.08, 0.04, sunElevation) * (1.0 - smoothstep(0.18, 0.55, sunElevation));

    vec3 glowTint = mix(uGlow, vec3(1.0, 0.66, 0.42), goldenHour * 0.6);
    float glowStrength = uGlowStrength * mix(0.12, 1.0, daylight) * (1.0 + goldenHour * 0.9);

    vec3 paperSide = mix(uBase, vec3(0.985, 0.965, 0.925), 0.46);
    vec3 sunSide = mix(glowTint, vec3(1.0, 0.82, 0.5), 0.24);
    sunSide = mix(sunSide, vec3(1.0, 0.72, 0.5), goldenHour * 0.35);
    vec3 color = mix(paperSide, sunSide, sunMix * mix(0.25, 1.0, daylight));
    color = mix(color, glowTint, sunGlow * glowStrength * mix(1.0, 0.68, portraitScale));
    color = mix(color, uCool, (1.0 - sunMix) * smoothstep(0.36, 0.86, broadNoise) * 0.12);

    float night = 1.0 - daylight;
    float moonShapedLight = -directionalLight - portraitScale * 0.18;
    float moonMix = smoothstep(
      mix(-0.46, 0.04, portraitScale),
      mix(0.56, 0.86, portraitScale),
      moonShapedLight + (broadNoise - 0.5) * mix(0.16, 0.1, portraitScale)
    );
    float moonGlow = smoothstep(
      mix(0.28, 0.55, portraitScale),
      1.0,
      moonShapedLight + (paperNoise - 0.5) * 0.08
    );
    vec3 nightPaper = color * vec3(0.6, 0.645, 0.75);
    nightPaper = mix(nightPaper, vec3(0.72, 0.76, 0.86), moonMix * 0.22);
    nightPaper = mix(nightPaper, vec3(0.85, 0.88, 0.96), moonGlow * 0.38);
    color = mix(color, nightPaper, night);

    color += (paperNoise - 0.5) * 0.006;

    gl_FragColor = vec4(color, 1.0);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

export function HomeSunGradientLayer({
  mode,
  sunAngle,
}: {
  mode: BackgroundModeConfig
  sunAngle: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sunAngleRef = useRef(sunAngle)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    sunAngleRef.current = sunAngle
  }, [sunAngle])

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      stencil: false,
    })

    if (!canvas || !gl) return

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, backgroundVertexShader)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, backgroundFragmentShader)
    const program = gl.createProgram()

    if (!vertexShader || !fragmentShader || !program) return

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return
    }

    const buffer = gl.createBuffer()
    const positionLocation = gl.getAttribLocation(program, 'aPosition')
    const resolutionLocation = gl.getUniformLocation(program, 'uResolution')
    const timeLocation = gl.getUniformLocation(program, 'uTime')
    const baseLocation = gl.getUniformLocation(program, 'uBase')
    const midLocation = gl.getUniformLocation(program, 'uMid')
    const glowLocation = gl.getUniformLocation(program, 'uGlow')
    const coolLocation = gl.getUniformLocation(program, 'uCool')
    const glowStrengthLocation = gl.getUniformLocation(program, 'uGlowStrength')
    const sunAngleLocation = gl.getUniformLocation(program, 'uSunAngle')
    let frameId = 0
    let startTime = performance.now()

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio))
      const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      gl.viewport(0, 0, width, height)
    }

    const render = (now: number) => {
      resize()
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      )
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform1f(timeLocation, (now - startTime) / 1000)
      gl.uniform3fv(baseLocation, mode.shader.base)
      gl.uniform3fv(midLocation, mode.shader.mid)
      gl.uniform3fv(glowLocation, mode.shader.glow)
      gl.uniform3fv(coolLocation, mode.shader.cool)
      gl.uniform1f(glowStrengthLocation, mode.shader.glowStrength)
      gl.uniform1f(sunAngleLocation, sunAngleRef.current)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      frameId = requestAnimationFrame(render)
    }

    const handleVisibilityChange = () => {
      startTime = performance.now()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    frameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frameId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
    }
  }, [mode])

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <canvas
      aria-hidden="true"
      className="background-shader-layer"
      ref={canvasRef}
      style={{ opacity: isVisible ? 1 : 0 }}
    />
  )
}
