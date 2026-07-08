// Build-time access to saved scenes, for promoting a lab scene to the live
// site IN CODE. Scene JSON files are bundled statically, so the homepage can
// render a tuned scene through the shared LayerStack:
//
//   import { getSceneById } from './lab/sceneStore'
//   import { LayerStack } from './lab/LayerStack'
//   const scene = getSceneById('sundial')
//   {scene && <LayerStack scene={scene} />}
//
// This is the read path for production; the lab itself reads/writes live disk
// state through scenesClient.ts during dev.

import type { Scene } from './scene'

const modules = import.meta.glob<{ default: Scene }>('./scenes/*.json', { eager: true })

export const bundledScenes: Scene[] = Object.values(modules).map((mod) => mod.default)

export function getSceneById(id: string): Scene | undefined {
  return bundledScenes.find((scene) => scene.id === id)
}
