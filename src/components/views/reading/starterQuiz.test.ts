import { makeFile, makeFixture } from '@/ai/testFixtures'
import type { RepoAnalysis } from '@/core/types'
import { buildStarterQuiz, firstSentence, lowerFirst, makeQuestion, seededRandom, validQuestions } from './starterQuiz'

/** The AI fixture plus a few more files, parts and words, so every kind of question has material. */
function richAnalysis(): RepoAnalysis {
  const { analysis } = makeFixture()
  const extra = {
    'src/utils/format.ts': makeFile('src/utils/format.ts', { moduleId: 'src/utils', importedBy: ['src/App.tsx', 'src/components/Button.tsx', 'src/state/cart.ts', 'src/api/client.ts'] }),
    'src/utils/math.ts': makeFile('src/utils/math.ts', { moduleId: 'src/utils' }),
    'src/utils/dates.ts': makeFile('src/utils/dates.ts', { moduleId: 'src/utils' }),
    'src/pages/Checkout.tsx': makeFile('src/pages/Checkout.tsx', { role: 'page', layer: 'ui', moduleId: 'src' }),
    'tests/cart.test.ts': makeFile('tests/cart.test.ts', { kind: 'test', role: 'test', layer: 'test', moduleId: 'tests' }),
    'vite.config.ts': makeFile('vite.config.ts', { kind: 'config', role: 'config', layer: 'config', moduleId: '(root)' }),
  }
  Object.assign(analysis.files, extra)
  analysis.hubs = ['src/utils/format.ts', 'src/App.tsx']
  analysis.languages = [
    { name: 'TypeScript', bytes: 9000, files: 10, percent: 92, color: '#3178c6' },
    { name: 'CSS', bytes: 500, files: 2, percent: 5, color: '#663399' },
    { name: 'JavaScript', bytes: 300, files: 1, percent: 3, color: '#f1e05a' },
  ]
  analysis.modules = [
    ...analysis.modules,
    { ...analysis.modules[0], id: 'tests', name: 'tests', path: 'tests', layer: 'test', role: 'Automated tests', description: 'Automatic checks.', files: ['tests/cart.test.ts'], fileCount: 1, lines: 40 },
    { ...analysis.modules[0], id: 'src/utils', name: 'utils', path: 'src/utils', layer: 'logic', role: 'Helpers', description: 'Small helpers.', files: ['src/utils/format.ts'], fileCount: 3, lines: 400 },
  ]
  analysis.glossaryTermIds = ['component', 'state', 'api', 'dependency', 'function']
  analysis.stats.testFiles = 1
  return analysis
}

function check(q: { question: string; options: string[]; answerIndex: number; explanation: string }) {
  expect(q.question.trim().length).toBeGreaterThan(5)
  expect(q.options.length).toBeGreaterThanOrEqual(3)
  expect(q.options.length).toBeLessThanOrEqual(4)
  expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(q.options.length)
  expect(q.answerIndex).toBeGreaterThanOrEqual(0)
  expect(q.answerIndex).toBeLessThan(q.options.length)
  expect(q.explanation.trim().length).toBeGreaterThan(10)
}

