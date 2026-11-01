import { describe, expect, it } from 'vitest'
import { GLOSSARY, STOPWORD_SENSITIVE_TERMS, findRelevantTerms, findTermsInText, getTerm } from './glossary'

const REQUIRED_IDS = `api function class component module import dependency package framework library database server client frontend
backend route endpoint middleware state hook props async promise callback test unit-test ci-cd container docker environment-variable
config build compile bundle package-manager repository commit branch json yaml schema orm migration query cache authentication
authorization token cookie session rest graphql websocket http request response type interface variable loop recursion algorithm cli
sdk deployment linting typescript runtime nodejs event handler render dom css html responsive accessibility model controller view mvc
monorepo entry-point script terminal open-source license readme pull-request issue version-control git markdown regex concurrency
thread queue webhook oauth encryption hash serialization parsing template plugin microservice load-balancer cloud serverless kubernetes
infrastructure-as-code logging error-handling exception null boolean string array object dictionary decorator generics inheritance
dependency-injection singleton factory observer reactive virtual-dom spa ssr static-site cdn dns port localhost ip-address url
query-string crud sql nosql index transaction machine-learning neural-network training inference llm prompt embedding dataframe
notebook file folder`.split(/\s+/)

/** Return the matched words, for readable assertions. */
function found(text: string, opts?: Parameters<typeof findTermsInText>[1]): string[] {
  return findTermsInText(text, opts).map((m) => `${text.slice(m.start, m.end)}=${m.termId}`)
}

