import { cleanEmoji, makePathResolver, normalizePath, snippetOccurs, toKebab, uniqueId, validateConceptMap, validateQuiz, validateTours } from './validate'
import { CONTENTS, makeFixture } from './testFixtures'

describe('id helpers', () => {
  it('toKebab', () => {
    expect(toKebab('Shopping Cart!')).toBe('shopping-cart')
    expect(toKebab('userAccount')).toBe('user-account')
    expect(toKebab('  Café  au lait ')).toBe('cafe-au-lait')
    expect(toKebab('🎉')).toBe('')
  })

  it('uniqueId de-duplicates', () => {
    const taken = new Set<string>()
    expect(uniqueId('Cart', taken)).toBe('cart')
    expect(uniqueId('cart', taken)).toBe('cart-2')
    expect(uniqueId('CART', taken)).toBe('cart-3')
    expect(uniqueId('', taken, 'idea')).toBe('idea')
  })

  it('cleanEmoji falls back for words and shortcodes', () => {
    expect(cleanEmoji('🛒', 'x')).toBe('🛒')
    expect(cleanEmoji(':cart:', '💡')).toBe('💡')
    expect(cleanEmoji('', '💡')).toBe('💡')
  })
})

describe('paths and snippets', () => {
  it('normalizePath strips decoration', () => {
    expect(normalizePath('`./src/App.tsx`')).toBe('src/App.tsx')
    expect(normalizePath('/src/App.tsx:12')).toBe('src/App.tsx')
    expect(normalizePath('src\\App.tsx#L3-L9')).toBe('src/App.tsx')
  })

  it('makePathResolver accepts exact and unambiguous case-insensitive paths only', () => {
    const { analysis, snapshot } = makeFixture()
    const resolve = makePathResolver(analysis, snapshot)
    expect(resolve('src/App.tsx')).toBe('src/App.tsx')
    expect(resolve('SRC/app.TSX')).toBe('src/App.tsx')
    expect(resolve('acme/shop/src/App.tsx')).toBe('src/App.tsx')
    expect(resolve('src/Nope.tsx')).toBeNull()
    expect(resolve(null)).toBeNull()
  })

  it('snippetOccurs ignores whitespace differences', () => {
    const content = CONTENTS['src/App.tsx']
    expect(snippetOccurs('export function App() {', content)).toBe(true)
    expect(snippetOccurs('export   function App(){', content)).toBe(true)
    expect(snippetOccurs('export function Shop() {', content)).toBe(false)
    expect(snippetOccurs('   ', content)).toBe(false)
  })
})

describe('validateConceptMap', () => {
  const { analysis, snapshot } = makeFixture()

  it('drops unknown files, makes ids unique kebab-case, clamps importance and fixes relations', () => {
    const map = validateConceptMap(
      {
        concepts: [
          { id: 'Shopping Cart', name: 'Shopping cart', emoji: '🛒', category: 'data', summary: ' s ', explanation: 'e', analogy: 'a', files: ['src/state/cart.ts', 'src/missing.ts', '`./src/App.tsx`', 'src/state/cart.ts'], importance: 9 },
          { id: 'shopping-cart', name: 'Cart button', emoji: ':button:', category: 'feature', summary: 's', explanation: 'e', analogy: 'a', files: [], importance: 0.2 },
          { id: 'x', name: '   ', emoji: '❓', category: 'idea', summary: '', explanation: '', analogy: '', files: [], importance: 3 },
          { id: 'ui', name: 'Screens', emoji: '🖼️', category: 'feature', summary: 's', explanation: 'e', analogy: 'a', files: [], importance: Number.NaN },
        ],
        relations: [
          { from: 'Shopping Cart', to: 'ui', label: 'is shown on' },
          { from: 'shopping-cart', to: 'shopping-cart', label: 'loops' },
          { from: 'ui', to: 'ghost', label: 'haunts' },
          { from: 'shopping-cart-2', to: 'ui', label: '' },
          { from: 'Shopping Cart', to: 'ui', label: 'is shown on' },
        ],
      },
      analysis,
      snapshot,
    )
    expect(map.source).toBe('ai')
    expect(map.concepts.map((c) => c.id)).toEqual(['shopping-cart', 'shopping-cart-2', 'ui'])
    expect(map.concepts[0].files).toEqual(['src/state/cart.ts', 'src/App.tsx'])
    expect(map.concepts[0].importance).toBe(5)
    expect(map.concepts[0].summary).toBe('s')
    expect(map.concepts[1].importance).toBe(1)
    expect(map.concepts[1].emoji).toBe('✨')
    expect(map.concepts[2].importance).toBe(3)
    expect(map.relations).toEqual([
      { from: 'shopping-cart', to: 'ui', label: 'is shown on' },
      { from: 'shopping-cart-2', to: 'ui', label: 'relates to' },
    ])
  })
})

