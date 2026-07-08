# 001 — Ship sun-only production default

Status: ready
Author: Claude (staff)
Executor: Codex

## Outcome

The production page (default, non-debug view) serves the minimal "sun"
scene: day-cycle background gradient, sun/time widget, grain texture, and
text. No shadow scene and no second WebGL canvas. All other scenes remain
available behind `?debug` for development and future promotion.

## Why

The caster scenes (pool / curtain / sundial / canopy / window / mixed) are
still in aesthetic iteration; "sun" is stable and content-first.

Key detail: sun mode builds zero casters, so the shadow layer contributes
nothing but per-frame GPU cost — and if `lightGlow` / `lightRays` are
nonzero it degenerates into a uniform full-page tint (with no casters,
every ray sample reads "open sky"). Shipping sun therefore means NOT
mounting the shadow layer at all, not just selecting the mode.

## Changes

1. `src/siteVisualConfig.ts`
   - `shadowMapMode: 'mixed'` → `'sun'`.
   - In BOTH `shadowSettings` presets (desktop and `mobilePortrait`):
     set `lightRays: 0.5` and delete the
     `// cranked for ray sanity-checking` comment. (Preset light values
     now only matter as debug-panel defaults for scene development;
     0.5 is a sane dev default.)
2. `src/App.tsx`
   - Do not render `<V2ShadowLayer …>` when the active shadow map mode is
     `'sun'`. The mode is already reactive state, so switching modes in
     the debug panel must mount/unmount the layer live. Guard at the JSX
     usage site in App; do not add mode-awareness inside V2ShadowLayer.

## Verification

- `npx tsc --noEmit`, `pnpm lint`, `pnpm build` all pass.
- Load `http://127.0.0.1:5174/` (a detached dev server is usually already
  running on 5174; otherwise start one): no `.daylight-shadow-layer`
  element in the DOM; background day cycle and sun widget still animate.
- Load `/?debug`, click `pool`: shadow layer mounts and renders shadows.
  Click `sun`: layer unmounts again.
- Commit on this branch (`codex/sun-position-icon`), path-scoped to the
  two files.

## Out of scope

- Deleting scene modes or refactoring V2ShadowLayer (task 002, spec
  pending audit).
- README fixes.
- Opening/merging the PR to main (Ben coordinates).

## Gotchas

- Low-battery guard disables shadows on battery ≤20% when not charging;
  any headless verification must spoof `navigator.getBattery` with
  `charging: true` (see PROMPT.md).
- `src/SunIconLab.tsx` / `src/SunIconLab.css` are another thread's
  untracked work — do not touch or commit them.
