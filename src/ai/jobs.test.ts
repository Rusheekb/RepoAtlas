import { abortAiJobs, abortAiJobsOutside, cancelAiJob, getAiJob, isAiJobRunning, startAiJob, useAiJobs } from './jobs'
import { AiError, type StreamCallbacks } from './types'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const toError = (e: unknown) => (e instanceof AiError ? e : new AiError('unknown', 'Oops'))
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => abortAiJobs())

describe('AI jobs', () => {
  it('track progress and save the result even though nobody is watching', async () => {
    const d = deferred<string>()
    let cb: StreamCallbacks | undefined
    const onDone = vi.fn()
    startAiJob({ key: 'k', scope: 's', run: (c) => ((cb = c), d.promise), toError, onDone })
    expect(getAiJob('k')).toMatchObject({ phase: 'loading', aiStatus: 'connecting', text: '' })
    cb?.onStatus?.('writing')
    cb?.onText?.('Hel')
    expect(getAiJob('k')).toMatchObject({ phase: 'streaming', aiStatus: 'writing', text: 'Hel' })
    d.resolve('Hello')
    await flush()
    expect(onDone).toHaveBeenCalledWith('Hello')
    expect(getAiJob('k')).toMatchObject({ phase: 'done', aiStatus: 'done', text: '' })
    expect(isAiJobRunning(getAiJob('k'))).toBe(false)
  })

  it('Stop tidies up at once with the partial text, aborts the request and ignores a late answer', async () => {
    const d = deferred<string>()
    let signal: AbortSignal | undefined
    let cb: StreamCallbacks | undefined
    const onAbort = vi.fn()
    const onDone = vi.fn()
    startAiJob({ key: 'k', scope: 's', run: (c) => ((cb = c), (signal = c.signal), d.promise), toError, onAbort, onDone })
    cb?.onText?.('Half')
    cancelAiJob('k')
    expect(onAbort).toHaveBeenCalledWith('Half')
    expect(signal?.aborted).toBe(true)
    expect(getAiJob('k')).toBeUndefined()
    d.resolve('Too late')
    await flush()
    expect(onDone).not.toHaveBeenCalled()
    expect(getAiJob('k')).toBeUndefined()
  })

  it('failures keep a friendly error on the job', async () => {
    const onError = vi.fn()
    startAiJob({ key: 'k', scope: 's', run: async () => Promise.reject(new AiError('rate-limited', 'Slow down')), toError, onError })
    await flush()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rate-limited' }), '')
    expect(getAiJob('k')).toMatchObject({ phase: 'error', error: { kind: 'rate-limited', message: 'Slow down' } })
  })

  it('a new job for the same key replaces the old one', async () => {
    const signals: AbortSignal[] = []
    const never = (c: { signal: AbortSignal }) => (signals.push(c.signal), new Promise<string>(() => {}))
    const first = startAiJob({ key: 'k', scope: 's', run: never, toError })
    const second = startAiJob({ key: 'k', scope: 's', run: never, toError })
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(getAiJob('k')?.id).toBe(second)
    expect(second).not.toBe(first)
  })

  it('clearing everything stops jobs without saving their partial text', () => {
    const onAbort = vi.fn()
    let cb: StreamCallbacks | undefined
    startAiJob({ key: 'k', scope: 's', run: (c) => ((cb = c), new Promise<string>(() => {})), toError, onAbort })
    cb?.onText?.('Half')
    abortAiJobs()
    expect(onAbort).not.toHaveBeenCalled()
    expect(getAiJob('k')).toBeUndefined()
  })

  it('a change of repository / model / level stops jobs started for another one', () => {
    const signals: Record<string, AbortSignal> = {}
    const run = (key: string) => (c: { signal: AbortSignal }) => ((signals[key] = c.signal), new Promise<string>(() => {}))
    startAiJob({ key: 'a', scope: 'repo-a', run: run('a'), toError })
    startAiJob({ key: 'b', scope: 'repo-b', run: run('b'), toError })
    abortAiJobsOutside('repo-b')
    expect(signals.a.aborted).toBe(true)
    expect(signals.b.aborted).toBe(false)
    expect(Object.keys(useAiJobs.getState().jobs)).toEqual(['b'])
  })
})
