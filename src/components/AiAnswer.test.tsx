import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiRunState, AiStatus } from '@/ai'
import { makeFixture } from '@/ai/testFixtures'
import { stubBrowser } from '@/components/shell/testUtils'
import { useExplain } from '@/state/explain'
import { useRepoStore } from '@/state/repo'
import { useUi } from '@/state/ui'
import { AiAnswer, statusText } from './AiAnswer'

interface FakeExplanation {
  text: string
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  errorKind: string | null
  fromCache: boolean
  run: () => void
  cancel: () => void
}

const mocks = vi.hoisted(() => ({
  hasKey: false,
  explanation: null as FakeExplanation | null,
  buildPrompt: vi.fn(),
  useExplanation: vi.fn(),
}))

vi.mock('@/ai', () => ({
  useHasAiKey: () => mocks.hasKey,
  useExplanation: (...args: unknown[]) => {
    mocks.useExplanation(...args)
    return mocks.explanation
  },
  useCopyPrompt: () => mocks.buildPrompt,
}))

function explanation(over: Partial<FakeExplanation> = {}): FakeExplanation {
  return { text: '', state: 'idle', aiStatus: null, error: null, errorKind: null, fromCache: false, run: vi.fn(), cancel: vi.fn(), ...over }
}

beforeEach(() => {
  stubBrowser()
  mocks.hasKey = false
  mocks.explanation = explanation()
  mocks.buildPrompt.mockReset().mockResolvedValue('PROMPT TEXT')
  mocks.useExplanation.mockReset()
  useRepoStore.setState({ analysis: makeFixture().analysis, status: 'ready' })
  useExplain.setState({ target: null, history: [] })
  useUi.setState({ settingsOpen: false, settingsSection: 'ai' })
})

describe('AiAnswer', () => {
  it('without a key: offers to add one, a ready-made prompt and claude.ai', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<AiAnswer task={{ kind: 'overview' }} title="Claude’s explanation" cta="Explain this project in depth" />)

    expect(screen.getByTestId('ai-no-key')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /explain this project in depth/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open claude\.ai/i })).toHaveAttribute('href', 'https://claude.ai/new')

    await user.click(screen.getByRole('button', { name: /add your claude api key/i }))
    expect(useUi.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'ai' })

    await user.click(screen.getByRole('button', { name: /copy a ready-made prompt/i }))
    expect(mocks.buildPrompt).toHaveBeenCalledWith({ kind: 'overview' })
    expect(writeText).toHaveBeenCalledWith('PROMPT TEXT')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('falls back to a text box when the clipboard is blocked', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    render(<AiAnswer task={{ kind: 'overview' }} />)
    await user.click(screen.getByRole('button', { name: /copy a ready-made prompt/i }))
    expect(await screen.findByRole('textbox')).toHaveValue('PROMPT TEXT')
  })

  it('with a key: the button runs Claude', async () => {
    const user = userEvent.setup()
    mocks.hasKey = true
    render(<AiAnswer task={{ kind: 'file', path: 'src/App.tsx' }} cta="Explain this file in depth" autoRun />)
    expect(mocks.useExplanation).toHaveBeenCalledWith({ kind: 'file', path: 'src/App.tsx' }, { autoRun: true })
    await user.click(screen.getByRole('button', { name: 'Explain this file in depth' }))
    expect(mocks.explanation!.run).toHaveBeenCalled()
  })

  it('shows a cached answer as "Saved answer", even without a key, with clickable file links', async () => {
    const user = userEvent.setup()
    mocks.explanation = explanation({ text: 'It starts in `src/main.tsx`.', state: 'done', fromCache: true })
    render(<AiAnswer task={{ kind: 'overview' }} />)
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Saved answer')
    expect(screen.queryByTestId('ai-no-key')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'src/main.tsx' }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/main.tsx' })
  })

  it('offers Regenerate on a finished answer when a key exists', async () => {
    const user = userEvent.setup()
    mocks.hasKey = true
    mocks.explanation = explanation({ text: 'Done.', state: 'done', fromCache: true })
    render(<AiAnswer task={{ kind: 'overview' }} />)
    await user.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(mocks.explanation.run).toHaveBeenCalled()
  })

  it('streams with a status line and a Stop button', async () => {
    const user = userEvent.setup()
    mocks.hasKey = true
    mocks.explanation = explanation({ text: 'Half an ans', state: 'streaming', aiStatus: 'writing' })
    render(<AiAnswer task={{ kind: 'overview' }} />)
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Writing…')
    expect(screen.getByText('Half an ans')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stop/i }))
    expect(mocks.explanation.cancel).toHaveBeenCalled()
  })

  it('sends bad-key errors to Settings', async () => {
    const user = userEvent.setup()
    mocks.hasKey = true
    mocks.explanation = explanation({ state: 'error', error: 'Claude didn’t accept your API key.', errorKind: 'invalid-key' })
    render(<AiAnswer task={{ kind: 'overview' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/didn’t accept your API key/)
    await user.click(screen.getByRole('button', { name: /open settings/i }))
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('statusText', () => {
  it('describes each stage in plain words', () => {
    expect(statusText('loading', 'connecting', false)).toBe('Claude is reading the code…')
    expect(statusText('loading', 'thinking', false)).toBe('Claude is reading the code…')
    expect(statusText('streaming', 'writing', false)).toBe('Writing…')
    expect(statusText('done', null, true)).toBe('Saved answer')
    expect(statusText('done', 'done', false)).toBeNull()
  })
})
