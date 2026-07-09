// Pure scene/layer model — no React, no THREE, so the homepage can import
// scene JSON and these helpers cheaply when promoting a lab scene to prod.

export type LayerType = 'sunGradient' | 'text' | 'shadow' | 'sunWidget'

// Layer configs are flat bags of primitives so scenes serialize straight to
// JSON on disk. Each layer type documents its own keys via the registry.
export type LayerConfig = Record<string, number | string | boolean>

export type LayerInstance = {
  instanceId: string
  type: LayerType
  enabled: boolean
  config: LayerConfig
}

export type Scene = {
  id: string
  name: string
  // Sun angle is scene-level: it drives both the gradient shader and the
  // shadow caster, so it lives above the layers instead of inside them.
  sunAngle: number
  // Order is paint order, top of the list = front-most (After Effects style).
  layers: LayerInstance[]
}

function id(prefix: string) {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}-${rand.slice(0, 8)}`
}

export function newInstanceId() {
  return id('layer')
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'scene'
  )
}

export function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    layers: scene.layers.map((layer) => ({ ...layer, config: { ...layer.config } })),
  }
}

export function withLayer(scene: Scene, layer: LayerInstance): Scene {
  return { ...scene, layers: [layer, ...scene.layers] }
}

export function removeLayer(scene: Scene, instanceId: string): Scene {
  return { ...scene, layers: scene.layers.filter((layer) => layer.instanceId !== instanceId) }
}

export function updateLayer(
  scene: Scene,
  instanceId: string,
  patch: (layer: LayerInstance) => LayerInstance,
): Scene {
  return {
    ...scene,
    layers: scene.layers.map((layer) => (layer.instanceId === instanceId ? patch(layer) : layer)),
  }
}

export function moveLayer(scene: Scene, from: number, to: number): Scene {
  if (from === to || from < 0 || to < 0 || from >= scene.layers.length || to >= scene.layers.length) {
    return scene
  }
  const layers = [...scene.layers]
  const [moved] = layers.splice(from, 1)
  layers.splice(to, 0, moved)
  return { ...scene, layers }
}
