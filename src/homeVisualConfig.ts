import type { CSSProperties } from 'react'
import { siteVisualConfig } from './siteVisualConfig'

const fontStacks = {
  geist: 'Geist, Inter, ui-sans-serif, sans-serif',
  inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
  'open sans': '"Open Sans", Inter, ui-sans-serif, sans-serif',
  rubik: 'Rubik, Inter, ui-sans-serif, sans-serif',
} as const

export type HomeIntroStyle = CSSProperties & Record<`--${string}`, string | number>

type HomeIntroStyleOptions = {
  font?: keyof typeof fontStacks
  typeSettings?: {
    lineHeight: number
    size: number
    tracking: number
    weight: number
    width: number
  }
}

export function getHomeIntroStyle(options: HomeIntroStyleOptions = {}): HomeIntroStyle {
  const font = options.font ?? siteVisualConfig.font
  const typeSettings = options.typeSettings ?? siteVisualConfig.typeSettings
  return {
    '--intro-font-family': fontStacks[font],
    '--intro-font-size': `${typeSettings.size}rem`,
    '--intro-font-weight': typeSettings.weight,
    '--intro-letter-spacing': `${typeSettings.tracking}em`,
    '--intro-line-height': typeSettings.lineHeight,
    '--intro-max-width': `${typeSettings.width}rem`,
    '--site-inline-padding': 'clamp(1.25rem, 4vw, 4rem)',
  }
}
