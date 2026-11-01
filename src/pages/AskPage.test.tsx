import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { AiRunState } from '@/ai'
import { makeFixture } from '@/ai/testFixtures'
import { LocationProbe, stubBrowser } from '@/components/shell/testUtils'
import type { ChatMessage } from '@/core/types'
import { useExplain } from '@/state/explain'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import AskPage from './AskPage'

vi.mock('@/components/code/highlighter', () => ({ highlightLines: () => new Promise(() => {}), preloadHighlighter: () => {} }))

const chat = vi.hoisted(() => ({
  current: null as null | {
    messages: ChatMessage[]
    send: ReturnType<typeof vi.fn>
    state: AiRunState
    aiStatus: null
    error: string | null
    errorKind: string | null
    cancel: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
  },
}))

vi.mock('@/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/ai')>()
  return { ...mod, useChat: () => chat.current ?? mod.useChat() }
})

const MESSAGES: ChatMessage[] = [
  { id: '1', role: 'user', content: 'Where does it start?', createdAt: 1 },
  { id: '2', role: 'assistant', content: 'It starts in `src/main.tsx`.', createdAt: 2 },
]

function renderAsk(state: AiRunState) {
  chat.current = { messages: MESSAGES, send: vi.fn(), state, aiStatus: null, error: null, errorKind: null, cancel: vi.fn(), clear: vi.fn() }
  const router = createMemoryRouter(
    [
      {
        path: '/gh/:owner/:repo',
        children: [
          { path: 'ask', element: <><AskPage /><LocationProbe /></> },
          { path: 'explore', element: <LocationProbe /> },
        ],
      },
    ],
    { initialEntries: ['/gh/acme/shop/ask'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  stubBrowser()
  const { analysis, snapshot } = makeFixture()
  useRepoStore.setState({ key: 'acme/shop', ref: { owner: 'acme', repo: 'shop' }, status: 'ready', analysis, snapshot, error: null, progress: null })
  useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
  useExplain.setState({ target: null, history: [] })
})

describe('AskPage file links', () => {
  it('while Claude is still answering, a file link opens the side panel instead of leaving the chat', async () => {
    const user = userEvent.setup()
    renderAsk('streaming')
    await user.click(screen.getByRole('button', { name: 'src/main.tsx' }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/main.tsx' })
    expect(screen.getByTestId('location')).toHaveTextContent('/gh/acme/shop/ask')
    expect(chat.current?.cancel).not.toHaveBeenCalled()
  })

  it('once the answer is complete, a file link opens it in Read the Code', async () => {
    const user = userEvent.setup()
    renderAsk('done')
    await user.click(screen.getByRole('button', { name: 'src/main.tsx' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/gh/acme/shop/explore?file=src%2Fmain.tsx')
    expect(useExplain.getState().target).toBeNull()
  })
})
