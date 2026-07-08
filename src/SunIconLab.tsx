import { useEffect, useState } from 'react'
import './SunIconLab.css'
import { siteVisualConfig } from './siteVisualConfig'
import { SunWidget, type SunWidgetVariant } from './SunWidget'

const tau = Math.PI * 2

// The lab drives its own slow horizon-to-horizon sweep instead of mirroring the
// site's subtle drift, so each concept can be judged across the full daylight
// range without waiting for the live animation to wander there.
const sweepLowAngle = 0.16
const sweepHighAngle = Math.PI - 0.16
const sweepCycleSeconds = 72

function useSlowSunSweep() {
  const [angle, setAngle] = useState<number>(siteVisualConfig.shadowSettings.sunAngle)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frameId = 0
    const startedAt = performance.now()

    const animate = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      const sweepProgress = 0.5 - 0.5 * Math.cos((elapsed / sweepCycleSeconds) * tau)
      setAngle(sweepLowAngle + sweepProgress * (sweepHighAngle - sweepLowAngle))
      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return angle
}

const concepts: { id: string; variant: SunWidgetVariant; note: string }[] = [
  {
    id: '01',
    variant: 'gnomon',
    note: 'sundial stick, cast shadow swings with the sun — ties into the site shadows',
  },
  {
    id: '02',
    variant: 'arc',
    note: 'dotted day-path over the horizon, sun rides the track',
  },
  {
    id: '03',
    variant: 'gauge',
    note: 'semicircle gauge, amber stroke fills with elapsed daylight',
  },
  {
    id: '04',
    variant: 'wedge',
    note: 'measured angle glyph — horizon ray, sun ray, elevation arc',
  },
]

export function SunIconLab() {
  const sunAngle = useSlowSunSweep()
  const sunDegrees = Math.round((sunAngle * 180) / Math.PI)

  return (
    <main className="sun-lab-shell">
      <section className="sun-lab-intro" aria-label="Sun position icon studies">
        <p>sun position studies</p>
        <p className="sun-lab-angle">{sunDegrees}&deg;</p>
        <a href="/">back</a>
      </section>
      <section className="sun-lab-grid">
        {concepts.map(({ id, note, variant }) => (
          <article className="sun-lab-card" key={id}>
            <div className="sun-lab-card-header">
              <span>{id}</span>
              <span>{variant}</span>
            </div>
            <div className="sun-lab-mock" aria-label={`${variant} widget shown in page corner`}>
              <div className="sun-lab-widget">
                <SunWidget angle={sunAngle} variant={variant} />
              </div>
              <div className="sun-lab-mock-copy" aria-hidden="true">
                <p>Ben Everman</p>
                <span />
                <span />
              </div>
            </div>
            <div className="sun-lab-detail">
              <SunWidget angle={sunAngle} variant={variant} />
            </div>
            <p className="sun-lab-note">{note}</p>
          </article>
        ))}
      </section>
      <div className="surface-texture" aria-hidden="true" />
    </main>
  )
}
