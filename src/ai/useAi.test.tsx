import { act, renderHook, waitFor } from '@testing-library/react'
import type { Tour } from '@/core/types'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { aiCacheKey, clearAiCache, getCachedAi, setCachedAi } from './cache'
import { makeFixture } from './testFixtures'
import { AiError, type ExplainTask, type StreamCallbacks } from './types'
import { useAiContext, useChat, useConceptMap, useCopyPrompt, useExplanation, useHasAiKey, useTours } from './useAi'

const tasks = vi.hoisted(() => ({
  runExplainTask: vi.fn(),
  generateConceptMap: vi.fn(),
  generateTours: vi.fn(),
  generateQuiz: vi.fn(),
  askQuestion: vi.fn(),
}))

vi.mock('./tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tasks')>()
  return { ...actual, ...tasks }
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const FILE_TASK: ExplainTask = { kind: 'file', path: 'src/App.tsx' }

function explainKey(task = 'file:src/App.tsx') {
  return aiCacheKey(['explain', 'acme/shop', 'abc123', 'claude-opus-5-5', 'beginner', 'medium', task])
}

beforeEach(async () => {
  await clearAiCache()
  for (const fn of Object.values(tasks)) fn.mockReset()
  const { analysis, snapshot } = makeFixture()
  useRepoStore.setState({ analysis, snapshot, status: 'ready' })
  useSettings.setState({ anthropicApiKey: 'sk-ant-test', model: 'claude-opus-5-5', readingLevel: 'beginner', contextSize: 'medium' })
})

