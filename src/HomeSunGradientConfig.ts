export const backgroundModes = [
  {
    color: '#f2f0ee',
    label: 'paper',
    shader: {
      base: [0.965, 0.945, 0.91],
      cool: [0.86, 0.84, 0.78],
      glow: [1, 0.965, 0.86],
      glowStrength: 0.24,
      mid: [0.93, 0.905, 0.86],
    },
  },
  {
    color: '#f1dcc2',
    label: 'sun',
    shader: {
      base: [0.972, 0.916, 0.84],
      cool: [0.83, 0.8, 0.72],
      glow: [1, 0.935, 0.76],
      glowStrength: 0.3,
      mid: [0.94, 0.862, 0.758],
    },
  },
  {
    color: '#e9c894',
    label: 'amber',
    shader: {
      base: [0.95, 0.875, 0.73],
      cool: [0.78, 0.72, 0.62],
      glow: [1, 0.88, 0.58],
      glowStrength: 0.33,
      mid: [0.914, 0.784, 0.58],
    },
  },
  {
    color: '#edcab3',
    label: 'peach',
    shader: {
      base: [0.962, 0.875, 0.812],
      cool: [0.84, 0.765, 0.725],
      glow: [1, 0.89, 0.775],
      glowStrength: 0.28,
      mid: [0.93, 0.79, 0.7],
    },
  },
] as const

export type BackgroundMode = (typeof backgroundModes)[number]['label']
export type BackgroundModeConfig = (typeof backgroundModes)[number]
