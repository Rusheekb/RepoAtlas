import { act, renderHook, waitFor } from '@testing-library/react'
import { createStore, get as idbGet } from 'idb-keyval'
import type { ChatMessage, Tour } from '@/core/types'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { aiCacheKey, clearAiCache, getAiCacheEntry, getCachedAi, setCachedAi, storedAiResult } from './cache'
import { useAiJobs } from './jobs'
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
const REPO = 'acme/shop'
const SHA = 'abc123'
const MODEL = 'claude-opus-5-5'

function explainKey(task = 'file:src/App.tsx') {
  return aiCacheKey(['explain', REPO, MODEL, 'beginner', task])
}
const conceptsKey = aiCacheKey(['concepts', REPO, MODEL, 'beginner'])
const toursKey = aiCacheKey(['tours', REPO, MODEL, 'beginner'])
const customToursKey = aiCacheKey(['tours-custom', REPO, MODEL, 'beginner'])
const chatKey = aiCacheKey(['chat', REPO])

/** Load the repo fixture, optionally at another commit or as a private repository. */
function loadRepo(opts: { commitSha?: string; isPrivate?: boolean; fullName?: string } = {}) {
  const { analysis, snapshot } = makeFixture()
  if (opts.commitSha) {
    analysis.commitSha = opts.commitSha
    snapshot.commitSha = opts.commitSha
  }
  if (opts.isPrivate !== undefined || opts.fullName) {
    analysis.meta = { ...analysis.meta, isPrivate: opts.isPrivate ?? false, fullName: opts.fullName ?? analysis.meta.fullName }
    snapshot.meta = analysis.meta
  }
  useRepoStore.setState({ analysis, snapshot, status: 'ready' })
}

/** Wait until the hook's saved result has been looked up (so send/run see the real history). */
async function loaded(key: string) {
  await waitFor(() => expect(getAiCacheEntry(key)).toBeDefined())
}

const tour = (id: string, title: string): Tour => ({ id, title, question: title, emoji: '🧭', summary: '', steps: [], source: 'ai' })

beforeEach(async () => {
  await clearAiCache()
  for (const fn of Object.values(tasks)) fn.mockReset()
  loadRepo()
  useSettings.setState({ anthropicApiKey: 'sk-ant-test', model: MODEL, readingLevel: 'beginner', contextSize: 'medium', rememberKeys: false })
})

