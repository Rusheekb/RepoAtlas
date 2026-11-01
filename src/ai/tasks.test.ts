import type { ChatMessage } from '@/core/types'
import type { ClaudeRequest } from './client'
import { SYSTEM_INSTRUCTIONS, levelGuidance } from './prompts'
import { pickRelevantFiles, queryTerms } from './relevance'
import {
  askQuestion,
  buildCopyPrompt,
  explainTaskKey,
  generateConceptMap,
  generateQuiz,
  generateTours,
  historyToMessages,
  isProbablyBinary,
  planChatFiles,
  runExplainTask,
  systemBlocks,
} from './tasks'
import { getRepoContext } from './context'
import { CONTENTS, makeFixture } from './testFixtures'
import type { AiContext } from './types'

const client = vi.hoisted(() => ({ streamText: vi.fn(), generateStructured: vi.fn() }))

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, streamText: client.streamText, generateStructured: client.generateStructured }
})

function makeCtx(overrides: Partial<AiContext> = {}): AiContext {
  const { analysis, snapshot } = makeFixture()
  return {
    apiKey: 'sk-ant-test',
    model: 'claude-opus-5-5',
    level: 'beginner',
    contextSize: 'small',
    analysis,
    snapshot,
    getFileContent: vi.fn(async (path: string) => {
      if (path === 'assets/logo.png') throw new Error('binary')
      return `// downloaded ${path}`
    }),
    ...overrides,
  }
}

function lastRequest(mock: ReturnType<typeof vi.fn>): ClaudeRequest {
  return mock.mock.calls.at(-1)![0] as ClaudeRequest
}

function userText(r: ClaudeRequest): string {
  const content = r.messages.at(-1)!.content
  return typeof content === 'string' ? content : ''
}

beforeEach(() => {
  client.streamText.mockReset()
  client.generateStructured.mockReset()
  client.streamText.mockResolvedValue({ text: 'An answer', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } })
})