describe('validateTours', () => {
  const { analysis, snapshot } = makeFixture()
  const contentOf = (p: string) => snapshot.files[p]

  const raw = {
    tours: [
      {
        id: 'App Startup',
        title: 'What happens at startup',
        question: 'What happens when the app opens?',
        emoji: '🚀',
        summary: 'From page load to the first screen.',
        steps: [
          { title: 'Start', explanation: 'The page loads `src/main.tsx`.', file: 'src/main.tsx', snippet: "import { App } from './App'", moduleId: 'src' },
          { title: 'Made-up snippet', explanation: 'x', file: 'src/App.tsx', snippet: 'const fake = true', moduleId: 'components' },
          { title: 'Ghost file', explanation: 'x', file: 'src/ghost.ts', snippet: 'boo', moduleId: 'nope' },
          { title: 'Bad module, known file', explanation: 'x', file: 'src/state/cart.ts', snippet: null, moduleId: 'mystery' },
          { title: '', explanation: '', file: null, snippet: null, moduleId: null },
        ],
      },
      { id: 'app-startup', title: 'Empty', question: '', emoji: 'x', summary: '', steps: [] },
      { id: 'app-startup', title: 'Second', question: '', emoji: 'x', summary: '', steps: [{ title: 'a', explanation: 'b', file: null, snippet: 'x', moduleId: null }] },
    ],
  }

  it('validates files, snippets and module ids, and makes ids unique', () => {
    const tours = validateTours(raw, analysis, { snapshot, contentOf })
    expect(tours).toHaveLength(2)
    const [t, second] = tours
    expect(t.id).toBe('app-startup')
    expect(t.source).toBe('ai')
    expect(t.steps).toHaveLength(4)
    expect(t.steps[0]).toMatchObject({ file: 'src/main.tsx', snippet: "import { App } from './App'", moduleId: 'src' })
    // Snippet not in the file → null; module given by name → resolved to id.
    expect(t.steps[1]).toMatchObject({ file: 'src/App.tsx', snippet: null, moduleId: 'src/components' })
    // Unknown file → null file and snippet; unknown module, no file → null.
    expect(t.steps[2]).toMatchObject({ file: null, snippet: null, moduleId: null })
    // Unknown module with a known file → that file's module.
    expect(t.steps[3].moduleId).toBe('src/state')
    expect(second.id).toBe('app-startup-2')
    expect(second.emoji).toBe('🧭')
    expect(second.question).toBe('Second')
    expect(second.steps[0].snippet).toBeNull()
  })

  it('keeps snippets when the file content is unknown', () => {
    const tours = validateTours(raw, analysis, { snapshot, contentOf: () => undefined })
    expect(tours[0].steps[1].snippet).toBe('const fake = true')
  })

  it('single mode keeps one tour, avoids taken ids and fills in the question', () => {
    const tours = validateTours(
      { tours: [{ ...raw.tours[0], question: '' }, raw.tours[2]] },
      analysis,
      { snapshot, contentOf, takenIds: new Set(['app-startup']), single: { question: 'How does it start?' } },
    )
    expect(tours).toHaveLength(1)
    expect(tours[0].id).toBe('app-startup-2')
    expect(tours[0].question).toBe('How does it start?')
  })
})

describe('validateQuiz', () => {
  it('keeps 3–4 unique options with a valid answer index', () => {
    const quiz = validateQuiz({
      questions: [
        { question: 'Q1', options: ['a', 'b', 'c'], answerIndex: 1, explanation: 'because' },
        { question: 'Q2', options: ['a', 'b'], answerIndex: 0, explanation: '' },
        { question: 'Q3', options: ['a', 'b', 'c'], answerIndex: 3, explanation: '' },
        { question: 'Q4', options: ['a', 'b', 'c', 'd', 'e', 'f'], answerIndex: 5, explanation: '' },
        { question: 'Q5', options: ['a', 'A', 'b', 'c'], answerIndex: 3, explanation: '' },
        { question: 'Q6', options: ['a', 'b', 'c'], answerIndex: 1.5, explanation: '' },
        { question: '  ', options: ['a', 'b', 'c'], answerIndex: 0, explanation: '' },
        { question: 'Q8', options: ['a', '', 'b', 'c'], answerIndex: 1, explanation: '' },
      ],
    })
    expect(quiz.questions.map((q) => q.question)).toEqual(['Q1', 'Q4', 'Q5'])
    expect(quiz.questions[0].answerIndex).toBe(1)
    expect(quiz.questions[1].options).toEqual(['a', 'b', 'c', 'f'])
    expect(quiz.questions[1].answerIndex).toBe(3)
    expect(quiz.questions[2].options).toEqual(['a', 'b', 'c'])
    expect(quiz.questions[2].answerIndex).toBe(2)
    for (const q of quiz.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(3)
      expect(q.options.length).toBeLessThanOrEqual(4)
      expect(q.answerIndex).toBeGreaterThanOrEqual(0)
      expect(q.answerIndex).toBeLessThan(q.options.length)
    }
  })
})
