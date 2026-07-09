import { homepageIntroCopy } from './homeCopy'

export function HomeIntro() {
  return (
    <section className="intro" aria-label="About Ben Everman">
      <p className="name">{homepageIntroCopy.name}</p>
      <p>{homepageIntroCopy.work}</p>
      <p>{homepageIntroCopy.projects}</p>
      <p>{homepageIntroCopy.atlanta}</p>
      <p>
        {homepageIntroCopy.experimentsPrefix}{' '}
        <a href="https://www.bencorp.dev/" rel="noreferrer" target="_blank">
          {homepageIntroCopy.bencorpLabel}
        </a>
        , {homepageIntroCopy.experimentsMiddle}{' '}
        <a href="https://www.github.com/beverm2391" rel="noreferrer" target="_blank">
          {homepageIntroCopy.githubLabel}
        </a>
        ; {homepageIntroCopy.experimentsSuffix}{' '}
        <a href="https://www.x.com/beneverman" rel="noreferrer" target="_blank">
          {homepageIntroCopy.xLabel}
        </a>
        .
      </p>
    </section>
  )
}
