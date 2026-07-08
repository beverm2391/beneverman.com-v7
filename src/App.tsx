import { type ComponentType, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  emitDebugTimelineEvent,
  getDebugTimelineEvents,
  subscribeDebugTimeline,
  type DebugTimelineEvent,
} from './debugTimeline'
import { canopyStyles, shadowMapModes, type CanopyStyle, type ShadowMapMode } from './shadowMapModes'
import {
  getShadowSourcePreview,
  subscribeShadowSourcePreview,
  type ShadowSourcePreview,
} from './shadowSourcePreview'
import { siteVisualConfig } from './siteVisualConfig'
import { SunIconLab } from './SunIconLab'
import { getShadowFactor, SunWidget, sunWidgetVariants, type SunWidgetVariant } from './SunWidget'

const tau = Math.PI * 2

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

type Vec3 = readonly [number, number, number]

function mixVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

type ShadowSettings = {
  blindStrength: number
  canopyStrength: number
  canopyStyle: CanopyStyle
  contrast: number
  crispness: number
  density: number
  depthMix: number
  layerSpread: number
  // warm light projected where casters don't block the sun (0 = shadows only)
  lightGlow: number
  opacity: number
  resolution: number
  sampleCount: number
  samplerX: number
  samplerY: number
  scale: number
  speed: number
  sunAngle: number
  // wind sway amplitude for the caster scene; distinct from blindStrength/
  // canopyStrength, which weight how darkly each layer's shadows press in
  wind: number
}

type TypeSettings = {
  lineHeight: number
  size: number
  tracking: number
  weight: number
  width: number
}

type TextureSettings = {
  opacity: number
  scale: number
}

type ShadowLayerComponent = ComponentType<{
  crispnessScale: number
  mode: ShadowMapMode
  opacityScale: number
  settings: ShadowSettings
  shadowTint: Vec3
  showSource?: boolean
  sunAngle: number
}>

type DebugPanelTab = 'shadow' | 'type' | 'logs'
type ShadowConfigTab = 'scene' | 'layers'
type ShadowLayerTab = 'blinds' | 'canopy'
type VisualSizeClass = 'mobilePortrait' | 'tabletPortrait' | 'desktop' | 'desktopWide'
type AppliedVisualPreset = 'mobile' | 'desktop'
type SunWidgetChoice = SunWidgetVariant | 'none'

const sunWidgetChoices = ['none', ...sunWidgetVariants] as const

const backgroundModes = [
  {
    color: '#f2f0ee',
    label: 'paper',
    shader: {
      base: [0.965, 0.945, 0.91],
      cool: [0.86, 0.84, 0.78],
      glow: [1, 0.965, 0.86],
      glowStrength: 0.24,
      mid: [0.93, 0.905, 0.86],
    },
  },
  {
    color: '#f1dcc2',
    label: 'sun',
    shader: {
      base: [0.972, 0.916, 0.84],
      cool: [0.83, 0.8, 0.72],
      glow: [1, 0.935, 0.76],
      glowStrength: 0.3,
      mid: [0.94, 0.862, 0.758],
    },
  },
  {
    color: '#e9c894',
    label: 'amber',
    shader: {
      base: [0.95, 0.875, 0.73],
      cool: [0.78, 0.72, 0.62],
      glow: [1, 0.88, 0.58],
      glowStrength: 0.33,
      mid: [0.914, 0.784, 0.58],
    },
  },
  {
    color: '#edcab3',
    label: 'peach',
    shader: {
      base: [0.962, 0.875, 0.812],
      cool: [0.84, 0.765, 0.725],
      glow: [1, 0.89, 0.775],
      glowStrength: 0.28,
      mid: [0.93, 0.79, 0.7],
    },
  },
] as const

type BackgroundMode = (typeof backgroundModes)[number]['label']
type BackgroundModeConfig = (typeof backgroundModes)[number]

const fontModes = [
  { label: 'inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'geist', stack: 'Geist, Inter, ui-sans-serif, sans-serif' },
  { label: 'open sans', stack: '"Open Sans", Inter, ui-sans-serif, sans-serif' },
  { label: 'rubik', stack: 'Rubik, Inter, ui-sans-serif, sans-serif' },
] as const

type FontMode = (typeof fontModes)[number]['label']

type ShadowCapability = {
  enabled: boolean
  reasons: string[]
}

type BatteryStatus = {
  charging: boolean
  level: number
}

type NavigatorWithEffectHints = Navigator & {
  connection?: {
    effectiveType?: string
    saveData?: boolean
  }
  deviceMemory?: number
  getBattery?: () => Promise<BatteryStatus>
}

const debugFontStylesheet =
  'https://fonts.googleapis.com/css2?family=Inter:wght@250..650&family=Open+Sans:wght@250..650&family=Rubik:wght@250..650&display=optional'

function useDeferredFontStylesheet(isDebug: boolean) {
  useEffect(() => {
    if (!isDebug) return

    const fontStylesheet = debugFontStylesheet
    let timeoutId: number | undefined
    let idleId: number | undefined

    const loadFonts = () => {
      if (document.querySelector(`link[href="${fontStylesheet}"]`)) return

      for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
        const preconnect = document.createElement('link')
        preconnect.rel = 'preconnect'
        preconnect.href = href
        preconnect.crossOrigin = ''
        document.head.append(preconnect)
      }

      const stylesheet = document.createElement('link')
      stylesheet.rel = 'stylesheet'
      stylesheet.href = fontStylesheet
      document.head.append(stylesheet)
    }

    const scheduleFontLoad = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(loadFonts, { timeout: 1200 })
        return
      }

      timeoutId = globalThis.setTimeout(loadFonts, 400)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scheduleFontLoad)
    })

    return () => {
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
    }
  }, [isDebug])
}

