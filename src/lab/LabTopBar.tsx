import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Scene } from './scene'
import type { LabActions } from './LabSidebar'

// Global scene chrome, docked above the viewer: which scene is loaded and the
// scene-level actions. Per-layer editing lives in the sidebar.
export function LabTopBar({
  actions,
  dirty,
  savedScenes,
  scene,
  status,
}: {
  actions: LabActions
  dirty: boolean
  savedScenes: Scene[]
  scene: Scene
  status: string
}) {
  const isSaved = savedScenes.some((s) => s.id === scene.id)
  const options = [
    ...(isSaved ? [] : [{ value: scene.id, label: `${scene.name} (unsaved)` }]),
    ...savedScenes.map((saved) => ({ value: saved.id, label: saved.name })),
  ]

  return (
    <header className="lab__topbar">
      <div className="lab__topbar-left">
        <Select
          items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
          onValueChange={(value) => actions.selectScene(String(value))}
          value={scene.id}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <input
          className="lab__scene-name"
          onChange={(event) => actions.renameScene(event.target.value)}
          spellCheck={false}
          value={scene.name}
        />
        {dirty ? <span className="lab__dirty" title="Unsaved changes" /> : null}
      </div>

      <div className="lab__topbar-right">
        {status ? <span className="lab__status">{status}</span> : null}
        <Button onClick={actions.newScene} size="sm" variant="outline">
          New
        </Button>
        <Button onClick={actions.duplicateScene} size="sm" variant="outline">
          Duplicate
        </Button>
        <Button onClick={actions.deleteScene} size="sm" variant="destructive-outline">
          Delete
        </Button>
        <Button onClick={actions.copyJson} size="sm" variant="outline">
          <Copy /> JSON
        </Button>
        <Button onClick={actions.saveScene} size="sm" variant={dirty ? 'default' : 'outline'}>
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
    </header>
  )
}
