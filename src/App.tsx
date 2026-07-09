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
import { HomeIntro } from './HomeIntro'
import { backgroundModes, type BackgroundMode } from './HomeSunGradientConfig'
import { HomeSunGradientLayer } from './HomeSunGradientLayer'
import { getHomeIntroStyle } from './homeVisualConfig'
import { siteVisualConfig } from './siteVisualConfig'
import { activeSiteConfig } from './siteScene'
import { SunIconLab } from './SunIconLab'
import { getShadowFactor, SunWidget, sunWidgetVariants, type SunWidgetVariant } from './SunWidget'
import { cycleTimeAtSunAngle, formatTimeOfDay, sunAngleAtCycleTime, sunCycleDurationSeconds } from './sunClock'

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
  // visible shafts of light raymarched through the caster map toward the sun
  lightRays: number
  opacity: number
  // lateral scatter of the ray march: 0 = crisp beams, 1 = wide soft bloom
  rayDiffusion: number
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
    // Base visuals come from the promoted lab scene (siteScene), if any;
    // font/texture/type and the mobile responsive preset stay site-owned.
    background: activeSiteConfig.background,
    font: siteVisualConfig.font,
    shadowMapMode: activeSiteConfig.shadowMapMode,
    shadowSettings: {
      ...activeSiteConfig.shadowSettings,
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
// rising again. The cycle math (see ./sunClock) runs 0 -> 2*PI; this hook
// mirrors it (PI - angle) to get the left-to-right travel.

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
          <span>light rays</span>
          <span>{settings.lightRays.toFixed(2)}</span>
          <input
            max="4"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, lightRays: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.lightRays}
          />
        </label>
        <label>
          <span>ray diffusion</span>
          <span>{settings.rayDiffusion.toFixed(2)}</span>
          <input
            max="1"
            min="0"
            onChange={(event) => onSettingsChange({ ...settings, rayDiffusion: Number(event.currentTarget.value) })}
            step="0.05"
            type="range"
            value={settings.rayDiffusion}
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
  if (
    __VERCEL_PRODUCTION_DEPLOY__ &&
    (window.location.pathname !== '/' || window.location.search || window.location.hash)
  ) {
    window.history.replaceState(null, '', '/')
  }

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
  const [shadowSettings, setShadowSettings] = useState<ShadowSettings>({
    ...responsiveVisualConfig.shadowSettings,
  })
  const [shadowMapMode, setShadowMapMode] = useState<ShadowMapMode>(responsiveVisualConfig.shadowMapMode)
  const shouldRenderShadowLayer = shadowMapMode !== 'sun'
  const ShadowLayer = useAfterInteractiveShadowLayer(
    shadowCapability.enabled && !isSunIconLab && shouldRenderShadowLayer,
  )
  const [isDebugPanelCollapsed, setIsDebugPanelCollapsed] = useState(false)
  const shadowSourcePreview = useShadowSourcePreview()
  const [showShadowSource, setShowShadowSource] = useState(false)
  const [sunWidget, setSunWidget] = useState<SunWidgetChoice>(
    activeSiteConfig.showSunWidget ? activeSiteConfig.sunWidget : 'none',
  )
  const [debugPanelTab, setDebugPanelTab] = useState<DebugPanelTab>('shadow')
  const [typeSettings, setTypeSettings] = useState<TypeSettings>({
    ...responsiveVisualConfig.typeSettings,
  })
  const [textureSettings, setTextureSettings] = useState<TextureSettings>({
    ...responsiveVisualConfig.textureSettings,
  })
  const backgroundMode = backgroundModes.find((mode) => mode.label === background) ?? backgroundModes[0]
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

  const homeIntroStyle = getHomeIntroStyle({ font, typeSettings })

  return (
    <main
      className="site-shell"
      style={{
        ...homeIntroStyle,
        ['--texture-opacity' as string]: textureSettings.opacity,
        ['--texture-scale' as string]: `${textureSettings.scale}px`,
        backgroundColor: backgroundMode.color,
      }}
    >
      <div className="visual-scene-layer" aria-hidden="true">
        <HomeSunGradientLayer mode={backgroundMode} sunAngle={effectiveSunAngle} />
        {shadowCapability.enabled && shouldRenderShadowLayer && ShadowLayer ? (
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
      {isSourceView ? null : <HomeIntro />}
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