describe('context hooks', () => {
  it('useAiContext is null without a key or repo', () => {
    const { result, rerender } = renderHook(() => ({ ctx: useAiContext(), has: useHasAiKey() }))
    expect(result.current.ctx).toMatchObject({ apiKey: 'sk-ant-test', model: MODEL, level: 'beginner', contextSize: 'medium' })
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
  it('goes idle → loading → streaming → done and caches the answer with its commit', async () => {
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
    expect(result.current).toMatchObject({ state: 'done', text: 'Hello there', fromCache: false, stale: false, error: null })
    await waitFor(async () => expect(await getCachedAi(explainKey())).toMatchObject({ data: 'Hello there', commitSha: SHA }))
  })

  it('loads a cached answer without calling Claude', async () => {
    await setCachedAi(explainKey(), storedAiResult('Cached answer', SHA))
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(result.current).toMatchObject({ text: 'Cached answer', fromCache: true, stale: false })
    expect(tasks.runExplainTask).not.toHaveBeenCalled()
  })

  it('still finds answers saved by the previous version (commit and context size in the key)', async () => {
    await setCachedAi(aiCacheKey(['explain', REPO, SHA, MODEL, 'beginner', 'medium', 'file:src/App.tsx']), 'Old-format answer')
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.text).toBe('Old-format answer'))
    expect(result.current).toMatchObject({ state: 'done', fromCache: true, stale: false })
    expect(tasks.runExplainTask).not.toHaveBeenCalled()
  })

  it('after new commits it shows the earlier answer marked stale, and does not auto-call Claude', async () => {
    await setCachedAi(explainKey(), storedAiResult('Answer for the old code', 'old999'))
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.text).toBe('Answer for the old code'))
    expect(result.current).toMatchObject({ state: 'done', fromCache: true, stale: true })
    expect(tasks.runExplainTask).not.toHaveBeenCalled()

    tasks.runExplainTask.mockResolvedValue('Fresh answer')
    await act(async () => result.current.run())
    expect(result.current).toMatchObject({ text: 'Fresh answer', stale: false, fromCache: false })
  })

  it('autoRun calls Claude when nothing is cached', async () => {
    tasks.runExplainTask.mockResolvedValue('Fresh')
    const { result } = renderHook(() => useExplanation(FILE_TASK, { autoRun: true }))
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(result.current.text).toBe('Fresh')
    expect(tasks.runExplainTask).toHaveBeenCalledTimes(1)
  })

  it('cancel aborts the request and restores the previous answer', async () => {
    await setCachedAi(explainKey(), storedAiResult('Old answer', SHA))
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

  it('keeps working when the reader opens another task or leaves the view, and saves the answer', async () => {
    const d = deferred<string>()
    let signal: AbortSignal | undefined
    tasks.runExplainTask.mockImplementation((_c, _t, cb: StreamCallbacks) => {
      signal = cb.signal
      return d.promise
    })
    const { result, rerender, unmount } = renderHook(({ task }) => useExplanation(task), { initialProps: { task: FILE_TASK } })
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    rerender({ task: { kind: 'file', path: 'src/main.tsx' } })
    expect(signal?.aborted).toBe(false)
    expect(result.current.state).toBe('idle')
    unmount()
    expect(signal?.aborted).toBe(false)

    // Coming back while Claude is still writing shows the progress …
    const back = renderHook(() => useExplanation(FILE_TASK))
    expect(back.result.current.state).toBe('loading')
    // … and the finished answer, saved even though no component was showing it.
    back.unmount()
    await act(async () => d.resolve('Finished in the background'))
    expect(await getCachedAi(explainKey())).toMatchObject({ data: 'Finished in the background' })
    const again = renderHook(() => useExplanation(FILE_TASK))
    expect(again.result.current).toMatchObject({ state: 'done', text: 'Finished in the background' })
  })

  it('stops when the repository, model or reading level changes', async () => {
    const signals: AbortSignal[] = []
    tasks.runExplainTask.mockImplementation((_c, _t, cb: StreamCallbacks) => {
      signals.push(cb.signal!)
      return new Promise(() => {})
    })
    const { result } = renderHook(() => useExplanation(FILE_TASK))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    act(() => useSettings.setState({ readingLevel: 'expert' }))
    expect(signals[0].aborted).toBe(true)
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    act(() => useSettings.setState({ model: 'claude-haiku-5-5' }))
    expect(signals[1].aborted).toBe(true)
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    act(() => loadRepo({ fullName: 'other/repo' }))
    expect(signals[2].aborted).toBe(true)
    expect(Object.keys(useAiJobs.getState().jobs)).toEqual([])
  })

  it('a new object for the same task does not restart anything', async () => {
    tasks.runExplainTask.mockImplementation(() => new Promise(() => {}))
    const { result, rerender } = renderHook(({ task }) => useExplanation(task), { initialProps: { task: { ...FILE_TASK } as ExplainTask } })
    await waitFor(() => expect(result.current.state).toBe('idle'))
    act(() => result.current.run())
    rerender({ task: { ...FILE_TASK } })
    expect(result.current.state).toBe('loading')
    expect(tasks.runExplainTask).toHaveBeenCalledTimes(1)
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
  it('useConceptMap runs, tracks progress and caches per repo/model/level with the commit', async () => {
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
    expect(result.current).toMatchObject({ state: 'done', data: map, stale: false })
    expect(await getCachedAi(conceptsKey)).toMatchObject({ data: map, commitSha: SHA })

    const again = renderHook(() => useConceptMap())
    await waitFor(() => expect(again.result.current.data).toEqual(map))
  })

  it('a concept map being written survives a trip to another view', async () => {
    const d = deferred<unknown>()
    let signal: AbortSignal | undefined
    tasks.generateConceptMap.mockImplementation((_ctx, cb: StreamCallbacks) => {
      signal = cb.signal
      return d.promise
    })
    const first = renderHook(() => useConceptMap())
    await waitFor(() => expect(first.result.current.state).toBe('idle'))
    act(() => first.result.current.run())
    first.unmount()
    expect(signal?.aborted).toBe(false)
    const map = { concepts: [], relations: [], source: 'ai' as const }
    await act(async () => d.resolve(map))
    const back = renderHook(() => useConceptMap())
    expect(back.result.current).toMatchObject({ state: 'done', data: map })
  })

  it('after a new commit the older map is still shown, marked stale, until it is regenerated', async () => {
    const old = { concepts: [], relations: [], source: 'ai' as const }
    await setCachedAi(aiCacheKey(['concepts', REPO, 'old999', MODEL, 'beginner']), old) // saved by the previous version
    loadRepo({ commitSha: 'old999' })
    const before = renderHook(() => useConceptMap())
    await waitFor(() => expect(before.result.current.data).toEqual(old))
    expect(before.result.current.stale).toBe(false)
    before.unmount()

    // Moved to the new key format, on disk too, so it is found after the next commit.
    await waitFor(async () => expect(await idbGet(conceptsKey, createStore('repoatlas-ai', 'results'))).toMatchObject({ data: old, commitSha: 'old999' }))

    loadRepo({ commitSha: 'new111' })
    const { result } = renderHook(() => useConceptMap({ autoRun: true }))
    await waitFor(() => expect(result.current.data).toEqual(old))
    expect(result.current).toMatchObject({ state: 'done', stale: true, fromCache: true })
    expect(tasks.generateConceptMap).not.toHaveBeenCalled()

    const fresh = { concepts: [], relations: [{ from: 'a', to: 'b', label: 'x' }], source: 'ai' as const }
    tasks.generateConceptMap.mockResolvedValue(fresh)
    await act(async () => result.current.run())
    expect(result.current).toMatchObject({ data: fresh, stale: false })
  })

  it('useTours.askTour appends a custom tour with a unique id and caches it apart from the generated set', async () => {
    tasks.generateTours.mockImplementation(async (_ctx, opts?: { question?: string }) =>
      opts?.question ? [tour('startup', opts.question)] : [tour('startup', 'Startup'), tour('saving', 'Saving')],
    )
    const { result } = renderHook(() => useTours())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    // Claude jobs run in a background job store (so navigating away doesn't cancel them): wait for the result.
    await act(async () => result.current.run())
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['startup', 'saving']))

    await act(async () => result.current.askTour('How does it start?'))
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['startup', 'saving', 'startup-2']))
    await waitFor(() => expect(result.current.asking).toBe(false))
    expect(tasks.generateTours.mock.calls[1][1]).toMatchObject({ question: 'How does it start?' })
    expect((tasks.generateTours.mock.calls[1][1] as { takenIds: Set<string> }).takenIds).toEqual(new Set(['startup', 'saving']))
    expect(await getCachedAi(customToursKey)).toMatchObject({ data: [expect.objectContaining({ id: 'startup-2' })] })
  })

  it('"Write new tours" keeps the tours the reader asked for (and their ids)', async () => {
    let round = 0
    tasks.generateTours.mockImplementation(async (_ctx, opts?: { question?: string }) => {
      if (opts?.question) return [tour('login', opts.question)]
      round++
      return round === 1 ? [tour('startup', 'Startup')] : [tour('login', 'Login'), tour('saving', 'Saving')]
    })
    const { result } = renderHook(() => useTours())
    await waitFor(() => expect(result.current.state).toBe('idle'))
    await act(async () => result.current.run())
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['startup']))
    await act(async () => result.current.askTour('How does login work?'))
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['startup', 'login']))
    await waitFor(() => expect(result.current.asking).toBe(false))

    await act(async () => result.current.run())
    // The new generated set comes first; the reader's own tour stays, with its id (links to it keep working).
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['login-2', 'saving', 'login']))
    expect(result.current.data?.at(-1)?.title).toBe('How does login work?')
    expect(await getCachedAi(toursKey)).toMatchObject({ data: [expect.objectContaining({ id: 'login-2' }), expect.objectContaining({ id: 'saving' })] })
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
    await loaded(chatKey)
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
    expect(again.result.current.state).toBe('idle')
    await waitFor(async () => expect(await idbGet(chatKey, createStore('repoatlas-ai', 'results'))).toEqual([]))
  })

  it('saves the question at once, and the answer keeps coming when the reader leaves the page', async () => {
    const d = deferred<string>()
    let signal: AbortSignal | undefined
    let cb: StreamCallbacks | undefined
    tasks.askQuestion.mockImplementation((_ctx, _h, _q, callbacks: StreamCallbacks) => {
      cb = callbacks
      signal = callbacks.signal
      return d.promise
    })
    const first = renderHook(() => useChat())
    await loaded(chatKey)
    act(() => first.result.current.send('How does routing work?'))
    await waitFor(async () =>
      expect(await idbGet<ChatMessage[]>(chatKey, createStore('repoatlas-ai', 'results'))).toEqual([
        expect.objectContaining({ role: 'user', content: 'How does routing work?' }),
        expect.objectContaining({ role: 'assistant', content: '' }),
      ]),
    )
    act(() => cb?.onText?.('Routing is'))
    first.unmount()
    expect(signal?.aborted).toBe(false)

    const back = renderHook(() => useChat())
    expect(back.result.current.messages.map((m) => m.content)).toEqual(['How does routing work?', 'Routing is'])
    expect(back.result.current.state).toBe('streaming')
    back.unmount()
    await act(async () => d.resolve('Routing is done by app.route.'))
    const later = renderHook(() => useChat())
    expect(later.result.current.messages.map((m) => m.content)).toEqual(['How does routing work?', 'Routing is done by app.route.'])
  })

  it('keeps the history when the project gets new commits (and reads history saved per commit before)', async () => {
    const saved: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Old question', createdAt: 1 },
      { id: '2', role: 'assistant', content: 'Old answer', createdAt: 2 },
    ]
    await setCachedAi(aiCacheKey(['chat', REPO, SHA]), saved) // the previous version's key
    const { result, unmount } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    tasks.askQuestion.mockResolvedValue('New answer')
    await act(async () => result.current.send('New question'))
    unmount()

    act(() => loadRepo({ commitSha: 'new111' }))
    const after = renderHook(() => useChat())
    expect(after.result.current.messages.map((m) => m.content)).toEqual(['Old question', 'Old answer', 'New question', 'New answer'])
  })

  it('records errors on the reply and exposes their kind', async () => {
    tasks.askQuestion.mockRejectedValue(new AiError('overloaded', 'Claude is very busy right now. Please try again in a minute.'))
    const { result } = renderHook(() => useChat())
    await loaded(chatKey)
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
    await loaded(chatKey)
    act(() => result.current.send('Hi'))
    act(() => cb?.onText?.('Half an'))
    act(() => result.current.cancel())
    expect(result.current.state).toBe('idle')
    expect(result.current.messages[1].content).toMatch(/^Half an\n\n_\(You stopped this answer\.\)_$/)
  })

  it('cancel before Claude wrote anything drops the empty reply but keeps the question', async () => {
    tasks.askQuestion.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useChat())
    await loaded(chatKey)
    act(() => result.current.send('Hi'))
    act(() => result.current.cancel())
    expect(result.current.messages.map((m) => m.role)).toEqual(['user'])
  })

  it('needs a key', async () => {
    useSettings.setState({ anthropicApiKey: '' })
    const { result } = renderHook(() => useChat())
    act(() => result.current.send('Hi'))
    expect(result.current).toMatchObject({ state: 'error', errorKind: 'no-key' })
    expect(result.current.messages).toEqual([])
  })
})

