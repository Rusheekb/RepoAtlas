import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { AiRunState, StructuredAi } from '@/ai'
import { makeFile, makeFixture } from '@/ai/testFixtures'
import { LocationProbe, stubBrowser } from '@/components/shell/testUtils'
import type { ChatMessage, Quiz, RepoAnalysis } from '@/core/types'
import AskPage from '@/pages/AskPage'
import ExplorerPage from '@/pages/ExplorerPage'
import QuizPage from '@/pages/QuizPage'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'

// Code stays as plain text in these tests (no Shiki).
vi.mock('@/components/code/highlighter', () => ({ highlightLines: () => new Promise(() => {}), preloadHighlighter: () => {} }))

interface ChatMock {
  messages: ChatMessage[]
  send: ReturnType<typeof vi.fn>
  state: AiRunState
  aiStatus: null
  error: string | null
  errorKind: string | null
  cancel: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  chat: null as ChatMock | null,
  quiz: null as StructuredAi<Quiz> | null,
}))

vi.mock('@/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/ai')>()
  return {
    ...mod,
    useChat: () => mocks.chat ?? mod.useChat(),
    useQuiz: () => mocks.quiz ?? mod.useQuiz(),
  }
})

let analysis: RepoAnalysis
const getFileContent = vi.fn<(path: string) => Promise<string>>()

function setup() {
  const fx = makeFixture()
  analysis = fx.analysis
  analysis.files['src/App.tsx'].symbols = [{ name: 'App', kind: 'component', line: 4, exported: true }]
  analysis.files['docs/guide.md'] = makeFile('docs/guide.md', { fetched: false, kind: 'docs', role: 'docs', layer: 'docs', language: 'Markdown', moduleId: '(root)' })
  getFileContent.mockReset()
  getFileContent.mockImplementation((p) => (p in fx.snapshot.files ? Promise.resolve(fx.snapshot.files[p]) : Promise.resolve('# Guide\n\nHello from the guide.\n')))
  useRepoStore.setState({
    key: 'acme/shop',
    ref: { owner: 'acme', repo: 'shop' },
    status: 'ready',
    analysis,
    snapshot: { ...fx.snapshot, skipped: [{ path: 'assets/logo.png', reason: 'binary' }] },
    error: null,
    progress: null,
    getFileContent,
  })
}

function renderPage(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/gh/:owner/:repo',
        children: [
          { path: 'explore', element: <><ExplorerPage /><LocationProbe /></> },
          { path: 'ask', element: <><AskPage /><LocationProbe /></> },
          { path: 'quiz', element: <><QuizPage /><LocationProbe /></> },
        ],
      },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

const location = () => screen.getByTestId('location').textContent ?? ''

