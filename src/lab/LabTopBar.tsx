import { useEffect, useState } from 'react'
import { Copy, Pencil, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Scene } from './scene'
import type { LabActions } from './LabSidebar'

// Global scene chrome, docked above the viewer: which scene is loaded, rename,
// scene-level actions, and promotion to the live homepage.
export function LabTopBar({
  actions,
  dirty,
  promotedId,
  savedScenes,
  scene,
  status,
}: {
  actions: LabActions
  dirty: boolean
  promotedId: string | null
  savedScenes: Scene[]
  scene: Scene
  status: string
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [draft, setDraft] = useState(scene.name)

  useEffect(() => {
    if (renameOpen) setDraft(scene.name)
  }, [renameOpen, scene.name])

  const isSaved = savedScenes.some((s) => s.id === scene.id)
  const isPromoted = promotedId === scene.id && isSaved
  const options = [
    ...(isSaved ? [] : [{ value: scene.id, label: `${scene.name} (unsaved)` }]),
    ...savedScenes.map((saved) => ({
      value: saved.id,
      label: promotedId === saved.id ? `${saved.name} · live` : saved.name,
    })),
  ]

  const confirmRename = () => {
    const name = draft.trim()
    if (name) actions.renameScene(name)
    setRenameOpen(false)
  }

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
        <Button aria-label="Rename scene" onClick={() => setRenameOpen(true)} size="icon-sm" title="Rename scene" variant="ghost">
          <Pencil />
        </Button>
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
        <Button onClick={actions.promote} size="sm" title="Promote to homepage" variant={isPromoted ? 'default' : 'outline'}>
          <Rocket /> {isPromoted ? 'Promoted' : 'Promote'}
        </Button>
      </div>

      <Dialog onOpenChange={setRenameOpen} open={renameOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename scene</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Input
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmRename()
              }}
              value={draft}
            />
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setRenameOpen(false)} size="sm" variant="outline">
              Cancel
            </Button>
            <Button onClick={confirmRename} size="sm">
              Rename
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </header>
  )
}
