// Reusable "animated parameter" primitives: a numeric param that can be edited
// directly or swept over time. Any scene/layer param can opt in by holding an
// AnimState, driving a display value through useSweep, and rendering the
// AnimatedParam block.

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cycleTimeAtSunAngle, sunAngleAtCycleTime, sunCycleDurationSeconds } from '../sunClock'

function toNumber(value: number | readonly number[], fallback: number) {
  return typeof value === 'number' ? value : Number(value[0] ?? fallback)
}

export type AnimState = { on: boolean; rate: number }

export const defaultAnimState: AnimState = { on: false, rate: 1 }

// Given the base value, seconds elapsed since animation started, and a rate
// multiplier, return the display value. Must be a stable module-level function.
export type Sweep = (base: number, elapsed: number, rate: number) => number

// Exactly the homepage day/night cycle (useAnimatedSunAngle): anchor the base
// angle into the eased cycle, advance cycle time, mirror it back. rate 1 = the
// live site speed, including the 170s-day / 60s-night split and easing.
export const sunAngleSweep: Sweep = (base, elapsed, rate) => {
  const start = cycleTimeAtSunAngle(Math.PI - base)
  const cycleTime = (start + elapsed * rate) % sunCycleDurationSeconds
  return Math.PI - sunAngleAtCycleTime(cycleTime)
}

// Drives a display value off `base` while `on`; returns `base` untouched when
// off. `sweep` must be stable (module-level) or the loop restarts each frame.
export function useSweep(on: boolean, rate: number, base: number, sweep: Sweep) {
  const [value, setValue] = useState(base)
  useEffect(() => {
    if (!on) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      setValue(sweep(base, (now - start) / 1000, rate))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on, rate, base, sweep])
  return on ? value : base
}

export function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="lab__control">
      <span className="lab__control-label">
        <span>{label}</span>
        <Badge size="sm" variant="outline">
          {value.toFixed(2)}
        </Badge>
      </span>
      <Slider max={max} min={min} onValueChange={(next) => onChange(toNumber(next, value))} step={step} value={[value]} />
    </label>
  )
}

export function AnimatedParam({
  label,
  min,
  max,
  step,
  value,
  onChange,
  anim,
  onAnimChange,
  rateMin = 0.1,
  rateMax = 8,
  rateStep = 0.1,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  anim: AnimState
  onAnimChange: (next: AnimState) => void
  rateMin?: number
  rateMax?: number
  rateStep?: number
}) {
  return (
    <div className="lab__anim-param">
      <SliderRow label={label} max={max} min={min} onChange={onChange} step={step} value={value} />
      <label className="lab__control lab__control--row">
        <span className="lab__control-label">Animate</span>
        <Switch checked={anim.on} onCheckedChange={(on) => onAnimChange({ ...anim, on })} />
      </label>
      {anim.on ? (
        <SliderRow
          label="Rate ×"
          max={rateMax}
          min={rateMin}
          onChange={(rate) => onAnimChange({ ...anim, rate })}
          step={rateStep}
          value={anim.rate}
        />
      ) : null}
    </div>
  )
}