beforeEach(() => {
  stubBrowser()
  setup()
  mocks.chat = null
  mocks.quiz = null
  useExplain.setState({ target: null, history: [] })
  useProgress.setState({ seen: {}, recent: [] })
  useUi.setState({ settingsOpen: false, settingsSection: 'ai', navOpen: false })
  useSettings.setState({ anthropicApiKey: '' })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('ExplorerPage', () => {
  it('opens the README by default, formatted, with the file list and notes alongside', async () => {
    renderPage('/gh/acme/shop/explore')
    expect(screen.getByRole('heading', { name: /Read the Code/ })).toBeInTheDocument()
    expect(screen.getByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /^README\.md/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Shop', level: 1 })).toBeInTheDocument()
    const about = screen.getByTestId('about-file')
    expect(within(about).getByText('About this file')).toBeInTheDocument()
    expect(within(about).getByRole('button', { name: /Add your Claude API key/ })).toBeInTheDocument()
    expect(useProgress.getState().isSeen('acme/shop', 'file:README.md')).toBe(true)

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Raw text' }))
    expect(screen.getByTestId('code-viewer')).toHaveTextContent('A tiny online shop.')
  })

  it('shows a file with its job, highlights ?line and explains selected lines', async () => {
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/explore?file=src/App.tsx&line=4')
    const pane = screen.getByTestId('code-pane')
    expect(within(pane).getByText('App.tsx')).toBeInTheDocument()
    expect(within(pane).getByText(/UI building block/)).toBeInTheDocument()
    expect(within(pane).getByRole('link', { name: /Open on GitHub/ })).toHaveAttribute('href', 'https://github.com/acme/shop/blob/abc123/src/App.tsx#L4')
    expect(document.querySelector('[data-line="4"]')).toHaveAttribute('data-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'Explain line 4' }))
    const sel = await screen.findByTestId('selection-explain')
    expect(within(sel).getByText('What line 4 does')).toBeInTheDocument()

    // Pick a range with the line numbers: the URL follows.
    const gutter = (n: number) => document.querySelector(`[data-gutter="${n}"]`) as Element
    await user.click(gutter(2))
    await user.keyboard('{Shift>}')
    await user.click(gutter(5))
    await user.keyboard('{/Shift}')
    expect(location()).toContain('line=2-5')
    expect(screen.getByRole('button', { name: 'Explain lines 2–5' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear the selected lines' }))
    expect(location()).not.toContain('line=')
  })

  it('jumps to a symbol from the outline and opens files from the tree', async () => {
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/explore?file=src/App.tsx')
    await user.click(within(screen.getByTestId('outline')).getByRole('button', { name: /App/ }))
    expect(location()).toContain('line=4')

    await user.click(screen.getByRole('treeitem', { name: /^state, folder/ }))
    await user.click(screen.getByRole('treeitem', { name: /^cart\.ts/ }))
    expect(location()).toContain('file=src%2Fstate%2Fcart.ts')
    expect(location()).not.toContain('line=')
    expect(screen.getByTestId('code-viewer')).toHaveTextContent("import { create } from 'zustand'")
  })

  it('downloads files that were not read up front', async () => {
    let resolve: (s: string) => void = () => {}
    getFileContent.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderPage('/gh/acme/shop/explore?file=docs/guide.md')
    expect(screen.getByRole('status', { name: 'Loading the code' })).toBeInTheDocument()
    expect(getFileContent).toHaveBeenCalledWith('docs/guide.md')
    await act(async () => resolve('# Guide\n\nHello from the guide.\n'))
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeInTheDocument()
  })

  it('offers a retry when a download fails', async () => {
    getFileContent.mockRejectedValueOnce(new Error('offline'))
    renderPage('/gh/acme/shop/explore?file=docs/guide.md')
    expect(await screen.findByText(/couldn’t download this file/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('Hello from the guide.')).toBeInTheDocument()
  })

  it('describes pictures and missing files instead of showing code', () => {
    renderPage('/gh/acme/shop/explore?file=assets/logo.png')
    expect(screen.getByRole('img', { name: 'Preview of logo.png' })).toBeInTheDocument()
    expect(screen.getByText(/This is a picture, not code/)).toBeInTheDocument()
  })

  it('opens a folder in the list when ?file= names a folder', () => {
    renderPage('/gh/acme/shop/explore?file=src/state')
    expect(screen.getByText('That’s a folder')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /^state, folder/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('says so when ?file= points nowhere', () => {
    renderPage('/gh/acme/shop/explore?file=nope.ts')
    expect(screen.getByText('We couldn’t find that file')).toBeInTheDocument()
    expect(screen.queryByTestId('about-file')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

function chatMock(over: Partial<ChatMock> = {}): ChatMock {
  return { messages: [], send: vi.fn(), state: 'idle', aiStatus: null, error: null, errorKind: null, cancel: vi.fn(), clear: vi.fn(), ...over }
}

describe('AskPage', () => {
  it('explains how chatting works without a key and copies a prompt for a typed question', async () => {
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/ask')
    expect(screen.getByTestId('ask-no-key')).toHaveTextContent('Chat with Claude about this project')
    await user.click(screen.getByRole('button', { name: /Add your Claude API key/ }))
    expect(useUi.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'ai' })

    // A suggestion fills the box (there's no one to send it to yet).
    await user.click(screen.getByRole('button', { name: 'Where does the program start?' }))
    const box = screen.getByRole('textbox', { name: 'Your question' })
    expect(box).toHaveValue('Where does the program start?')

    await user.click(screen.getByRole('button', { name: /Copy prompt/ }))
    expect(await screen.findByRole('button', { name: /Copied!/ })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toContain('Where does the program start?')
  })

  it('sends questions with Enter, keeps Shift+Enter for new lines, and offers suggestions', async () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    mocks.chat = chatMock()
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/ask')
    expect(screen.getByText('Claude is ready for your questions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'What is React, and how does this project use it?' }))
    expect(mocks.chat.send).toHaveBeenLastCalledWith('What is React, and how does this project use it?')

    const box = screen.getByRole('textbox', { name: 'Your question' })
    await user.type(box, 'First line{Shift>}{Enter}{/Shift}second line')
    expect(box).toHaveValue('First line\nsecond line')
    expect(mocks.chat.send).toHaveBeenCalledTimes(1)
    await user.keyboard('{Enter}')
    expect(mocks.chat.send).toHaveBeenLastCalledWith('First line\nsecond line')
    expect(box).toHaveValue('')
  })

  it('shows the conversation with clickable file names, Stop while answering, and a two-step Clear', async () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    mocks.chat = chatMock({
      state: 'streaming',
      messages: [
        { id: '1', role: 'user', content: 'Where does it start?', createdAt: 1 },
        { id: '2', role: 'assistant', content: 'It starts in `src/main.tsx`.', createdAt: 2 },
      ],
    })
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/ask')
    expect(screen.getByText('Where does it start?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(mocks.chat.cancel).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Clear chat/ }))
    expect(mocks.chat.clear).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Click again to clear/ }))
    expect(mocks.chat.clear).toHaveBeenCalled()

    // While Claude is still answering, a file link opens the Explain panel instead of leaving the page,
    // so the answer being written isn't cancelled.
    await user.click(screen.getByRole('button', { name: 'src/main.tsx' }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/main.tsx' })
    expect(location()).toBe('/gh/acme/shop/ask')
  })

  it('points a bad key at Settings', async () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-bad' })
    mocks.chat = chatMock({
      state: 'error',
      errorKind: 'invalid-key',
      error: 'Claude didn’t accept that key.',
      messages: [
        { id: '1', role: 'user', content: 'Hi', createdAt: 1 },
        { id: '2', role: 'assistant', content: '', createdAt: 2, error: 'Claude didn’t accept that key.' },
      ],
    })
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/ask')
    expect(screen.getByRole('alert')).toHaveTextContent('Claude didn’t accept that key.')
    await user.click(screen.getByRole('button', { name: /Open Settings/ }))
    expect(useUi.getState().settingsOpen).toBe(true)
  })

  it('pre-fills the question from ?q=', () => {
    renderPage('/gh/acme/shop/ask?q=What%20is%20this%3F')
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('What is this?')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

function quizMock(over: Partial<StructuredAi<Quiz>> = {}): StructuredAi<Quiz> {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false, run: vi.fn(), cancel: vi.fn(), ...over }
}

describe('QuizPage', () => {
  it('runs the starter quiz without a key: answer, explanation, score, retry', async () => {
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/quiz')
    expect(screen.getByTestId('ai-callout')).toHaveTextContent('Want Claude’s take?')
    expect(screen.getByText(/Question 1 of \d/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What kind of project is this?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Web application/ }))
    expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('That’s right!')
    expect(screen.getByText('Correct answer')).toBeInTheDocument()

    // Answer the rest (always the first option), using the keyboard.
    for (let i = 0; i < 30 && !screen.queryByTestId('quiz-score'); i++) {
      const next = screen.queryByRole('button', { name: /Next question|See my score/ })
      if (next) await user.click(next)
      else await user.keyboard('1')
    }
    const score = screen.getByTestId('quiz-score')
    expect(score).toHaveTextContent(/You got \d+ out of \d+ right/)
    expect(within(score).getAllByRole('listitem').length).toBeGreaterThanOrEqual(5)

    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument()
  })

  it('offers “Generate a quiz with Claude” with a key, and switches to Claude’s quiz', async () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    mocks.quiz = quizMock()
    const user = userEvent.setup()
    const { rerender } = renderPage('/gh/acme/shop/quiz')
    await user.click(screen.getByRole('button', { name: 'Generate a quiz with Claude' }))
    expect(mocks.quiz.run).toHaveBeenCalled()

    mocks.quiz = quizMock({
      state: 'done',
      data: { questions: [{ question: 'What does Claude ask?', options: ['This', 'That'], answerIndex: 0, explanation: 'Because.' }] },
    })
    rerender(<></>)
    const again = renderPage('/gh/acme/shop/quiz')
    expect(await again.findByRole('heading', { name: 'What does Claude ask?' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio', { name: /Claude’s quiz/ })[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('shows progress with Cancel while Claude writes', async () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    mocks.quiz = quizMock({ state: 'streaming', aiStatus: 'writing', progressChars: 1200 })
    const user = userEvent.setup()
    renderPage('/gh/acme/shop/quiz')
    expect(screen.getByTestId('ai-progress')).toHaveTextContent('Claude is writing your quiz')
    await user.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(mocks.quiz.cancel).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/Question 1 of/)).toBeInTheDocument())
  })
})