describe('context hooks', () => {
  it('useAiContext is null without a key or repo', () => {
    const { result, rerender } = renderHook(() => ({ ctx: useAiContext(), has: useHasAiKey() }))
    expect(result.current.ctx).toMatchObject({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5', level: 'beginner', contextSize: 'medium' })
    expect(result.current.has).toBe(true)
    act(() => useSettings.setState({ anthropicApiKey: '   ' }))
    rerender()
    expect(result.current.ctx).toBeNull()
    expect(result.current.has).toBe(false)
    act(() => useSettings.setState({ anthropicApiKey: 'sk-ant-test' }))
    act(() => useRepoStore.setState({ analysis: null }))
    rerender()
    expect(result.current.ctx).toBeNull()
  })

  it('useAiContext is memoized', () => {
    const { result, rerender } = renderHook(() => useAiContext())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('useExplanation', () => {
  it('goes idle → loading → streaming → done and caches the answer', async () => {
    const d = deferred<string>()
    let cb: StreamCallbacks | undefined
    tasks.runExplainTask.mockImplementation((_ctx, _task, callbacks: StreamCallbacks) => {
      cb = callbacks
      return d.promise
    })
    const { result } = renderHook(() => useExplanation(FILE_TASK))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(tasks.runExplainTask).not.toHaveBeenCalled()

    act(() => result.current.run())
    expect(result.current.state).toBe('loading')
    expect(result.current.aiStatus).toBe('connecting')

    act(() => {
      cb?.onStatus?.('writing')
      cb?.onText?.('Hel')
    })
    expect(result.current.state).toBe('streaming')
    expect(result.current.text).toBe('Hel')
    expect(result.current.aiStatus).toBe('writing')

    await act(async () => d.resolve('Hello there'))
    expect(result.current).toMatchObject({ state: 'done', text: 'Hello there', fromCache: false, error: null })
    await waitFor(async () => expect(await getCachedAi(explainKey())).toBe('Hello there'))
  })

  it('loads a cached answer without calling Claude', async () => {
    await setCachedAi(explainKey(), 'Cached answer')
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(result.current).toMatchObject({ text: 'Cached answer', fromCache: true })
    expect(tasks.runExplainTask).not.toHaveBeenCalled()
  })

  it('autoRun calls Claude when nothing is cached', async () => {
    tasks.runExplainTask.mockResolvedValue('Fresh')
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(result.current.text).toBe('Fresh')
    expect(tasks.runExplainTask).toHaveBeenCalledTimes(1)
  })

  it('cancel aborts the request and restores the previous answer', async () => {
    await setCachedAi(explainKey(), 'Old answer')
    let signal: AbortSignal | undefined
    tasks.runExplainTask.mockImplementation((_c, _t, cb: StreamCallbacks) => {
      signal = cb.signal
      return new Promise(() => {})
    })
    const { result } = renderHook(() => useExplanation(FILE_TASK))
    await waitFor(() => expect(result.current.text).toBe('Old answer'))
    act(() => result.current.run())
    expect(result.current.state).toBe('loading')
    act(() => result.current.cancel())
    expect(signal?.aborted).toBe(true)
    expect(result.current).toMatchObject({ state: 'done', text: 'Old answer', fromCache: true })
  })

  it('aborts when the task changes or the component unmounts', async () => {
    const signals: AbortSignal[] = []
    tasks.runExplainTask.mockImplementation((_c, _t, cb: StreamCallbacks) => {
      signals.push(cb.signal!)
      return new Promise(() => {})
    })
    const { result, rerender, unmount } = renderHook(({ task }) => useExplanation(task), { initialProps: { task: FILE_TASK } })
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    rerender({ task: { kind: 'file', path: 'src/main.tsx' } })
    expect(signals[0].aborted).toBe(true)
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    unmount()
    expect(signals[1].aborted).toBe(true)
  })

  it('a new object for the same task does not restart anything', async () => {
    tasks.runExplainTask.mockImplementation(() => new Promise(() => {}))
    const { result, rerender } = renderHook(({ task }) => useExplanation(task), { initialProps: { task: { ...FILE_TASK } as ExplainTask } })
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    rerender({ task: { ...FILE_TASK } })
    expect(result.current.state).toBe('loading')
  })

  it('exposes friendly errors and their kind', async () => {
    tasks.runExplainTask.mockRejectedValue(new AiError('rate-limited', 'Slow down a little.'))
    const { result } = renderHook(() => useExplanation(FILE_TASK))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    await act(async () => result.current.run())
    expect(result.current).toMatchObject({ state: 'error', error: 'Slow down a little.', errorKind: 'rate-limited' })
  })

  it('without a key, run() explains how to add one', async () => {
    useSettings.setState({ anthropicApiKey: '' })
    const { result } = renderHook(() => useExplanation(FILE_TASK))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    expect(result.current).toMatchObject({ state: 'error', errorKind: 'no-key' })
    expect(tasks.runExplainTask).not.toHaveBeenCalled()
  })

  it('null task stays idle', () => {
    const { result } = renderHook(() => useExplanation(null))
    act(() => result.current.run())
    expect(result.current.state).toBe('idle')
  })
})

describe('structured hooks', () => {
  it('useConceptMap runs, tracks progress and caches per repo/commit/model/level', async () => {
    const d = deferred<unknown>()
    let cb: StreamCallbacks | undefined
    tasks.generateConceptMap.mockImplementation((_ctx, callbacks: StreamCallbacks) => {
      cb = callbacks
      return d.promise
    })
    const { result } = renderHook(() => useConceptMap())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    act(() => cb?.onText?.('{"concepts": ['))
    expect(result.current).toMatchObject({ state: 'streaming', progressChars: 14 })
    const map = { concepts: [], relations: [], source: 'ai' as const }
    await act(async () => d.resolve(map))
    expect(result.current).toMatchObject({ state: 'done', data: map })
    const key = aiCacheKey(['concepts', 'acme/shop', 'abc123', 'claude-opus-5-5', 'beginner'])
    await waitFor(async () => expect(await getCachedAi(key)).toEqual(map))

    const again = renderHook(() => useConceptMap())
    await waitFor(() => expect(again.result.current.fromCache).toBe(true))
    expect(again.result.current.data).toEqual(map)
  })

  it('useTours.askTour appends a custom tour with a unique id and caches the list', async () => {
    const tour = (id: string, title: string): Tour => ({ id, title, question: title, emoji: '🧭', summary: '', steps: [], source: 'ai' })
    tasks.generateTours.mockImplementation(async (_ctx, opts?: { question?: string }) =>
      opts?.question ? [tour('startup', opts.question)] : [tour('startup', 'Startup'), tour('saving', 'Saving')],
    )
    const { result } = renderHook(() => useTours())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    await act(async () => result.current.run())
    expect(result.current.data?.map((t) => t.id)).toEqual(['startup', 'saving'])

    await act(async () => result.current.askTour('How does it start?'))
    expect(result.current.asking).toBe(false)
    expect(result.current.data?.map((t) => t.id)).toEqual(['startup', 'saving', 'startup-2'])
    expect(tasks.generateTours.mock.calls[1][1]).toMatchObject({ question: 'How does it start?' })
    const key = aiCacheKey(['tours', 'acme/shop', 'abc123', 'claude-opus-5-5', 'beginner'])
    await waitFor(async () => expect((await getCachedAi<Tour[]>(key))?.length).toBe(3))
  })
})

describe('useChat', () => {
  it('streams the reply in place, persists the history and reloads it', async () => {
    const d = deferred<string>()
    let cb: StreamCallbacks | undefined
    tasks.askQuestion.mockImplementation((_ctx, _history, _q, callbacks: StreamCallbacks) => {
      cb = callbacks
      return d.promise
    })
    const { result, unmount } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.send('What is this?'))
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(result.current.state).toBe('loading')
    expect(tasks.askQuestion.mock.calls[0][1]).toEqual([])
    expect(tasks.askQuestion.mock.calls[0][2]).toBe('What is this?')

    act(() => cb?.onText?.('A tiny'))
    expect(result.current.messages[1].content).toBe('A tiny')
    expect(result.current.state).toBe('streaming')
    await act(async () => d.resolve('A tiny shop.'))
    expect(result.current.state).toBe('done')
    expect(result.current.messages[1].content).toBe('A tiny shop.')
    unmount()

    const again = renderHook(() => useChat())
    await waitFor(() => expect(again.result.current.messages).toHaveLength(2))
    expect(again.result.current.messages[1].content).toBe('A tiny shop.')

    // The earlier exchange is passed as history next time.
    tasks.askQuestion.mockResolvedValue('Second answer')
    await act(async () => again.result.current.send('And then?'))
    expect(tasks.askQuestion.mock.calls[1][1]).toHaveLength(2)
    expect(again.result.current.messages).toHaveLength(4)

    act(() => again.result.current.clear())
    expect(again.result.current.messages).toEqual([])
    const key = aiCacheKey(['chat', 'acme/shop', 'abc123'])
    await waitFor(async () => expect(await getCachedAi(key)).toEqual([]))
  })

  it('records errors on the reply and exposes their kind', async () => {
    tasks.askQuestion.mockRejectedValue(new AiError('overloaded', 'Claude is very busy right now. Please try again in a minute.'))
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    await act(async () => result.current.send('Hi'))
    expect(result.current).toMatchObject({ state: 'error', errorKind: 'overloaded' })
    expect(result.current.messages[1].error).toMatch(/very busy/)
  })

  it('cancel keeps a partial reply with a note', async () => {
    let cb: StreamCallbacks | undefined
    tasks.askQuestion.mockImplementation(
      (_ctx, _h, _q, callbacks: StreamCallbacks) =>
        new Promise((_res, rej) => {
          cb = callbacks
          callbacks.signal?.addEventListener('abort', () => rej(new AiError('aborted', 'Stopped.')))
        }),
    )
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.send('Hi'))
    act(() => cb?.onText?.('Half an'))
    await act(async () => result.current.cancel())
    expect(result.current.state).toBe('idle')
    expect(result.current.messages[1].content).toMatch(/^Half an\n\n_\(You stopped this answer\.\)_$/)
  })

  it('needs a key', async () => {
    useSettings.setState({ anthropicApiKey: '' })
    const { result } = renderHook(() => useChat())
    act(() => result.current.send('Hi'))
    expect(result.current).toMatchObject({ state: 'error', errorKind: 'no-key' })
    expect(result.current.messages).toEqual([])
  })
})

describe('useCopyPrompt', () => {
  it('works without an API key', async () => {
    useSettings.setState({ anthropicApiKey: '', readingLevel: 'expert' })
    const { result } = renderHook(() => useCopyPrompt())
    const prompt = await result.current({ kind: 'overview' })
    expect(prompt).toContain('acme/shop')
    expect(prompt).toContain('## What is this?')
    expect(prompt).toMatch(/developer who is new to this codebase/)
  })
})
