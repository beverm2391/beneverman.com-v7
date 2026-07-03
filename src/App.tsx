import { type ComponentType, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  emitDebugTimelineEvent,
  getDebugTimelineEvents,
  subscribeDebugTimeline,
  type DebugTimelineEvent,
} from './debugTimeline'
import { shadowMapModes, type ShadowMapMode } from './shadowMapModes'
import {
  getShadowSourcePreview,
  subscribeShadowSourcePreview,
  type ShadowSourcePreview,
} from './shadowSourcePreview'
import { siteVisualConfig } from './siteVisualConfig'

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

type DaylightShadowLayerComponent = ComponentType<{
  mode: ShadowMapMode
  settings: ShadowSettings
}>

type ShadowVersion = 'v1' | 'v2'
type DebugPanelTab = 'shadow' | 'type' | 'logs'
type ShadowConfigTab = 'scene' | 'layers'
type ShadowLayerTab = 'blinds' | 'canopy'

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

function useShadowSourcePreview() {
  const [preview, setPreview] = useState<ShadowSourcePreview | null>(() => getShadowSourcePreview())

  useEffect(() => subscribeShadowSourcePreview(setPreview), [])

  return preview
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

function getCurrentVersion(): ShadowVersion {
  return window.location.pathname.startsWith('/v2') ? 'v2' : 'v1'
}

function useCurrentVersion() {
  const [version, setVersion] = useState<ShadowVersion>(() => getCurrentVersion())

  useEffect(() => {
    const handlePopState = () => setVersion(getCurrentVersion())

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return version
}

function useAfterInteractiveShadowLayer(shouldLoad: boolean, version: ShadowVersion) {
  const [ShadowLayer, setShadowLayer] = useState<DaylightShadowLayerComponent | null>(null)

  useEffect(() => {
    setShadowLayer(null)

    if (!shouldLoad) {
      emitDebugTimelineEvent('shadow gated')
      return
    }

    let isCancelled = false

    const loadShadowLayer = () => {
      emitDebugTimelineEvent('chunk requested', version)
      const layerModule =
        version === 'v2' ? import('./V2ShadowLayer') : import('./DaylightShadowLayer')

      void layerModule.then((module) => {
        if (isCancelled) return
        emitDebugTimelineEvent('chunk loaded', version)
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
  }, [shouldLoad, version])

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
    float sunMix = smoothstep(-0.46, 0.56, directionalLight + (broadNoise - 0.5) * 0.16);
    float sunGlow = smoothstep(0.28, 1.0, directionalLight + (paperNoise - 0.5) * 0.08);

    vec3 paperSide = mix(uBase, vec3(0.985, 0.965, 0.925), 0.46);
    vec3 sunSide = mix(uGlow, vec3(1.0, 0.82, 0.5), 0.24);
    vec3 color = mix(paperSide, sunSide, sunMix);
    color = mix(color, uGlow, sunGlow * uGlowStrength);
    color = mix(color, uCool, (1.0 - sunMix) * smoothstep(0.36, 0.86, broadNoise) * 0.12);

    color += (paperNoise - 0.5) * 0.035;
    color += (broadNoise - 0.5) * 0.025;

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

function BackgroundShader({ mode, sunAngle }: { mode: BackgroundModeConfig; sunAngle: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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
      gl.uniform1f(sunAngleLocation, sunAngle)
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
  }, [mode, sunAngle])

  return <canvas aria-hidden="true" className="background-shader-layer" ref={canvasRef} />
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
  onPreviewPick,
  onSettingsChange,
  onTextureSettingsChange,
  onToggleCollapsed,
  onTypeSettingsChange,
  preview,
  settings,
  showPreview,
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
  onPreviewPick: (x: number, y: number) => void
  onSettingsChange: (settings: ShadowSettings) => void
  onTextureSettingsChange: (settings: TextureSettings) => void
  onToggleCollapsed: () => void
  onTypeSettingsChange: (settings: TypeSettings) => void
  preview: ShadowSourcePreview | null
  settings: ShadowSettings
  showPreview: boolean
  textureSettings: TextureSettings
  typeSettings: TypeSettings
}) {
  const finalTime = Math.max(1, events.at(-1)?.time ?? 1)
  const [shadowConfigTab, setShadowConfigTab] = useState<ShadowConfigTab>('scene')
  const [shadowLayerTab, setShadowLayerTab] = useState<ShadowLayerTab>('blinds')

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
      {activeTab === 'shadow' ? (
        <>
      <div className="shadow-effect-status">
        <span>{capability.enabled ? 'shadow on' : 'shadow off'}</span>
        <span>{capability.reasons.join(', ')}</span>
      </div>
      <div className="shadow-map-buttons">
        {shadowMapModes.map((mode) => (
          <button aria-pressed={currentMode === mode} key={mode} onClick={() => onChange(mode)} type="button">
            {mode}
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
          <span>sun angle</span>
          <span>{settings.sunAngle.toFixed(2)}</span>
          <input
            max="3.14"
            min="-3.14"
            onChange={(event) => onSettingsChange({ ...settings, sunAngle: Number(event.currentTarget.value) })}
            step="0.02"
            type="range"
            value={settings.sunAngle}
          />
        </label>
        <label>
          <span>strength</span>
          <span>{settings.strength.toFixed(2)}</span>
          <input
            max="6"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, strength: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.strength}
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
  const version = useCurrentVersion()
  useDeferredFontStylesheet(isDebug)
  const [background, setBackground] = useState<BackgroundMode>(siteVisualConfig.background)
  const [font, setFont] = useState<FontMode>(siteVisualConfig.font)
  const shadowSourcePreview = useShadowSourcePreview()
  const timelineEvents = useDebugTimeline()
  const shadowCapability = useShadowCapability()
  const ShadowLayer = useAfterInteractiveShadowLayer(shadowCapability.enabled, version)
  const [shadowSettings, setShadowSettings] = useState<ShadowSettings>({
    ...siteVisualConfig.shadowSettings,
  })
  const [showShadowSource, setShowShadowSource] = useState(false)
  const [shadowMapMode, setShadowMapMode] = useState<ShadowMapMode>(siteVisualConfig.shadowMapMode)
  const [isDebugPanelCollapsed, setIsDebugPanelCollapsed] = useState(false)
  const [debugPanelTab, setDebugPanelTab] = useState<DebugPanelTab>('shadow')
  const [typeSettings, setTypeSettings] = useState<TypeSettings>({
    ...siteVisualConfig.typeSettings,
  })
  const [textureSettings, setTextureSettings] = useState<TextureSettings>({
    ...siteVisualConfig.textureSettings,
  })
  const backgroundMode = backgroundModes.find((mode) => mode.label === background) ?? backgroundModes[0]
  const fontMode = fontModes.find((mode) => mode.label === font) ?? fontModes[0]

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
    emitDebugTimelineEvent(shadowCapability.enabled ? 'capability ok' : 'capability blocked', shadowCapability.reasons.join(', '))
  }, [shadowCapability.enabled, shadowCapability.reasons])

  useEffect(() => {
    emitDebugTimelineEvent('mode selected', shadowMapMode)
  }, [shadowMapMode])

  useEffect(() => {
    emitDebugTimelineEvent(
      'shadow tuned',
      `${shadowSettings.speed.toFixed(2)} / ${shadowSettings.strength.toFixed(2)} / ${shadowSettings.crispness.toFixed(2)} / ${shadowSettings.opacity.toFixed(2)}`,
    )
  }, [shadowSettings.crispness, shadowSettings.opacity, shadowSettings.speed, shadowSettings.strength])

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
      <BackgroundShader mode={backgroundMode} sunAngle={shadowSettings.sunAngle} />
      {shadowCapability.enabled && ShadowLayer ? (
        <ShadowLayer mode={shadowMapMode} settings={shadowSettings} />
      ) : null}
      <section className="intro" aria-label="About Ben Everman">
        <p className="name">Ben Everman</p>
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
          onPreviewPick={(samplerX, samplerY) => {
            if (!shadowSourcePreview) return
            setShadowSettings((currentSettings) => ({
              ...currentSettings,
              samplerX: samplerX / shadowSourcePreview.width,
              samplerY: samplerY / shadowSourcePreview.height,
            }))
            emitDebugTimelineEvent('sampler moved')
          }}
          onSettingsChange={setShadowSettings}
          onTextureSettingsChange={setTextureSettings}
          onToggleCollapsed={() => setIsDebugPanelCollapsed((isCollapsed) => !isCollapsed)}
          onTypeSettingsChange={setTypeSettings}
          preview={shadowSourcePreview}
          settings={shadowSettings}
          showPreview={showShadowSource}
          textureSettings={textureSettings}
          typeSettings={typeSettings}
        />
      ) : null}
      <div className="surface-texture" aria-hidden="true" />
    </main>
  )
}

export default App