describe('private repositories', () => {
  const onDisk = (key: string) => Promise.all([idbGet(key, createStore('repoatlas-ai', 'results')), idbGet(key, createStore('repoatlas-ai-private', 'results'))])

  it('keeps Claude’s answers in memory only, unless the reader asked to remember their keys', async () => {
    loadRepo({ isPrivate: true, fullName: 'corp/secret' })
    tasks.askQuestion.mockResolvedValue('A secret answer')
    tasks.runExplainTask.mockResolvedValue('A secret explanation')
    const key = aiCacheKey(['chat', 'corp/secret'])
    const chat = renderHook(() => useChat())
    await loaded(key)
    await act(async () => chat.result.current.send('What is this?'))
    expect(chat.result.current.messages[1].content).toBe('A secret answer')
    const explanation = renderHook(() => useExplanation(FILE_TASK))
    await act(async () => explanation.result.current.run())
    expect(explanation.result.current.text).toBe('A secret explanation')
    expect(await onDisk(key)).toEqual([undefined, undefined])
    expect(await onDisk(aiCacheKey(['explain', 'corp/secret', MODEL, 'beginner', 'file:src/App.tsx']))).toEqual([undefined, undefined])

    act(() => useSettings.setState({ rememberKeys: true }))
    await act(async () => chat.result.current.send('And then?'))
    const [publicCopy, privateCopy] = await onDisk(key)
    expect(publicCopy).toBeUndefined()
    expect(privateCopy).toHaveLength(4)
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