describe('buildStarterQuiz', () => {
  it('builds six well-formed questions from the analysis', () => {
    const a = richAnalysis()
    const quiz = buildStarterQuiz(a)
    expect(quiz.questions).toHaveLength(6)
    quiz.questions.forEach(check)
    const qs = quiz.questions.map((q) => q.question)
    expect(new Set(qs).size).toBe(qs.length)
    // Warm-ups first: what kind of project, then the main language.
    expect(qs[0]).toBe('What kind of project is this?')
    expect(qs[1]).toMatch(/programming language/)
  })

  it('gets the facts right', () => {
    const a = richAnalysis()
    const quiz = buildStarterQuiz(a, { count: 12 })
    const find = (re: RegExp) => quiz.questions.find((q) => re.test(q.question))
    const answer = (re: RegExp) => {
      const q = find(re)
      return q ? q.options[q.answerIndex] : undefined
    }
    expect(answer(/kind of project/)).toBe('Web application')
    expect(answer(/programming language/)).toBe('TypeScript')
    expect(answer(/starting point/)).toBe('`src/main.tsx`')
    expect(answer(/rely on/)).toBe('`src/utils/format.ts`')
    const tech = find(/This project uses/)
    expect(tech?.question).toMatch(/React|Zustand/)
    // Styling and markup languages never appear as wrong answers to "which programming language".
    expect(find(/programming language/)?.options).not.toContain('CSS')
  })

  it('never offers another starting point, or a starting-point-looking file, as a wrong answer', () => {
    const a = richAnalysis()
    for (let seed = 1; seed < 15; seed++) {
      const q = buildStarterQuiz(a, { seed, count: 12 }).questions.find((x) => /starting point/.test(x.question))
      if (!q) continue
      const wrong = q.options.filter((_, i) => i !== q.answerIndex)
      for (const w of wrong) expect(w).not.toMatch(/main\.tsx|index\.|__init__/)
    }
  })

  it('is the same for the same seed, and varies with the seed', () => {
    const a = richAnalysis()
    expect(buildStarterQuiz(a, { seed: 7 })).toEqual(buildStarterQuiz(a, { seed: 7 }))
    const variants = new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(buildStarterQuiz(a, { seed: i + 1 }))))
    expect(variants.size).toBeGreaterThan(1)
  })

  it('still asks something about a tiny project', () => {
    const a = richAnalysis()
    a.techStack = []
    a.hubs = []
    a.entryPoints = []
    a.glossaryTermIds = []
    const quiz = buildStarterQuiz(a)
    expect(quiz.questions.length).toBeGreaterThanOrEqual(4)
    quiz.questions.forEach(check)
  })

  it('returns no questions when there is nothing to ask', () => {
    const a = richAnalysis()
    a.languages = []
    a.modules = []
    a.techStack = []
    a.hubs = []
    a.entryPoints = []
    a.glossaryTermIds = []
    a.readme = null
    a.stats.testFiles = 0
    a.projectKind = { ...a.projectKind, id: 'unknown', confidence: 0 }
    expect(buildStarterQuiz(a).questions).toEqual([])
  })
})

describe('helpers', () => {
  it('makeQuestion de-duplicates answers and needs two wrong ones', () => {
    const rng = seededRandom(3)
    const q = makeQuestion('Q?', 'Right', ['right', 'Wrong 1', ' Wrong 1 ', 'Wrong 2', 'Wrong 3', 'Wrong 4'], 'Because.', rng)
    expect(q?.options).toHaveLength(4)
    expect(q?.options[q.answerIndex]).toBe('Right')
    expect(makeQuestion('Q?', 'Right', ['Right', 'Only one'], 'x', rng)).toBeNull()
  })

  it('firstSentence trims long descriptions politely', () => {
    expect(firstSentence('A web toolkit. It is popular.')).toBe('A web toolkit.')
    expect(firstSentence('Short')).toBe('Short')
    const long = firstSentence(`${'word '.repeat(60)}end.`, 60)
    expect(long.length).toBeLessThanOrEqual(61)
    expect(long.endsWith('…')).toBe(true)
  })

  it('lowerFirst only lowers ordinary sentence starts', () => {
    expect(lowerFirst('A toolbox of code')).toBe('a toolbox of code')
    expect(lowerFirst('It’s a Go package')).toBe('it’s a Go package')
    expect(lowerFirst('React builds screens')).toBe('React builds screens')
    expect(lowerFirst('API servers')).toBe('API servers')
  })

  it('validQuestions drops malformed questions (e.g. from Claude)', () => {
    const good = { question: 'Q?', options: ['a', 'b'], answerIndex: 1, explanation: '' }
    expect(validQuestions({ questions: [good, { ...good, answerIndex: 5 }, { ...good, options: ['only'] }, { ...good, question: ' ' }] })).toEqual([good])
    expect(validQuestions(null)).toEqual([])
  })
})