function getShadowCapability(battery?: BatteryStatus | null): ShadowCapability {
  const navigatorHints = navigator as NavigatorWithEffectHints
  const reasons: string[] = []
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const saveData = Boolean(navigatorHints.connection?.saveData)
  const effectiveType = navigatorHints.connection?.effectiveType
  const deviceMemory = navigatorHints.deviceMemory
  const hardwareConcurrency = navigator.hardwareConcurrency

  if (reducedMotion) reasons.push('reduced motion')
  if (saveData) reasons.push('data saver')
  if (effectiveType === 'slow-2g' || effectiveType === '2g') reasons.push(effectiveType)
  if (typeof deviceMemory === 'number' && deviceMemory <= 2) reasons.push(`${deviceMemory}gb memory`)
  if (hardwareConcurrency <= 2) reasons.push(`${hardwareConcurrency} cores`)
  if (battery && !battery.charging && battery.level <= 0.2) reasons.push('low battery')

  return {
    enabled: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : ['ok'],
  }
}

function useDebugMode() {
  const [isDebug, setIsDebug] = useState(() => new URLSearchParams(window.location.search).has('debug'))

  useEffect(() => {
    const handlePopState = () => {
      setIsDebug(new URLSearchParams(window.location.search).has('debug'))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return isDebug
}

function useDebugTimeline() {
  const [events, setEvents] = useState<DebugTimelineEvent[]>(() => getDebugTimelineEvents())

  useEffect(() => subscribeDebugTimeline(setEvents), [])

  return events
}

function useShadowCapability() {
  const [battery, setBattery] = useState<BatteryStatus | null>(null)
  const [capability, setCapability] = useState(() => getShadowCapability())

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const refreshCapability = () => setCapability(getShadowCapability(battery))

    motionQuery.addEventListener('change', refreshCapability)
    refreshCapability()

    return () => motionQuery.removeEventListener('change', refreshCapability)
  }, [battery])

  useEffect(() => {
    const navigatorHints = navigator as NavigatorWithEffectHints
    let isCancelled = false

    void navigatorHints.getBattery?.().then((nextBattery) => {
      if (isCancelled) return
      setBattery(nextBattery)
      setCapability(getShadowCapability(nextBattery))
    })

    return () => {
      isCancelled = true
    }
  }, [])

  return capability
}

function getVisualSizeClass(width: number, height: number): VisualSizeClass {
  const aspect = width / Math.max(1, height)

  if (aspect < 0.78) return 'mobilePortrait'
  if (aspect < siteVisualConfig.responsivePresets.mobilePortrait.maxAspect) return 'tabletPortrait'
  if (aspect < 1.65) return 'desktop'
  return 'desktopWide'
}

function getResponsiveVisualConfig(width: number, height: number) {
  const sizeClass = getVisualSizeClass(width, height)
  const appliedPreset: AppliedVisualPreset =
    sizeClass === 'mobilePortrait' || sizeClass === 'tabletPortrait' ? 'mobile' : 'desktop'
  const responsivePreset =
    appliedPreset === 'mobile' ? siteVisualConfig.responsivePresets.mobilePortrait : undefined

  return {
    appliedPreset,
    sizeClass,
    background: siteVisualConfig.background,
    font: siteVisualConfig.font,
    shadowMapMode: siteVisualConfig.shadowMapMode,
    shadowSettings: {
      ...siteVisualConfig.shadowSettings,
      ...(responsivePreset?.shadowSettings ?? {}),
    },
    textureSettings: {
      ...siteVisualConfig.textureSettings,
      ...(responsivePreset?.textureSettings ?? {}),
    },
    typeSettings: {
      ...siteVisualConfig.typeSettings,
      ...(responsivePreset?.typeSettings ?? {}),
    },
  }
}

// The sun crosses the viewport one-directionally like the real thing seen
// from the northern hemisphere: rising at the left edge, arcing overhead,
// setting at the right, then taking a quick transit below the viewport before
// rising again. The cycle math below runs 0 -> 2*PI; the hook mirrors it
// (PI - angle) to get the left-to-right travel. Cosine easing per segment
// brings angular velocity to zero exactly at the horizon crossings, so day and
// night join smoothly and sunrise/sunset linger.
const sunDayDurationSeconds = 170
const sunNightDurationSeconds = 60
const sunCycleDurationSeconds = sunDayDurationSeconds + sunNightDurationSeconds

function sunAngleAtCycleTime(cycleTime: number) {
  if (cycleTime < sunDayDurationSeconds) {
    const dayProgress = cycleTime / sunDayDurationSeconds
    return (0.5 - 0.5 * Math.cos(Math.PI * dayProgress)) * Math.PI
  }

  const nightProgress = (cycleTime - sunDayDurationSeconds) / sunNightDurationSeconds
  return Math.PI + (0.5 - 0.5 * Math.cos(Math.PI * nightProgress)) * Math.PI
}

// Inverse of sunAngleAtCycleTime: the configured base angle anchors where in
// the cycle the animation starts, so page load matches siteVisualConfig and
// the debug slider repositions the sun instead of being ignored.
function cycleTimeAtSunAngle(angle: number) {
  const normalized = ((angle % tau) + tau) % tau

  if (normalized <= Math.PI) {
    const easedProgress = normalized / Math.PI
    return (Math.acos(1 - 2 * easedProgress) / Math.PI) * sunDayDurationSeconds
  }

  const easedProgress = (normalized - Math.PI) / Math.PI
  return sunDayDurationSeconds + (Math.acos(1 - 2 * easedProgress) / Math.PI) * sunNightDurationSeconds
}

// Debug-slider parameterization: one 0..1 fraction scrubs the whole cycle,
// displayed as a clock where the 170s day maps to 06:00-18:00 and the 60s
// night to 18:00-06:00.
function formatTimeOfDay(fraction: number) {
  const cycleTime = fraction * sunCycleDurationSeconds
  const hour =
    cycleTime < sunDayDurationSeconds
      ? 6 + (cycleTime / sunDayDurationSeconds) * 12
      : (18 + ((cycleTime - sunDayDurationSeconds) / sunNightDurationSeconds) * 12) % 24
  const wholeHour = Math.floor(hour)
  const minutes = Math.floor((hour - wholeHour) * 60)
  return `${String(wholeHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function useAnimatedSunAngle(baseSunAngle: number) {
  const [animatedAngle, setAnimatedAngle] = useState(baseSunAngle)
  const publishedAngleRef = useRef(baseSunAngle)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      publishedAngleRef.current = baseSunAngle
      setAnimatedAngle(baseSunAngle)
      return
    }

    let frameId = 0
    const startedAt = performance.now()
    const startCycleTime = cycleTimeAtSunAngle(Math.PI - baseSunAngle)

    const animate = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      const nextAngle =
        Math.PI - sunAngleAtCycleTime((startCycleTime + elapsed) % sunCycleDurationSeconds)

      if (Math.abs(nextAngle - publishedAngleRef.current) > 0.0008) {
        publishedAngleRef.current = nextAngle
        setAnimatedAngle(nextAngle)
      }
      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [baseSunAngle])

  return animatedAngle
}

function useShadowSourcePreview() {
  const [preview, setPreview] = useState<ShadowSourcePreview | null>(() => getShadowSourcePreview())

  useEffect(() => subscribeShadowSourcePreview(setPreview), [])

  return preview
}

function useAfterInteractiveShadowLayer(shouldLoad: boolean) {
  const [ShadowLayer, setShadowLayer] = useState<ShadowLayerComponent | null>(null)

  useEffect(() => {
    setShadowLayer(null)

    if (!shouldLoad) {
      emitDebugTimelineEvent('shadow gated')
      return
    }

    let isCancelled = false

    const loadShadowLayer = () => {
      emitDebugTimelineEvent('chunk requested')

      void import('./V2ShadowLayer').then((module) => {
        if (isCancelled) return
        emitDebugTimelineEvent('chunk loaded')
        setShadowLayer(() => module.default)
      })
    }

    const scheduleLoad = () => {
      emitDebugTimelineEvent('chunk scheduled')
      globalThis.setTimeout(loadShadowLayer, 0)
    }

    scheduleLoad()

    return () => {
      isCancelled = true
    }
  }, [shouldLoad])

  return ShadowLayer
}

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

    // Day-phase grading derived from sun elevation: the configured palette is
    // the midday anchor and low sun pulls the glow toward golden-hour amber.
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

    // Night: darker, cooler moonlit paper. A full moon rides antipodal to the
    // sun -- overhead whenever the sun is below the viewport -- so its silver
    // glow is the sun's directional field mirrored.
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

    // hairline dither only -- keeps the smooth gradient from banding at 8
    // bits. Visible paper grain comes from the CSS surface-texture overlay;
    // adding shader grain on top doubles it.
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

function BackgroundShader({
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

function DebugPanel({
  activeTab,
  background,
  capability,
  currentMode,
  events,
  font,
  isCollapsed,
  onActiveTabChange,
  onBackgroundChange,
  onChange,
  onFontChange,
  onLogPreset,
  onPreviewPick,
  onSettingsChange,
  onSunWidgetChange,
  onTextureSettingsChange,
  onToggleCollapsed,
  onTypeSettingsChange,
  preview,
  settings,
  showPreview,
  sunWidget,
  textureSettings,
  typeSettings,
}: {
  activeTab: DebugPanelTab
  background: BackgroundMode
  capability: ShadowCapability
  currentMode: ShadowMapMode
  events: DebugTimelineEvent[]
  font: FontMode
  isCollapsed: boolean
  onActiveTabChange: (tab: DebugPanelTab) => void
  onBackgroundChange: (background: BackgroundMode) => void
  onChange: (mode: ShadowMapMode) => void
  onFontChange: (font: FontMode) => void
  onLogPreset: () => void
  onPreviewPick: (x: number, y: number) => void
  onSettingsChange: (settings: ShadowSettings) => void
  onSunWidgetChange: (widget: SunWidgetChoice) => void
  onTextureSettingsChange: (settings: TextureSettings) => void
  onToggleCollapsed: () => void
  onTypeSettingsChange: (settings: TypeSettings) => void
  preview: ShadowSourcePreview | null
  settings: ShadowSettings
  showPreview: boolean
  sunWidget: SunWidgetChoice
  textureSettings: TextureSettings
  typeSettings: TypeSettings
}) {
  const finalTime = Math.max(1, events.at(-1)?.time ?? 1)
  const [shadowConfigTab, setShadowConfigTab] = useState<ShadowConfigTab>('scene')
  const [shadowLayerTab, setShadowLayerTab] = useState<ShadowLayerTab>('blinds')
  const timeOfDayFraction =
    cycleTimeAtSunAngle(Math.PI - settings.sunAngle) / sunCycleDurationSeconds

  return (
    <div className={`site-debug-panel debug-panel ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="Debug controls">
      <div className="debug-panel-header">
        <span>debug</span>
        <button aria-expanded={!isCollapsed} aria-label="Toggle debug controls" onClick={onToggleCollapsed} type="button">
          {isCollapsed ? '+' : '-'}
        </button>
      </div>
      {isCollapsed ? null : (
        <>
      <div className="debug-panel-tabs" aria-label="Debug panel sections">
        {(['shadow', 'type', 'logs'] as const).map((tab) => (
          <button aria-pressed={activeTab === tab} key={tab} onClick={() => onActiveTabChange(tab)} type="button">
            {tab}
          </button>
        ))}
      </div>
      <div className="debug-panel-actions">
        <button onClick={onLogPreset} type="button">
          log preset
        </button>
      </div>
      {activeTab === 'shadow' ? (
        <>
      <div className="shadow-effect-status">
        <span>{capability.enabled ? 'shadow on' : 'shadow off'}</span>
        <span>{capability.reasons.join(', ')}</span>
      </div>
      <div className="shadow-effect-status">
        <span>caster map</span>
        <span>{preview ? `${preview.width}×${preview.height}` : 'waiting'}</span>
      </div>
      <div className="shadow-map-buttons">
        {shadowMapModes.map((mode) => (
          <button aria-pressed={currentMode === mode} key={mode} onClick={() => onChange(mode)} type="button">
            {mode}
          </button>
        ))}
      </div>
      <div className="shadow-map-buttons" aria-label="Canopy style">
        {canopyStyles.map((style) => (
          <button
            aria-pressed={settings.canopyStyle === style}
            key={style}
            onClick={() => onSettingsChange({ ...settings, canopyStyle: style })}
            type="button"
          >
            {style}
          </button>
        ))}
      </div>
      <div className="shadow-map-buttons shadow-background-buttons" aria-label="Background color">
        {backgroundModes.map((mode) => (
          <button
            aria-pressed={background === mode.label}
            key={mode.label}
            onClick={() => onBackgroundChange(mode.label)}
            style={{ ['--swatch-color' as string]: mode.color }}
            type="button"
          >
            <span className="shadow-background-swatch" />
            {mode.label}
          </button>
        ))}
      </div>
      <div className="shadow-map-buttons shadow-widget-buttons" aria-label="Sun widget">
        {sunWidgetChoices.map((choice) => (
          <button aria-pressed={sunWidget === choice} key={choice} onClick={() => onSunWidgetChange(choice)} type="button">
            {choice}
          </button>
        ))}
      </div>
      <div className="shadow-map-buttons shadow-config-tabs" aria-label="Shadow config sections">
        {(['scene', 'layers'] as const).map((tab) => (
          <button aria-pressed={shadowConfigTab === tab} key={tab} onClick={() => setShadowConfigTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </div>
      {shadowConfigTab === 'scene' ? (
        <>
      <div className="shadow-animation-controls">
        <label>
          <span>texture opacity</span>
          <span>{textureSettings.opacity.toFixed(2)}</span>
          <input
            max="0.8"
            min="0"
            onChange={(event) => onTextureSettingsChange({ ...textureSettings, opacity: Number(event.currentTarget.value) })}
            step="0.01"
            type="range"
            value={textureSettings.opacity}
          />
        </label>
        <label>
          <span>texture scale</span>
          <span>{Math.round(textureSettings.scale)}</span>
          <input
            max="900"
            min="24"
            onChange={(event) => onTextureSettingsChange({ ...textureSettings, scale: Number(event.currentTarget.value) })}
            step="4"
            type="range"
            value={textureSettings.scale}
          />
        </label>
      </div>
      <div className="shadow-animation-controls">
        <label>
          <span>depth mix</span>
          <span>{settings.depthMix.toFixed(2)}</span>
          <input
            max="1"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, depthMix: Number(event.currentTarget.value) })}
            step="0.01"
            type="range"
            value={settings.depthMix}
          />
        </label>
        <label>
          <span>layer spread</span>
          <span>{settings.layerSpread.toFixed(2)}</span>
          <input
            max="2.5"
            min="0.25"
            onChange={(event) => onSettingsChange({ ...settings, layerSpread: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.layerSpread}
          />
        </label>
        <label>
          <span>speed</span>
          <span>{settings.speed.toFixed(2)}</span>
          <input
            max="4"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, speed: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.speed}
          />
        </label>
        <label>
          <span>time of day</span>
          <span>{formatTimeOfDay(timeOfDayFraction)}</span>
          <input
            max="1"
            min="0"
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                sunAngle:
                  Math.PI - sunAngleAtCycleTime(Number(event.currentTarget.value) * sunCycleDurationSeconds),
              })
            }
            step="0.002"
            type="range"
            value={timeOfDayFraction}
          />
        </label>
        <label>
          <span>wind</span>
          <span>{settings.wind.toFixed(2)}</span>
          <input
            max="6"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, wind: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.wind}
          />
        </label>
        <label>
          <span>crispness</span>
          <span>{settings.crispness.toFixed(2)}</span>
          <input
            max="3"
            min="0.45"
            onChange={(event) => onSettingsChange({ ...settings, crispness: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.crispness}
          />
        </label>
        <label>
          <span>opacity</span>
          <span>{settings.opacity.toFixed(2)}</span>
          <input
            max="0.7"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, opacity: Number(event.currentTarget.value) })}
            step="0.01"
            type="range"
            value={settings.opacity}
          />
        </label>
        <label>
          <span>light glow</span>
          <span>{settings.lightGlow.toFixed(2)}</span>
          <input
            max="1.5"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, lightGlow: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.lightGlow}
          />
        </label>
        <label>
          <span>contrast</span>
          <span>{settings.contrast.toFixed(2)}</span>
          <input
            max="2.5"
            min="0.3"
            onChange={(event) => onSettingsChange({ ...settings, contrast: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.contrast}
          />
        </label>
        <label>
          <span>source scale</span>
          <span>{settings.scale.toFixed(2)}</span>
          <input
            max="1.8"
            min="0.45"
            onChange={(event) => onSettingsChange({ ...settings, scale: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.scale}
          />
        </label>
        <label>
          <span>source density</span>
          <span>{settings.density.toFixed(2)}</span>
          <input
            max="1.8"
            min="0.35"
            onChange={(event) => onSettingsChange({ ...settings, density: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.density}
          />
        </label>
        <label>
          <span>samples</span>
          <span>{Math.round(settings.sampleCount)}</span>
          <input
            max="100"
            min="24"
            onChange={(event) => onSettingsChange({ ...settings, sampleCount: Number(event.currentTarget.value) })}
            step="4"
            type="range"
            value={settings.sampleCount}
          />
        </label>
        <label>
          <span>resolution</span>
          <span>{settings.resolution.toFixed(2)}</span>
          <input
            max="1.25"
            min="0.35"
            onChange={(event) => onSettingsChange({ ...settings, resolution: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.resolution}
          />
        </label>
      </div>
        </>
      ) : null}
      {shadowConfigTab === 'layers' ? (
        <>
          <div className="shadow-map-buttons shadow-layer-tabs" aria-label="Shadow layers">
            {(['blinds', 'canopy'] as const).map((layer) => (
              <button aria-pressed={shadowLayerTab === layer} key={layer} onClick={() => setShadowLayerTab(layer)} type="button">
                {layer}
              </button>
            ))}
          </div>
          <div className="shadow-animation-controls">
            {shadowLayerTab === 'blinds' ? (
              <label>
                <span>strength</span>
                <span>{settings.blindStrength.toFixed(2)}</span>
                <input
                  max="1.5"
                  min="0"
                  onChange={(event) => onSettingsChange({ ...settings, blindStrength: Number(event.currentTarget.value) })}
                  step="0.01"
                  type="range"
                  value={settings.blindStrength}
                />
              </label>
            ) : null}
            {shadowLayerTab === 'canopy' ? (
              <label>
                <span>strength</span>
                <span>{settings.canopyStrength.toFixed(2)}</span>
                <input
                  max="1.5"
                  min="0"
                  onChange={(event) => onSettingsChange({ ...settings, canopyStrength: Number(event.currentTarget.value) })}
                  step="0.01"
                  type="range"
                  value={settings.canopyStrength}
                />
              </label>
            ) : null}
          </div>
        </>
      ) : null}
      {showPreview ? (
        <div className="shadow-source-preview" aria-label="Shadow source preview">
          <div>
            <span>source</span>
            <span>
              {preview ? `${preview.mode} ${preview.width}x${preview.height}` : 'waiting'}
            </span>
          </div>
          {preview?.dataUrl ? (
            <button
              aria-label="Move shadow sampler"
              className="shadow-source-frame"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const x = ((event.clientX - rect.left) / rect.width) * preview.width
                const y = ((event.clientY - rect.top) / rect.height) * preview.height

                onPreviewPick(x, y)
              }}
              style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
              type="button"
            >
              <img alt="" src={preview.dataUrl} />
              {preview.sampler ? (
                <>
                  <span
                    className="shadow-sampler-probe"
                    style={{
                      left: `${(preview.sampler.sampleX / preview.width) * 100}%`,
                      top: `${(preview.sampler.sampleY / preview.height) * 100}%`,
                    }}
                  />
                  {preview.sampler.points.map((point, index) => {
                    const sampleSize = point.hitCaster
                      ? `${Math.max(0.55, (point.casterSize / preview.width) * 100)}%`
                      : '0.35rem'

                    return (
                      <span
                        className={[
                          'shadow-sampler-point',
                          point.hitCaster ? 'is-hit' : '',
                          point.contributes ? 'is-contributing' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        key={`${point.x}-${point.y}-${index}`}
                        style={{
                          height: sampleSize,
                          left: `${(point.x / preview.width) * 100}%`,
                          top: `${(point.y / preview.height) * 100}%`,
                          width: sampleSize,
                        }}
                      />
                    )
                  })}
                </>
              ) : null}
            </button>
          ) : (
            <div className="shadow-source-empty" />
          )}
          {preview?.sampler ? (
            <div className="shadow-sampler-readout">
              <span>probe</span>
              <span>
                {preview.sampler.contributingSamples}/{preview.sampler.points.length} samples ·{' '}
                {preview.sampler.shadowFactor.toFixed(2)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}
      {activeTab === 'type' ? (
        <>
          <div className="shadow-map-buttons shadow-font-buttons" aria-label="Text font">
            {fontModes.map((mode) => (
              <button
                aria-pressed={font === mode.label}
                key={mode.label}
                onClick={() => onFontChange(mode.label)}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="shadow-animation-controls">
            <label>
              <span>type size</span>
              <span>{typeSettings.size.toFixed(2)}</span>
              <input
                max="1.3"
                min="0.75"
                onChange={(event) => onTypeSettingsChange({ ...typeSettings, size: Number(event.currentTarget.value) })}
                step="0.01"
                type="range"
                value={typeSettings.size}
              />
            </label>
            <label>
              <span>type weight</span>
              <span>{Math.round(typeSettings.weight)}</span>
              <input
                max="650"
                min="250"
                onChange={(event) => onTypeSettingsChange({ ...typeSettings, weight: Number(event.currentTarget.value) })}
                step="25"
                type="range"
                value={typeSettings.weight}
              />
            </label>
            <label>
              <span>kerning</span>
              <span>{typeSettings.tracking.toFixed(3)}</span>
              <input
                max="0.08"
                min="-0.04"
                onChange={(event) => onTypeSettingsChange({ ...typeSettings, tracking: Number(event.currentTarget.value) })}
                step="0.005"
                type="range"
                value={typeSettings.tracking}
              />
            </label>
            <label>
              <span>line size</span>
              <span>{typeSettings.lineHeight.toFixed(2)}</span>
              <input
                max="2"
                min="1.1"
                onChange={(event) => onTypeSettingsChange({ ...typeSettings, lineHeight: Number(event.currentTarget.value) })}
                step="0.05"
                type="range"
                value={typeSettings.lineHeight}
              />
            </label>
            <label>
              <span>line width</span>
              <span>{typeSettings.width.toFixed(1)}</span>
              <input
                max="44"
                min="20"
                onChange={(event) => onTypeSettingsChange({ ...typeSettings, width: Number(event.currentTarget.value) })}
                step="0.5"
                type="range"
                value={typeSettings.width}
              />
            </label>
          </div>
        </>
      ) : null}
      {activeTab === 'logs' ? (
      <div className="shadow-timeline" aria-label="Shadow timeline">
        {events.map((event) => (
          <div className="shadow-timeline-event" key={`${event.label}-${event.time}`}>
            <span className="shadow-timeline-marker" style={{ left: `${(event.time / finalTime) * 100}%` }} />
            <span>{event.label}</span>
            <span>{Math.round(event.time)}ms</span>
          </div>
        ))}
      </div>
      ) : null}
        </>
      )}
    </div>
  )
}

function App() {
  const isDebug = useDebugMode()
  const isSunIconLab = window.location.pathname.startsWith('/sun-icon')
  // /source: full-screen debug view of the raw caster map the shadow shader
  // samples -- the "2D art" -- live with wind animation, panel kept on top
  const isSourceView = window.location.pathname.startsWith('/source')
  useDeferredFontStylesheet(isDebug)
  const [responsiveVisualConfig, setResponsiveVisualConfig] = useState(() =>
    getResponsiveVisualConfig(window.innerWidth, window.innerHeight),
  )
  const activeResponsivePresetRef = useRef<AppliedVisualPreset>(responsiveVisualConfig.appliedPreset)
  const [background, setBackground] = useState<BackgroundMode>(responsiveVisualConfig.background)
  const [font, setFont] = useState<FontMode>(responsiveVisualConfig.font)
  const timelineEvents = useDebugTimeline()
  const shadowCapability = useShadowCapability()
  const ShadowLayer = useAfterInteractiveShadowLayer(shadowCapability.enabled && !isSunIconLab)
  const [shadowSettings, setShadowSettings] = useState<ShadowSettings>({
    ...responsiveVisualConfig.shadowSettings,
  })
  const [shadowMapMode, setShadowMapMode] = useState<ShadowMapMode>(responsiveVisualConfig.shadowMapMode)
  const [isDebugPanelCollapsed, setIsDebugPanelCollapsed] = useState(false)
  const shadowSourcePreview = useShadowSourcePreview()
  const [showShadowSource, setShowShadowSource] = useState(false)
  const [sunWidget, setSunWidget] = useState<SunWidgetChoice>('gnomon')
  const [debugPanelTab, setDebugPanelTab] = useState<DebugPanelTab>('shadow')
  const [typeSettings, setTypeSettings] = useState<TypeSettings>({
    ...responsiveVisualConfig.typeSettings,
  })
  const [textureSettings, setTextureSettings] = useState<TextureSettings>({
    ...responsiveVisualConfig.textureSettings,
  })
  const backgroundMode = backgroundModes.find((mode) => mode.label === background) ?? backgroundModes[0]
  const fontMode = fontModes.find((mode) => mode.label === font) ?? fontModes[0]
  const effectiveSunAngle = useAnimatedSunAngle(shadowSettings.sunAngle)
  // Everything below derives from the one animated sun angle. Cast shadows
  // are sun-only: intensity fades to zero at the horizons and the page rests
  // shadow-free under moonlight. Shadow color mirrors the background's day
  // phases (near-black midday, warm sepia toward golden hour), and edges are
  // hardest at noon, softening as the sun drops and light crosses more
  // atmosphere. The crispness multiplier bypasses the settings object so it
  // cannot trigger the layers' texture-regenerating memos.
  const shadowFactor = getShadowFactor(effectiveSunAngle)
  const sunElevation = Math.sin(effectiveSunAngle)
  const daylight = smoothstep(-0.12, 0.22, sunElevation)
  const goldenHour =
    smoothstep(-0.08, 0.04, sunElevation) * (1 - smoothstep(0.18, 0.55, sunElevation))
  const shadowTint = mixVec3(
    [0.1, 0.14, 0.26],
    mixVec3([0.05, 0.05, 0.06], [0.26, 0.14, 0.05], goldenHour),
    daylight,
  )
  const shadowCrispnessScale = 0.45 + 0.55 * smoothstep(0.05, 0.6, sunElevation)

  useEffect(() => {
    document.documentElement.style.background = backgroundMode.color
    document.body.style.background = backgroundMode.color

    return () => {
      document.documentElement.style.background = ''
      document.body.style.background = ''
    }
  }, [backgroundMode.color])

  useEffect(() => {
    emitDebugTimelineEvent('app mounted')
  }, [])

  useEffect(() => {
    let frameId = 0

    const updateResponsiveConfig = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        setResponsiveVisualConfig(getResponsiveVisualConfig(window.innerWidth, window.innerHeight))
      })
    }

    window.addEventListener('resize', updateResponsiveConfig)
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateResponsiveConfig)
    }
  }, [])

  useEffect(() => {
    if (activeResponsivePresetRef.current === responsiveVisualConfig.appliedPreset) return

    activeResponsivePresetRef.current = responsiveVisualConfig.appliedPreset
    setBackground(responsiveVisualConfig.background)
    setFont(responsiveVisualConfig.font)
    setShadowMapMode(responsiveVisualConfig.shadowMapMode)
    setShadowSettings({ ...responsiveVisualConfig.shadowSettings })
    setTextureSettings({ ...responsiveVisualConfig.textureSettings })
    setTypeSettings({ ...responsiveVisualConfig.typeSettings })
    emitDebugTimelineEvent(
      'responsive preset',
      `${responsiveVisualConfig.sizeClass} -> ${responsiveVisualConfig.appliedPreset}`,
    )
  }, [responsiveVisualConfig])

  useEffect(() => {
    emitDebugTimelineEvent(shadowCapability.enabled ? 'capability ok' : 'capability blocked', shadowCapability.reasons.join(', '))
  }, [shadowCapability.enabled, shadowCapability.reasons])

  useEffect(() => {
    emitDebugTimelineEvent('mode selected', shadowMapMode)
  }, [shadowMapMode])

  useEffect(() => {
    emitDebugTimelineEvent(
      'shadow tuned',
      `${shadowSettings.speed.toFixed(2)} / ${shadowSettings.wind.toFixed(2)} / ${shadowSettings.crispness.toFixed(2)} / ${shadowSettings.opacity.toFixed(2)}`,
    )
  }, [shadowSettings.crispness, shadowSettings.opacity, shadowSettings.speed, shadowSettings.wind])

  useEffect(() => {
    if (!isDebug) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 's') return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.shiftKey) {
        setShowShadowSource((isVisible) => !isVisible)
        emitDebugTimelineEvent('source preview toggled')
        return
      }

      setShadowMapMode((currentMode) => {
        const currentIndex = shadowMapModes.indexOf(currentMode)
        return shadowMapModes[(currentIndex + 1) % shadowMapModes.length]
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDebug])

  const logCurrentPreset = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    const aspect = width / Math.max(1, height)
    const responsivePreset = getResponsiveVisualConfig(width, height)
    const preset = {
      appliedPreset: responsivePreset.appliedPreset,
      suggestedPreset: responsivePreset.sizeClass,
      viewport: {
        aspect: Number(aspect.toFixed(3)),
        devicePixelRatio: window.devicePixelRatio,
        height,
        width,
      },
      background,
      font,
      shadowMapMode,
      sunWidget,
      effectiveSunAngle: Number(effectiveSunAngle.toFixed(4)),
      shadowSettings,
      textureSettings,
      typeSettings,
    }

    console.info('[beneverman preset]', preset)
    console.info(`[beneverman preset:${responsivePreset.sizeClass}] ${JSON.stringify(preset, null, 2)}`)
    emitDebugTimelineEvent('preset logged', responsivePreset.sizeClass)
  }

  if (isSunIconLab) {
    return <SunIconLab />
  }

  return (
    <main
      className="site-shell"
      style={{
        ['--intro-font-family' as string]: fontMode.stack,
        ['--intro-font-size' as string]: `${typeSettings.size}rem`,
        ['--intro-font-weight' as string]: typeSettings.weight,
        ['--intro-letter-spacing' as string]: `${typeSettings.tracking}em`,
        ['--intro-line-height' as string]: typeSettings.lineHeight,
        ['--intro-max-width' as string]: `${typeSettings.width}rem`,
        ['--texture-opacity' as string]: textureSettings.opacity,
        ['--texture-scale' as string]: `${textureSettings.scale}px`,
        backgroundColor: backgroundMode.color,
      }}
    >
      <div className="visual-scene-layer" aria-hidden="true">
        <BackgroundShader mode={backgroundMode} sunAngle={effectiveSunAngle} />
        {shadowCapability.enabled && ShadowLayer ? (
          <ShadowLayer
            crispnessScale={shadowCrispnessScale}
            mode={shadowMapMode}
            opacityScale={shadowFactor}
            settings={shadowSettings}
            shadowTint={shadowTint}
            showSource={isSourceView}
            sunAngle={effectiveSunAngle}
          />
        ) : null}
      </div>
      {sunWidget === 'none' || isSourceView ? null : (
        <div className="sun-angle-widget" aria-hidden="true">
          <SunWidget angle={effectiveSunAngle} variant={sunWidget} />
          <span className="sun-widget-clock">
            {formatTimeOfDay(cycleTimeAtSunAngle(Math.PI - effectiveSunAngle) / sunCycleDurationSeconds)}
          </span>
        </div>
      )}
      {isSourceView ? null : (
      <section className="intro" aria-label="About Ben Everman">
        <p className="name">Ben Everman</p>
        <p>
          I'm currently working as a software engineer at Tekmir, where we're building an end-to-end
          platform for mass-action litigation.
        </p>
        <p>
          In my free time, I like to work on technical projects like LLM inference optimization, model
          interpretability, shaders, AI tooling, and the like.
        </p>
        <p>
          On any given day, you can probably find me working at one of my favorite coffee shops in Atlanta.
        </p>
        <p>
          Most of my experiments are colocated under{' '}
          <a href="https://www.bencorp.dev/" rel="noreferrer" target="_blank">
            BENCORP
          </a>,
          {' '}my fake company; source code is on my{' '}
          <a href="https://www.github.com/beverm2391" rel="noreferrer" target="_blank">
            GitHub
          </a>;
          {' '}feel free to reach out to me on{' '}
          <a href="https://www.x.com/beneverman" rel="noreferrer" target="_blank">
            X
          </a>.
        </p>
      </section>
      )}
      {isSourceView ? null : (
      <footer className="inspiration-footer">
        shaders inspired by{' '}
        <a href="https://basement.studio/" rel="noreferrer" target="_blank">
          Basement Studio
        </a>{' '}
        and{' '}
        <a href="https://farayan.me/" rel="noreferrer" target="_blank">
          Fara Yan
        </a>
      </footer>
      )}
      {isDebug ? (
        <DebugPanel
          activeTab={debugPanelTab}
          capability={shadowCapability}
          background={background}
          currentMode={shadowMapMode}
          events={timelineEvents}
          font={font}
          isCollapsed={isDebugPanelCollapsed}
          onActiveTabChange={setDebugPanelTab}
          onBackgroundChange={setBackground}
          onChange={setShadowMapMode}
          onFontChange={setFont}
          onLogPreset={logCurrentPreset}
          onPreviewPick={(samplerX, samplerY) => {
            if (!shadowSourcePreview) return
            setShadowSettings((current) => ({
              ...current,
              samplerX: samplerX / shadowSourcePreview.width,
              samplerY: samplerY / shadowSourcePreview.height,
            }))
          }}
          onSettingsChange={setShadowSettings}
          onSunWidgetChange={setSunWidget}
          onTextureSettingsChange={setTextureSettings}
          onToggleCollapsed={() => setIsDebugPanelCollapsed((isCollapsed) => !isCollapsed)}
          onTypeSettingsChange={setTypeSettings}
          preview={shadowSourcePreview}
          settings={shadowSettings}
          showPreview={showShadowSource}
          sunWidget={sunWidget}
          textureSettings={textureSettings}
          typeSettings={typeSettings}
        />
      ) : null}
      {isSourceView ? null : <div className="surface-texture" aria-hidden="true" />}
    </main>
  )
}

export default App