describe('system blocks', () => {
  it('are the fixed instructions plus the cached repo context, identical for every task', async () => {
    const ctx = makeCtx()
    await runExplainTask(ctx, { kind: 'overview' })
    const a = lastRequest(client.streamText).system
    await runExplainTask(ctx, { kind: 'file', path: 'src/App.tsx' })
    const b = lastRequest(client.streamText).system
    await askQuestion(ctx, [], 'How does the cart work?')
    const c = lastRequest(client.streamText).system
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(a).toHaveLength(2)
    expect(a[0]).toEqual({ type: 'text', text: SYSTEM_INSTRUCTIONS })
    // 1-hour cache: readers take more than 5 minutes between questions.
    expect(a[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(a[1].text).toContain('<repository name="acme/shop"')
    expect(JSON.stringify(a)).not.toContain(levelGuidance('beginner'))
    expect(systemBlocks(ctx)).toEqual(a)
  })
})

describe('runExplainTask', () => {
  it('uses high effort for the overview and medium for focused tasks', async () => {
    const ctx = makeCtx()
    await runExplainTask(ctx, { kind: 'overview' })
    expect(lastRequest(client.streamText).effort).toBe('high')
    await runExplainTask(ctx, { kind: 'module', moduleId: 'src' })
    expect(lastRequest(client.streamText).effort).toBe('medium')
  })

  it('puts the full file content in the user message (downloading it when needed)', async () => {
    const ctx = makeCtx()
    await runExplainTask(ctx, { kind: 'file', path: 'src/App.tsx' })
    expect(userText(lastRequest(client.streamText))).toContain('4 | export function App() {')
    expect(ctx.getFileContent).not.toHaveBeenCalled()

    await runExplainTask(ctx, { kind: 'file', path: 'lib/remote.ts' })
    expect(ctx.getFileContent).toHaveBeenCalledWith('lib/remote.ts')
    expect(userText(lastRequest(client.streamText))).toContain('// downloaded lib/remote.ts')
  })

  it('selection tasks include the numbered lines', async () => {
    await runExplainTask(makeCtx(), { kind: 'selection', path: 'src/App.tsx', startLine: 4, endLine: 5 })
    const text = userText(lastRequest(client.streamText))
    expect(text).toContain('» 4 | export function App() {')
    expect(text).toContain('## Line by line')
  })

  it('passes model, key and callbacks through and returns the text', async () => {
    const onText = vi.fn()
    const text = await runExplainTask(makeCtx({ model: 'claude-haiku-5-5' }), { kind: 'tech', techId: 'react' }, { onText })
    expect(text).toBe('An answer')
    const r = lastRequest(client.streamText)
    expect(r.model).toBe('claude-haiku-5-5')
    expect(r.apiKey).toBe('sk-ant-test')
    expect(client.streamText.mock.calls[0][1]).toMatchObject({ onText })
  })

  it('needs a key', async () => {
    await expect(runExplainTask(makeCtx({ apiKey: '' }), { kind: 'overview' })).rejects.toMatchObject({ kind: 'no-key' })
  })
})

describe('structured tasks', () => {
  it('generateConceptMap validates the output', async () => {
    client.generateStructured.mockResolvedValue({
      data: {
        concepts: [
          { id: 'Cart', name: 'Cart', emoji: '🛒', category: 'data', summary: 's', explanation: 'e', analogy: 'a', files: ['src/state/cart.ts', 'nope.ts'], importance: 7 },
          { id: 'screen', name: 'Screen', emoji: '🖼️', category: 'feature', summary: 's', explanation: 'e', analogy: 'a', files: [], importance: 2 },
        ],
        relations: [{ from: 'cart', to: 'screen', label: 'is shown on' }, { from: 'cart', to: 'ghost', label: 'x' }],
      },
      usage: {},
    })
    const map = await generateConceptMap(makeCtx())
    expect(lastRequest(client.generateStructured).effort).toBe('high')
    expect(map.source).toBe('ai')
    expect(map.concepts[0]).toMatchObject({ id: 'cart', files: ['src/state/cart.ts'], importance: 5 })
    expect(map.relations).toEqual([{ from: 'cart', to: 'screen', label: 'is shown on' }])
  })

  it('generateConceptMap rejects an empty map', async () => {
    client.generateStructured.mockResolvedValue({ data: { concepts: [], relations: [] }, usage: {} })
    await expect(generateConceptMap(makeCtx())).rejects.toMatchObject({ kind: 'bad-output' })
  })

  it('generateTours checks snippets against the real file text', async () => {
    client.generateStructured.mockResolvedValue({
      data: {
        tours: [
          {
            id: 'start',
            title: 'Start',
            question: 'How does it start?',
            emoji: '🚀',
            summary: 's',
            steps: [
              { title: 'a', explanation: 'b', file: './src/main.tsx', snippet: "import { App } from './App'", moduleId: 'src' },
              { title: 'c', explanation: 'd', file: 'lib/remote.ts', snippet: 'not in file', moduleId: null },
            ],
          },
        ],
      },
      usage: {},
    })
    const ctx = makeCtx()
    ctx.analysis.files['lib/remote.ts'] = { ...ctx.analysis.files['src/api/client.ts'], path: 'lib/remote.ts', fetched: false }
    const tours = await generateTours(ctx)
    expect(tours[0].steps[0]).toMatchObject({ file: 'src/main.tsx', snippet: "import { App } from './App'" })
    expect(ctx.getFileContent).toHaveBeenCalledWith('lib/remote.ts')
    expect(tours[0].steps[1]).toMatchObject({ file: 'lib/remote.ts', snippet: null })
    expect(tours[0].source).toBe('ai')
  })

  it('generateTours with a question asks for one custom tour', async () => {
    client.generateStructured.mockResolvedValue({
      data: {
        tours: [
          { id: 'cart', title: 'Cart', question: '', emoji: '🛒', summary: '', steps: [{ title: 'a', explanation: 'b', file: null, snippet: null, moduleId: null }] },
          { id: 'extra', title: 'Extra', question: '', emoji: '🛒', summary: '', steps: [{ title: 'a', explanation: 'b', file: null, snippet: null, moduleId: null }] },
        ],
      },
      usage: {},
    })
    const tours = await generateTours(makeCtx(), { question: 'How does the cart work?', takenIds: new Set(['cart']) })
    expect(userText(lastRequest(client.generateStructured))).toContain('How does the cart work?')
    expect(tours).toHaveLength(1)
    expect(tours[0]).toMatchObject({ id: 'cart-2', question: 'How does the cart work?' })
  })

  it('generateQuiz keeps only valid questions', async () => {
    client.generateStructured.mockResolvedValue({
      data: {
        questions: [
          { question: 'Where is the cart kept?', options: ['src/state/cart.ts', 'README.md', 'package.json'], answerIndex: 0, explanation: 'x' },
          { question: 'Broken', options: ['a', 'b', 'c'], answerIndex: 7, explanation: '' },
        ],
      },
      usage: {},
    })
    const quiz = await generateQuiz(makeCtx())
    expect(quiz.questions).toHaveLength(1)
    expect(lastRequest(client.generateStructured).effort).toBe('high')
  })
})

describe('askQuestion', () => {
  const msg = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: Math.random().toString(36),
    role,
    content,
    createdAt: 0,
    ...extra,
  })

  it('includes relevant files and prior history as alternating messages', async () => {
    const history = [msg('user', 'What is this?'), msg('assistant', 'A shop.'), msg('user', 'Failed one'), msg('assistant', '', { error: 'busy' })]
    await askQuestion(makeCtx(), history, 'How does the shopping cart remember items?')
    const r = lastRequest(client.streamText)
    expect(r.effort).toBe('medium')
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(r.messages[0].content).toBe('What is this?')
    const text = userText(r)
    // cart.ts is already in the (cached) repository context in full: named, not sent again.
    expect(getRepoContext(makeCtx().analysis, makeCtx().snapshot, 'small').coverage['src/state/cart.ts']).toBeDefined()
    expect(text).not.toContain('<file path="src/state/cart.ts"')
    expect(text).toContain('already in the project material above: `src/state/cart.ts`')
    expect(text).toContain('<question>\nHow does the shopping cart remember items?\n</question>')
  })

  it('sends only what the shared context does not already show', async () => {
    const ctx = makeCtx({ contextSize: 'small' })
    const long = Array.from({ length: 4000 }, (_, i) => `export const cartItem${i} = ${i} // remembers cart items`).join('\n')
    ctx.snapshot.files['src/state/cart.ts'] = long
    ctx.analysis.files['src/state/cart.ts'].lines = 4000
    const cov = getRepoContext(ctx.analysis, ctx.snapshot, 'small').coverage['src/state/cart.ts']
    expect(cov.totalLines).toBe(4000)
    expect(cov.shownLines).toBeLessThan(4000)
    expect(cov.shownLines).toBeGreaterThan(10)

    const plan = await planChatFiles(ctx, 'How does the cart remember items?', { contextSize: 'small', maxFiles: 6 })
    const cart = plan.files.find((f) => f.path === 'src/state/cart.ts')
    expect(cart?.fromLine).toBe(cov.shownLines + 1)

    await askQuestion(ctx, [], 'How does the cart remember items?')
    const text = userText(lastRequest(client.streamText))
    expect(text).toContain(`<file path="src/state/cart.ts" lines="4000" from_line="${cov.shownLines + 1}">`)
    expect(text).toContain(`Lines 1–${cov.shownLines} of this file are already in the project material above`)
    // The first line is in the context, so it isn't repeated in the question.
    expect(text).not.toContain('export const cartItem0 = 0')
    expect(text).toContain(`export const cartItem${cov.shownLines} = ${cov.shownLines}`)
  })

  it('puts tests after real source files unless the question is about tests', async () => {
    const { analysis } = makeFixture()
    analysis.files['tests/test_cart.py'] = {
      ...analysis.files['src/state/cart.ts'],
      path: 'tests/test_cart.py',
      dir: 'tests',
      name: 'test_cart.py',
      kind: 'test',
      symbols: [
        { name: 'test_cart_adds', kind: 'function', line: 1, exported: false },
        { name: 'test_cart_removes', kind: 'function', line: 5, exported: false },
        { name: 'test_cart_total', kind: 'function', line: 9, exported: false },
      ],
    }
    analysis.files['tests/type_check/typing_cart.py'] = { ...analysis.files['tests/test_cart.py'], path: 'tests/type_check/typing_cart.py', kind: 'source' }
    const picked = pickRelevantFiles(analysis, 'How does the cart work?')
    expect(picked[0]).toBe('src/state/cart.ts')
    expect(picked.indexOf('tests/test_cart.py')).toBeGreaterThan(picked.indexOf('src/state/cart.ts'))
    expect(pickRelevantFiles(analysis, 'How is the cart tested?')[0]).toMatch(/^tests\//)
  })

  it('keeps at most the last 12 history messages', () => {
    const history: ChatMessage[] = []
    for (let i = 0; i < 20; i++) history.push(msg('user', `q${i}`), msg('assistant', `a${i}`))
    const out = historyToMessages(history)
    expect(out).toHaveLength(12)
    expect(out[0]).toEqual({ role: 'user', content: 'q14' })
    expect(out.at(-1)).toEqual({ role: 'assistant', content: 'a19' })
  })
})

describe('relevance', () => {
  it('extracts meaningful query terms', () => {
    expect(queryTerms('How does the shopping cart work?')).toEqual(['shopp', 'cart'])
  })

  it('picks files named in the question first, then keyword matches', () => {
    const { analysis } = makeFixture()
    const picked = pickRelevantFiles(analysis, 'What does Button.tsx do with the cart?')
    expect(picked[0]).toBe('src/components/Button.tsx')
    expect(picked).toContain('src/state/cart.ts')
    expect(pickRelevantFiles(analysis, 'How are products fetched?')).toContain('src/api/client.ts')
    expect(pickRelevantFiles(analysis, 'hello')).toEqual([])
    expect(pickRelevantFiles(analysis, 'cart', 1)).toHaveLength(1)
    expect(pickRelevantFiles(analysis, 'Explain src/state/cart.ts please')[0]).toBe('src/state/cart.ts')
  })

  it('does not treat numbered names as prefixes of each other', () => {
    const { analysis } = makeFixture({ extraSources: 20 })
    expect(pickRelevantFiles(analysis, 'what is in module12?')).toEqual(['lib/part0012/module12.ts'])
  })
})

describe('buildCopyPrompt', () => {
  it('is self-contained: instructions, level guidance, small context and the task', async () => {
    const { apiKey: _k, model: _m, ...input } = makeCtx({ contextSize: 'large', level: 'eli5' })
    const p = await buildCopyPrompt(input, { kind: 'file', path: 'src/App.tsx' })
    expect(p).toContain('# Help me understand the GitHub project acme/shop')
    expect(p).toContain(SYSTEM_INSTRUCTIONS)
    expect(p).toContain(levelGuidance('eli5'))
    expect(p).toContain('<repository name="acme/shop"')
    expect(p).toContain('## In one sentence')
    expect(p).toContain(CONTENTS['src/App.tsx'].split('\n')[0])
    expect(p.length).toBeLessThan(30_000 * 4 + 20_000)
  })

  it('attaches a concept’s files when they are not in the small context it embeds (even if Settings uses a bigger one)', async () => {
    const ctx = makeCtx({ contextSize: 'large' })
    const { apiKey: _k, model: _m, ...input } = ctx
    // A file the big context has but the small one (used for copy prompts) doesn't.
    const big = Array.from({ length: 50 }, (_, i) => `// filler line ${i} to make the project larger than the small context`).join('\n')
    for (let i = 0; i < 40; i++) {
      const p = `src/filler/f${i}.ts`
      input.snapshot.files[p] = big
      input.analysis.files[p] = { ...input.analysis.files['src/api/client.ts'], path: p, importedBy: Array.from({ length: 10 }, () => 'src/App.tsx') }
    }
    input.snapshot.files['src/late/deep.ts'] = 'export const sessionStore = new Map() // where sessions live'
    input.analysis.files['src/late/deep.ts'] = { ...input.analysis.files['src/api/client.ts'], path: 'src/late/deep.ts' }
    const small = new Set(getRepoContext(input.analysis, input.snapshot, 'small').includedFiles)
    const large = new Set(getRepoContext(input.analysis, input.snapshot, 'large').includedFiles)
    expect(small.has('src/late/deep.ts')).toBe(false)
    expect(large.has('src/late/deep.ts')).toBe(true)
    const concept = { id: 'sessions', name: 'Sessions', emoji: '🍪', category: 'process' as const, summary: 's', explanation: '', analogy: '', files: ['src/late/deep.ts'], importance: 4 }
    const p = await buildCopyPrompt(input, { kind: 'concept', concept })
    expect(p).toContain('<file path="src/late/deep.ts"')
    expect(p).toContain('export const sessionStore')
  })

  it('asks for readable markdown for concept maps, tours and quizzes', async () => {
    const { apiKey: _k, model: _m, ...input } = makeCtx()
    expect(await buildCopyPrompt(input, { kind: 'concepts' })).toContain('## How the ideas connect')
    expect(await buildCopyPrompt(input, { kind: 'quiz' })).toContain('## Answers')
    expect(await buildCopyPrompt(input, { kind: 'tours', question: 'How does checkout work?' })).toContain('How does checkout work?')
    expect(await buildCopyPrompt(input, { kind: 'chat', question: 'Where is the cart?' })).toContain('<file path="src/state/cart.ts"')
  })
})

describe('isProbablyBinary', () => {
  it('spots images, fonts and NUL bytes', () => {
    expect(isProbablyBinary('assets/logo.png')).toBe(true)
    expect(isProbablyBinary('fonts/a.woff2')).toBe(true)
    expect(isProbablyBinary('src/a.ts', 'ok')).toBe(false)
    expect(isProbablyBinary('data/blob', 'a\u0000b')).toBe(true)
  })
})

describe('explainTaskKey', () => {
  it('is stable and distinguishes tasks', () => {
    const c = makeFixture().analysis.starterConcepts.concepts[0]
    const keys = [
      explainTaskKey({ kind: 'overview' }),
      explainTaskKey({ kind: 'module', moduleId: 'src' }),
      explainTaskKey({ kind: 'file', path: 'src' }),
      explainTaskKey({ kind: 'folder', path: 'src' }),
      explainTaskKey({ kind: 'selection', path: 'src/a.ts', startLine: 1, endLine: 2 }),
      explainTaskKey({ kind: 'concept', concept: c }),
      explainTaskKey({ kind: 'concept', concept: { ...c, summary: 'different' } }),
      explainTaskKey({ kind: 'tech', techId: 'react' }),
      explainTaskKey({ kind: 'term', termId: 'react' }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
    expect(explainTaskKey({ kind: 'concept', concept: { ...c } })).toBe(keys[5])
  })
})
