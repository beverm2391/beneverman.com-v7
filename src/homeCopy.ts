export const homepageIntroCopy = {
  atlanta: 'On any given day, you can probably find me working at one of my favorite coffee shops in Atlanta.',
  bencorpLabel: 'BENCORP',
  experimentsMiddle: 'my fake company; source code is on my',
  experimentsPrefix: 'Most of my experiments are colocated under',
  experimentsSuffix: 'feel free to reach out to me on',
  githubLabel: 'GitHub',
  name: 'Ben Everman',
  projects:
    'In my free time, I like to work on technical projects like LLM inference optimization, model interpretability, shaders, AI tooling, and the like.',
  work:
    "I'm currently working as a software engineer at Tekmir, where we're building an end-to-end platform for mass-action litigation.",
  xLabel: 'X',
} as const

export const homepageIntroLayerText = {
  atlanta: homepageIntroCopy.atlanta,
  contact: `${homepageIntroCopy.experimentsPrefix} ${homepageIntroCopy.bencorpLabel}, ${homepageIntroCopy.experimentsMiddle} ${homepageIntroCopy.githubLabel}; ${homepageIntroCopy.experimentsSuffix} ${homepageIntroCopy.xLabel}.`,
  name: homepageIntroCopy.name,
  projects: homepageIntroCopy.projects,
  work: homepageIntroCopy.work,
} as const
