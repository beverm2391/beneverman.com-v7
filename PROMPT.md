# beneverman.com v7 — dev knowledge

Art-first personal site. Vite + React + TypeScript + three.js. pnpm.

## Commands

- `pnpm dev` — dev server. A detached instance is often already running on
  port 5174; check before starting another.
- `pnpm build`, `pnpm lint`, `npx tsc --noEmit` — the verification trio.

## Deploy

Vercel git integration: merging to `main` deploys production immediately.
There is no CI gate in the repo, so before merging verify locally
(`tsc`/`lint`/`build`) and check `src/siteVisualConfig.ts` holds release
values, not debug/sanity-check presets.

## Routes

- `/` — production view (config from `src/siteVisualConfig.ts`)
- `/?debug` — debug panel (scene modes, sliders, layer inspector)
- `/source?debug` — raw caster map (the data texture, not the shaded page)

## Layout

- `src/App.tsx` — page shell, debug panel, settings state, day/night cycle
- `src/V2ShadowLayer.tsx` — shadow/light renderer, shader, scene builders
- `src/siteVisualConfig.ts` — production presets (desktop + mobilePortrait)
- `src/shadowMapModes.ts` — scene mode list; kept THREE-free so the eager
  App chunk doesn't pull in three.js
- `docs/renderer.md` — how the caster-map pipeline works; read before
  touching the shader or scene builders
- `docs/tasks/` — numbered instruction files: Claude (staff role) writes
  specs, Codex executes them. Status line at the top of each file.

## Gotchas

- **Low-battery guard**: shadows are disabled on battery ≤20% when not
  charging. Headless browser checks must spoof `navigator.getBattery`
  (`charging: true`) or the shadow layer silently never renders.
- **Display mirror**: the display shader samples the caster map with
  flipped v, so caster-scene y is NEGATED on screen (scene y = +1 is the
  screen bottom) and rotations negate too. Scene x matches screen x.
- **Clear color**: the caster pass sets an opaque black clear color; after
  `gl.setRenderTarget(null)` it must be restored to
  `setClearColor(0xf2f0ee, 0)` or the whole page renders black.
- **Straight alpha**: the fragment shader must output non-premultiplied
  color (`color / max(alpha, ε)`); NormalBlending premultiplies on write.
- `src/SunIconLab.tsx` / `src/SunIconLab.css` are another agent's
  untracked work-in-progress — leave them alone.
