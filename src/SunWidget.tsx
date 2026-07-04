import './SunWidget.css'

// Small sun-position widgets shared by the homepage (top-left corner) and the
// /sun-icon design lab. Every widget shares a 48x32 viewBox and the background
// shader's angle convention: 0 = sun on the right horizon, PI/2 = overhead,
// PI = left horizon. Angles in (PI, 2*PI) are night: geometry clamps to the
// horizon and the sun-driven marks fade out via getSunFactor.
export const sunWidgetVariants = ['gnomon', 'arc', 'gauge', 'wedge'] as const

export type SunWidgetVariant = (typeof sunWidgetVariants)[number]

const tau = Math.PI * 2

type WidgetProps = { angle: number; moonAngle: number; moonFactor: number; sunFactor: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// 1 above ~3.5 degrees of elevation, 0 a few degrees below the horizon, with a
// smooth crossfade between. Drives the visibility of the sun/moon dots.
export function getSunFactor(angle: number) {
  const normalized = ((angle % tau) + tau) % tau
  return clamp((Math.sin(normalized) + 0.06) / 0.12, 0, 1)
}

// 0 exactly at the horizon, 1 a few degrees above. Cast-shadow strength must
// reach zero before the light source flips between sun and moon, otherwise the
// 180-degree direction swap would pop while shadows are still visible.
export function getShadowFactor(angle: number) {
  const normalized = ((angle % tau) + tau) % tau
  return clamp(Math.sin(normalized) / 0.1, 0, 1)
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

function SunDot({ opacity, x, y }: { opacity: number; x: number; y: number }) {
  return (
    <g className="sun-widget-dot" opacity={opacity}>
      <circle cx={x} cy={y} r="2.1" />
    </g>
  )
}

function MoonDot({ opacity, x, y }: { opacity: number; x: number; y: number }) {
  return (
    <g className="sun-widget-moon" opacity={opacity}>
      <circle cx={x} cy={y} r="1.7" />
    </g>
  )
}

// A gnomon casting a shadow that swings and stretches opposite the sun. The
// cot() shadow length blows up at the horizons, so it is clamped to the frame.
function GnomonWidget({ angle, moonAngle, moonFactor, sunFactor }: WidgetProps) {
  const clampedAngle = clamp(angle, 0, Math.PI)
  const clampedMoonAngle = clamp(moonAngle, 0, Math.PI)
  const sunShadow = getShadowFactor(angle)
  const moonShadow = getShadowFactor(moonAngle) * 0.4
  const lightAngle = sunShadow >= moonShadow ? clampedAngle : clampedMoonAngle
  const shadowLength = clamp((-Math.cos(lightAngle) * 11) / Math.max(Math.sin(lightAngle), 0.3), -17, 17)
  const sunX = 24 + Math.cos(clampedAngle) * 17
  const sunY = 26 - Math.sin(clampedAngle) * 15
  const moonX = 24 + Math.cos(clampedMoonAngle) * 17
  const moonY = 26 - Math.sin(clampedMoonAngle) * 15

  return (
    <svg aria-hidden="true" className="sun-widget" viewBox="0 0 48 32">
      <line className="sun-widget-ground" x1="4" y1="26" x2="44" y2="26" />
      <line
        className="sun-widget-shadow"
        opacity={Math.max(sunShadow, moonShadow)}
        x1="24"
        y1="26"
        x2={24 + shadowLength}
        y2="26"
      />
      <line className="sun-widget-stick" x1="24" y1="26" x2="24" y2="15" />
      <MoonDot opacity={moonFactor} x={moonX} y={moonY} />
      <SunDot opacity={sunFactor} x={sunX} y={sunY} />
    </svg>
  )
}

// The sun's dotted day-path over a horizon line; the dot is evaluated on the
// same cubic bezier the track draws so it never floats off the stroke.
function ArcWidget({ angle, moonAngle, moonFactor, sunFactor }: WidgetProps) {
  const t = 1 - clamp(angle, 0, Math.PI) / Math.PI
  const moonT = 1 - clamp(moonAngle, 0, Math.PI) / Math.PI
  const sunX = cubicBezier(t, 8, 16, 32, 40)
  const sunY = cubicBezier(t, 25, 8, 8, 25)
  const moonX = cubicBezier(moonT, 8, 16, 32, 40)
  const moonY = cubicBezier(moonT, 25, 8, 8, 25)

  return (
    <svg aria-hidden="true" className="sun-widget" viewBox="0 0 48 32">
      <path className="sun-widget-track" d="M 8 25 C 16 8 32 8 40 25" />
      <line className="sun-widget-ground" x1="4" y1="25" x2="44" y2="25" />
      <MoonDot opacity={moonFactor} x={moonX} y={moonY} />
      <SunDot opacity={sunFactor} x={sunX} y={sunY} />
    </svg>
  )
}

// A semicircular gauge where the amber stroke fills with elapsed daylight.
function GaugeWidget({ angle, moonAngle, moonFactor, sunFactor }: WidgetProps) {
  const clampedAngle = clamp(angle, 0, Math.PI)
  const clampedMoonAngle = clamp(moonAngle, 0, Math.PI)
  const progress = clampedAngle / Math.PI
  const sunX = 24 + Math.cos(clampedAngle) * 18
  const sunY = 26 - Math.sin(clampedAngle) * 18
  const moonX = 24 + Math.cos(clampedMoonAngle) * 18
  const moonY = 26 - Math.sin(clampedMoonAngle) * 18

  return (
    <svg aria-hidden="true" className="sun-widget" viewBox="0 0 48 32">
      <path className="sun-widget-track" d="M 42 26 A 18 18 0 0 0 6 26" />
      <path
        className="sun-widget-progress"
        d="M 42 26 A 18 18 0 0 0 6 26"
        opacity={sunFactor}
        pathLength={1}
        style={{ strokeDasharray: `${progress} 1` }}
      />
      <line className="sun-widget-ground" x1="2" y1="26" x2="9" y2="26" />
      <line className="sun-widget-ground" x1="39" y1="26" x2="46" y2="26" />
      <MoonDot opacity={moonFactor} x={moonX} y={moonY} />
      <SunDot opacity={sunFactor} x={sunX} y={sunY} />
    </svg>
  )
}

// A literal angle glyph: horizon ray, sun ray, and a small amber arc between
// them marking the measured elevation.
function WedgeWidget({ angle, moonAngle, moonFactor, sunFactor }: WidgetProps) {
  const clampedAngle = clamp(angle, 0, Math.PI)
  const clampedMoonAngle = clamp(moonAngle, 0, Math.PI)
  const rayX = 24 + Math.cos(clampedAngle) * 17
  const rayY = 26 - Math.sin(clampedAngle) * 17
  const moonX = 24 + Math.cos(clampedMoonAngle) * 17
  const moonY = 26 - Math.sin(clampedMoonAngle) * 17
  const arcRadius = 7.5
  const arcX = 24 + Math.cos(clampedAngle) * arcRadius
  const arcY = 26 - Math.sin(clampedAngle) * arcRadius

  return (
    <svg aria-hidden="true" className="sun-widget" viewBox="0 0 48 32">
      <line className="sun-widget-ground" x1="4" y1="26" x2="44" y2="26" />
      <path
        className="sun-widget-angle-arc"
        d={`M ${24 + arcRadius} 26 A ${arcRadius} ${arcRadius} 0 0 0 ${arcX} ${arcY}`}
        opacity={sunFactor}
      />
      <line className="sun-widget-needle" opacity={sunFactor} x1="24" y1="26" x2={rayX} y2={rayY} />
      <MoonDot opacity={moonFactor} x={moonX} y={moonY} />
      <SunDot opacity={sunFactor} x={rayX} y={rayY} />
    </svg>
  )
}

const widgetComponents = {
  arc: ArcWidget,
  gauge: GaugeWidget,
  gnomon: GnomonWidget,
  wedge: WedgeWidget,
} as const

export function SunWidget({ angle, variant }: { angle: number; variant: SunWidgetVariant }) {
  const Widget = widgetComponents[variant]
  const normalized = ((angle % tau) + tau) % tau
  const moonAngle = (normalized + Math.PI) % tau
  return (
    <Widget
      angle={normalized}
      moonAngle={moonAngle}
      moonFactor={getSunFactor(moonAngle)}
      sunFactor={getSunFactor(normalized)}
    />
  )
}
