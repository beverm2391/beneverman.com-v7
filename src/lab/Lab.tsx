import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { defaultAnimState, sunAngleSweep, useSweep, type AnimState } from './animatedParam'
import { createLayerInstance, createScene } from './layers'
import { LayerStack } from './LayerStack'
import {
  cloneScene,
  moveLayer,
  removeLayer,
  slugify,
  updateLayer,
  withLayer,
  type LayerType,
  type Scene,
} from './scene'
import { deleteScene as deleteSceneOnDisk, listScenes, saveScene as saveSceneToDisk } from './scenesClient'
import { LabSidebar, type LabActions } from './LabSidebar'
import { LabTopBar } from './LabTopBar'
import './coss.css'
import './Lab.css'

export default function Lab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [savedScenes, setSavedScenes] = useState<Scene[]>([])
  const [scene, setScene] = useState<Scene | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  // Sun-angle animation is a preview aid, not part of the saved scene: it sweeps
  // a display angle without touching scene.sunAngle.
  const [sunAnim, setSunAnim] = useState<AnimState>(defaultAnimState)

  const selectInto = useCallback(
    (next: Scene) => {
      setScene(cloneScene(next))
      setDirty(false)
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set('scene', next.id)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Load disk scenes on mount; seed a starter if the store is empty.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let scenes = await listScenes()
        if (scenes.length === 0) {
          const starter = createScene('Sundial')
          await saveSceneToDisk(starter)
          scenes = [starter]
        }
        if (cancelled) return
        setSavedScenes(scenes)
        const wanted = searchParams.get('scene')
        const initial = scenes.find((s) => s.id === wanted) ?? scenes[0]
        setScene(cloneScene(initial))
        setDirty(false)
      } catch (error) {
        if (!cancelled) setStatus(`load failed: ${String(error)}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // Run once — the scene deep-link is read on first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Coss components (selects, menus) portal their popups to <body>, outside the
  // .lab.dark wrapper. Put `dark` on the document root while the lab is mounted
  // so those portaled popups pick up the dark tokens too.
  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  // Preview-only sun-angle sweep (matches the homepage cycle); never touches
  // the saved scene.
  const displaySunAngle = useSweep(sunAnim.on, sunAnim.rate, scene?.sunAngle ?? 0, sunAngleSweep)

  const edit = useCallback((next: (scene: Scene) => Scene) => {
    setScene((current) => (current ? next(current) : current))
    setDirty(true)
  }, [])

  const actions = useMemo<LabActions>(
    () => ({
      selectScene: (id) => {
        const target = savedScenes.find((s) => s.id === id)
        if (target) selectInto(target)
      },
      newScene: () => selectInto(createScene('Untitled')),
      duplicateScene: () =>
        setScene((current) => {
          if (!current) return current
          const copyName = `${current.name} copy`
          setDirty(true)
          return { ...cloneScene(current), id: slugify(copyName), name: copyName }
        }),
      renameScene: (name) => edit((current) => ({ ...current, name, id: slugify(name) })),
      deleteScene: async () => {
        if (!scene) return
        try {
          await deleteSceneOnDisk(scene.id)
          const remaining = savedScenes.filter((s) => s.id !== scene.id)
          setSavedScenes(remaining)
          selectInto(remaining[0] ?? createScene('Sundial'))
          setStatus('deleted')
        } catch (error) {
          setStatus(`delete failed: ${String(error)}`)
        }
      },
      saveScene: async () => {
        if (!scene) return
        try {
          await saveSceneToDisk(scene)
          setSavedScenes(await listScenes())
          setDirty(false)
          setStatus('saved')
        } catch (error) {
          setStatus(`save failed: ${String(error)}`)
        }
      },
      copyJson: () => {
        if (scene) navigator.clipboard?.writeText(JSON.stringify(scene, null, 2))
        setStatus('copied JSON')
      },
      setSunAngle: (value) => edit((current) => ({ ...current, sunAngle: value })),
      addLayer: (type: LayerType) => edit((current) => withLayer(current, createLayerInstance(type))),
      removeLayer: (instanceId) => edit((current) => removeLayer(current, instanceId)),
      toggleLayer: (instanceId) =>
        edit((current) => updateLayer(current, instanceId, (layer) => ({ ...layer, enabled: !layer.enabled }))),
      setLayerConfig: (instanceId, key, value) =>
        edit((current) =>
          updateLayer(current, instanceId, (layer) => ({ ...layer, config: { ...layer.config, [key]: value } })),
        ),
      reorderLayer: (from, to) => edit((current) => moveLayer(current, from, to)),
    }),
    [savedScenes, scene, selectInto, edit],
  )

  if (!scene) {
    return <div className="lab dark lab--loading">{status || 'loading lab…'}</div>
  }

  const displayScene = sunAnim.on ? { ...scene, sunAngle: displaySunAngle } : scene

  return (
    <div className="lab dark">
      <LabSidebar actions={actions} onSunAnim={setSunAnim} scene={scene} sunAnim={sunAnim} />
      <div className="lab__stage">
        <LabTopBar actions={actions} dirty={dirty} savedScenes={savedScenes} scene={scene} status={status} />
        <div className="lab__viewer">
          <LayerStack scene={displayScene} />
        </div>
      </div>
    </div>
  )
}
