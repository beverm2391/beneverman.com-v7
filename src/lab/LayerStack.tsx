// Renders a Scene's enabled layers as stacked, absolutely-positioned layers.
// Shared between the lab viewer and (via a saved scene JSON) the homepage, so
// "what you tuned" and "what ships" render through exactly one code path.

import { getLayerDef } from './layers'
import type { Scene } from './scene'

export function LayerStack({ scene }: { scene: Scene }) {
  const count = scene.layers.length
  return (
    <>
      {scene.layers.map((layer, index) => {
        if (!layer.enabled) return null
        const def = getLayerDef(layer.type)
        if (!def) return null
        // Top of the list paints in front.
        const zIndex = count - index
        return (
          <div className="lab-render-layer" key={layer.instanceId} style={{ zIndex }}>
            {def.Render({ config: layer.config, sunAngle: scene.sunAngle })}
          </div>
        )
      })}
    </>
  )
}