describe('glossary data integrity', () => {
  it('has 170+ terms with unique kebab-case ids', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(170)
    const ids = GLOSSARY.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('includes every required term', () => {
    const missing = REQUIRED_IDS.filter((id) => !getTerm(id))
    expect(missing).toEqual([])
  })

  it('fills every field with real content', () => {
    for (const t of GLOSSARY) {
      expect(t.term.trim(), t.id).not.toBe('')
      expect(t.short.trim().length, t.id).toBeGreaterThan(20)
      expect(t.short.length, `${t.id} short is too long`).toBeLessThanOrEqual(200)
      expect(t.long.trim().length, t.id).toBeGreaterThan(t.short.length * 0.8)
      expect(t.analogy?.trim().length ?? 0, t.id).toBeGreaterThan(10)
      expect(Array.isArray(t.aliases), t.id).toBe(true)
      expect(t.related?.length ?? 0, `${t.id} should link to related terms`).toBeGreaterThan(0)
    }
  })

  it('keeps each short definition to one sentence', () => {
    for (const t of GLOSSARY) expect(t.short.split(/(?<=[.!?])\s+(?=[A-Z"“(`])/).length, `${t.id}: ${t.short}`).toBe(1)
  })

  it('has long explanations of 2–4 sentences', () => {
    for (const t of GLOSSARY) {
      const sentences = t.long.split(/(?<=[.!?])\s+(?=[A-Z"“(`])/).length
      expect(sentences, `${t.id}: ${t.long}`).toBeGreaterThanOrEqual(2)
      expect(sentences, `${t.id}: ${t.long}`).toBeLessThanOrEqual(4)
    }
  })

  it('only relates to terms that exist, never to itself', () => {
    for (const t of GLOSSARY) {
      for (const r of t.related ?? []) {
        expect(getTerm(r), `${t.id} → ${r}`).toBeDefined()
        expect(r).not.toBe(t.id)
      }
    }
  })

  it('never gives two terms the same name or alias', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const t of GLOSSARY) {
      for (const form of new Set([t.term, ...t.aliases].map((f) => f.toLowerCase()))) {
        const prev = owner.get(form)
        if (prev && prev !== t.id) clashes.push(`"${form}": ${prev} vs ${t.id}`)
        owner.set(form, t.id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('uses only known categories', () => {
    const categories = new Set(['basics', 'web', 'data', 'tools', 'architecture', 'testing', 'devops', 'languages', 'security', 'ai'])
    for (const t of GLOSSARY) expect(categories.has(t.category), t.id).toBe(true)
  })

  it('flags common-English terms as stopword-sensitive', () => {
    for (const id of ['state', 'class', 'type', 'object', 'string', 'model', 'view', 'event', 'test', 'build', 'query', 'index', 'branch', 'issue', 'license', 'plugin', 'template']) {
      expect(STOPWORD_SENSITIVE_TERMS.has(id), id).toBe(true)
    }
    expect(STOPWORD_SENSITIVE_TERMS.has('api')).toBe(false)
  })
})

describe('findTermsInText', () => {
  it('matches whole words case-insensitively, sorted by position, first occurrence only', () => {
    expect(found('The Database talks to a server. The server stores files in the database.')).toEqual(['Database=database', 'server=server', 'files=file'])
  })

  it('returns every occurrence when asked', () => {
    expect(found('server, Server and SERVER', { allOccurrences: true })).toEqual(['server=server', 'Server=server', 'SERVER=server'])
  })

  it('never matches inside other words', () => {
    expect(found('A rapid, capable therapist; the restaurant was restful.')).toEqual([])
    expect(found('Serverless is not a server.')).toEqual(['Serverless=serverless', 'server=server'])
  })

  it('prefers the longest phrase', () => {
    expect(found('Each unit test checks one function.')).toEqual(['unit test=unit-test', 'function=function'])
    expect(found('Keep your API key secret.')).toEqual(['API key=api-key'])
    expect(found('Uses server-side rendering.')).toEqual(['server-side rendering=ssr'])
  })

  it('matches abbreviations only in their usual capitals', () => {
    expect(found('Call the API.')).toEqual(['API=api'])
    expect(found('call the api')).toEqual([])
    expect(found('A REST API for orders. Take a rest.')).toEqual(['REST API=rest'])
    expect(found('Several APIs and two PRs.')).toEqual(['APIs=api', 'PRs=pull-request'])
    expect(found('A spa day, then deploy the SPA.')).toEqual(['deploy=deployment', 'SPA=spa'])
  })

  it('handles punctuation, plurals and possessives at word edges', () => {
    expect(found('(Components) and the API’s rules; webhooks!')).toEqual(['Components=component', 'API=api', 'webhooks=webhook'])
    expect(found('"JSON", Node.js, and CI/CD.')).toEqual(['JSON=json', 'Node.js=nodejs', 'CI/CD=ci-cd'])
  })

  it('does not match parts of file names, paths, URLs or code identifiers', () => {
    expect(found('Open package.json and src/api/users.ts')).toEqual([])
    expect(found('Visit https://api.example.com/database or mail a@server.com')).toEqual([])
    expect(found('call user_api and api_client and $cache')).toEqual([])
    expect(found('the README.md file')).toEqual(['README.md=readme', 'file=file'])
  })

  it('skips everyday-English words unless asked for or written as code', () => {
    const text = 'The state of the project: a test of patience, built in class with the right type of object.'
    expect(found(text)).toEqual([])
    expect(found(text, { only: ['state', 'test'] })).toEqual(['state=state', 'test=test'])
    expect(found('Store it in `state` and run `build`.')).toEqual(['state=state', 'build=build'])
    expect(found('Write a unit test and check the app state.')).toEqual(['unit test=unit-test', 'app state=state'])
  })

  it('restricts matches to opts.only, even when a longer phrase belongs to another term', () => {
    expect(found('The server answers each API request.', { only: ['api'] })).toEqual(['API=api'])
    expect(found('Write a unit test.', { only: ['test'] })).toEqual(['test=test'])
  })

  it('does not produce overlapping matches', () => {
    const text = 'Continuous integration runs the end-to-end tests and the integration test for the REST API endpoint.'
    const matches = findTermsInText(text, { allOccurrences: true })
    for (let i = 1; i < matches.length; i++) expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].end)
    expect(matches.map((m) => m.termId)).toEqual(['ci-cd', 'e2e-test', 'integration-test', 'rest', 'endpoint'])
  })

  it('consumes a repeated phrase instead of linking its words separately', () => {
    expect(found('A unit test here, another unit test there.')).toEqual(['unit test=unit-test'])
  })

  it('handles empty and odd input', () => {
    expect(findTermsInText('')).toEqual([])
    expect(findTermsInText(undefined as unknown as string)).toEqual([])
    expect(findTermsInText('🙂 émigré naïve café — 数据库')).toEqual([])
    expect(findTermsInText('x', { only: [] })).toEqual([])
  })

  it('is fast enough to run on every paragraph', () => {
    const paragraph = 'The front end calls the API, which validates the request with middleware, queries the database through an ORM and caches the response. '.repeat(200)
    const t0 = performance.now()
    findTermsInText(paragraph, { allOccurrences: true })
    expect(performance.now() - t0).toBeLessThan(500)
  })
})

describe('findRelevantTerms', () => {
  it('always includes the basics, and adds terms for the tech, roles, layers and kind', () => {
    const ids = findRelevantTerms({
      techIds: ['next', 'react', 'prisma', 'tailwind', 'vitest'],
      roles: ['component', 'page', 'route', 'model'],
      layers: ['ui', 'api', 'data', 'test'],
      projectKind: 'web-app',
      languages: ['TypeScript', 'CSS'],
    })
    expect(ids.length).toBeGreaterThanOrEqual(20)
    expect(ids.length).toBeLessThanOrEqual(40)
    for (const id of ['repository', 'file', 'folder', 'function', 'dependency', 'framework', 'component', 'props', 'ssr', 'orm', 'typescript', 'css', 'unit-test']) {
      expect(ids, id).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(getTerm(id)).toBeDefined()
  })

  it('ranks the shared basics and strongest signals first', () => {
    const ids = findRelevantTerms({ techIds: ['django', 'celery'], roles: ['model', 'migration'], layers: ['data'], projectKind: 'api-server', languages: ['Python'] })
    expect(ids.slice(0, 5)).toContain('repository')
    expect(ids.indexOf('orm')).toBeLessThan(ids.indexOf('css') === -1 ? Infinity : ids.indexOf('css'))
    expect(ids).toEqual(expect.arrayContaining(['endpoint', 'migration', 'queue', 'background-job', 'python']))
  })

  it('suits data-science and ML projects', () => {
    const ids = findRelevantTerms({ techIds: ['pytorch', 'pandas', 'jupyter'], roles: [], layers: ['logic'], projectKind: 'ml-model', languages: ['Python', 'Jupyter Notebook'] })
    expect(ids).toEqual(expect.arrayContaining(['machine-learning', 'training', 'neural-network', 'dataframe', 'notebook', 'gpu']))
  })

  it('copes with unknown or empty input', () => {
    const ids = findRelevantTerms({ techIds: ['not-a-tech'], roles: [], layers: [], projectKind: 'unknown', languages: [] })
    expect(ids.slice(0, 3)).toEqual(['repository', 'file', 'folder'])
    expect(() => findRelevantTerms({ techIds: undefined as never, roles: undefined as never, layers: undefined as never, projectKind: 'unknown', languages: undefined as never })).not.toThrow()
  })
})
