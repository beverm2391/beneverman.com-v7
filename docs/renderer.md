# Shadow/light renderer — conceptual model

The renderer in `src/V2ShadowLayer.tsx` is a two-pass 2.5D pipeline. The
core idea: the first pass renders **data, not pictures**.

## Pass 1 — caster map

A flat 2D THREE scene (viewable at `/source?debug`) draws every shape into
an offscreen render target, but the mesh "colors" are encoded channels:

- **r** — height above the page. Drives penumbra size downstream: higher
  casters get blurrier shadows.
- **g** — caster flag (1 = this pixel is occupied by a caster).
- **b** — per-caster shadow strength/darkness weight.

The result is a machine-readable description of what floats above the
paper and how far away it is.

## Pass 2 — fullscreen shading

One shader pass reads the caster map ~100 times per pixel:

- **Soft shadows**: Vogel-disk sample pattern, sampling radius scaled by
  the r channel — this is contact hardening (crisp where a caster touches
  the page, soft where it is far). Standard PCSS-style technique; the
  overall caster-map approach follows basement.studio's "casting shadows"
  article (https://basement.studio/lab).
- **Depth layers**: samples are taken at three offsets along the sun
  direction (near/mid/far), mixed by `depthMix`/`layerSpread`, to fake
  parallax layering from one map.
- **Light glow**: inverse of shadow, tinted warm; tint shifts amber as the
  day-cycle sun drops (`sunElevation` from `uSunAngle`).
- **Light rays**: 28-step march from each pixel toward the sun through the
  caster map, accumulating "openness" (1 − g·b) with exponential decay —
  pixels with a long unobstructed line to the sun glow as shafts. This is
  the classic screen-space god-rays accumulation (Mitchell, GPU Gems 3
  ch. 13), run against our data map instead of a depth buffer.
  `rayDiffusion` scatters samples laterally per step: 0 = crisp beams,
  1 = wide soft bloom.
- **Compositing**: shadow and light produce one straight-alpha color
  composited over the paper by normal DOM alpha blending. No second
  canvas, no blend modes; against near-white paper this is equivalent to
  a screen-blend light layer at half the GPU cost.

## DOM stack

background gradient canvas → shadow/light canvas (this renderer) → text →
grain overlay.

## Scene modes

`src/shadowMapModes.ts` lists them; builders live in V2ShadowLayer
(`addLightPool`, `addCurtain`, `addSundial`, canopy/window/etc.). `sun`
builds no casters — with an empty map the ray march reads "open sky"
everywhere and light params become a uniform page tint, which is why
production unmounts the layer entirely in sun mode.

Modes in `rigidWarpModes` get `uWarpStrength = 0` (they animate via
authored motion — vertex waves, rotation — instead of the UV warp used by
foliage modes).

## Invariants (see also PROMPT.md gotchas)

- Scene y is negated on screen (flipped-v sampling); rotations negate too.
- Restore `setClearColor(0xf2f0ee, 0)` after the caster pass.
- Fragment outputs straight (non-premultiplied) alpha.
- `uKernelScale` keeps penumbra size device-resolution invariant.
