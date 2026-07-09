// Sun day/night cycle math, shared by the homepage (App) and the lab. The
// travel model maps angle to left-to-right screen travel via (PI - angle);
// cosine easing per segment brings angular velocity to zero at the horizon
// crossings, so day and night join smoothly and sunrise/sunset linger.

const tau = Math.PI * 2

export const sunDayDurationSeconds = 170
export const sunNightDurationSeconds = 60
export const sunCycleDurationSeconds = sunDayDurationSeconds + sunNightDurationSeconds

export function sunAngleAtCycleTime(cycleTime: number) {
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
export function cycleTimeAtSunAngle(angle: number) {
  const normalized = ((angle % tau) + tau) % tau

  if (normalized <= Math.PI) {
    const easedProgress = normalized / Math.PI
    return (Math.acos(1 - 2 * easedProgress) / Math.PI) * sunDayDurationSeconds
  }

  const easedProgress = (normalized - Math.PI) / Math.PI
  return sunDayDurationSeconds + (Math.acos(1 - 2 * easedProgress) / Math.PI) * sunNightDurationSeconds
}

// One 0..1 fraction scrubs the whole cycle, displayed as a clock where the 170s
// day maps to 06:00-18:00 and the 60s night to 18:00-06:00.
export function formatTimeOfDay(fraction: number) {
  const cycleTime = fraction * sunCycleDurationSeconds
  const hour =
    cycleTime < sunDayDurationSeconds
      ? 6 + (cycleTime / sunDayDurationSeconds) * 12
      : (18 + ((cycleTime - sunDayDurationSeconds) / sunNightDurationSeconds) * 12) % 24
  const wholeHour = Math.floor(hour)
  const minutes = Math.floor((hour - wholeHour) * 60)
  return `${String(wholeHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
