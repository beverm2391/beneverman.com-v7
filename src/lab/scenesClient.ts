// Client for the dev-only disk store (see vite/labScenes.ts). Used by the lab
// for live listing/saving/deleting. Not available in production builds.

import type { Scene } from './scene'

const ROUTE = '/__lab/scenes'

export async function listScenes(): Promise<Scene[]> {
  const res = await fetch(ROUTE)
  if (!res.ok) throw new Error(`listScenes failed: ${res.status}`)
  return res.json()
}

export async function saveScene(scene: Scene): Promise<void> {
  const res = await fetch(ROUTE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scene),
  })
  if (!res.ok) throw new Error(`saveScene failed: ${res.status}`)
}

export async function deleteScene(id: string): Promise<void> {
  const res = await fetch(`${ROUTE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteScene failed: ${res.status}`)
}
