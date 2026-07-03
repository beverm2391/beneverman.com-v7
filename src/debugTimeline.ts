export type DebugTimelineEvent = {
  detail?: string
  label: string
  time: number
}

const startTime = performance.now()
const events: DebugTimelineEvent[] = []
const listeners = new Set<(events: DebugTimelineEvent[]) => void>()

export function emitDebugTimelineEvent(label: string, detail?: string) {
  const time = performance.now() - startTime
  const isDuplicateDevEvent = events.some(
    (event) => event.label === label && event.detail === detail && Math.abs(event.time - time) < 50,
  )

  if (isDuplicateDevEvent) return

  events.push({
    detail,
    label,
    time,
  })

  const snapshot = getDebugTimelineEvents()
  listeners.forEach((listener) => listener(snapshot))
}

export function getDebugTimelineEvents() {
  return events.slice()
}

export function subscribeDebugTimeline(listener: (events: DebugTimelineEvent[]) => void) {
  listeners.add(listener)
  listener(getDebugTimelineEvents())

  return () => {
    listeners.delete(listener)
  }
}
