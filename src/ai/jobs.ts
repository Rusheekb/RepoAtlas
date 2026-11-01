import { create } from 'zustand'
import { AiError, type AiStatus, type StreamCallbacks } from './types'

/**
 * Claude requests that outlive the component that started them.
 *
 * A job is keyed by the AI cache key of what it produces, so a component that mounts later (the reader went to
 * another view and came back) finds the job still running — or finished, with the result already in the cache.
 * Jobs are only stopped by an explicit Stop (cancelAiJob), by a new job for the same key, by a change of
 * repository / model / reading level (abortAiJobsOutside), or when the cache is cleared.
 */

export type AiJobPhase = 'loading' | 'streaming' | 'done' | 'error'

export interface AiJob {
  id: number
  key: string
  /** Repository + model + reading level it was started for. */
  scope: string
  /** About a private repository. */
  private: boolean
  /** Free-form link to what the job writes into (e.g. the id of the chat reply being written). */
  ref: string | null
  phase: AiJobPhase
  aiStatus: AiStatus | null
  /** Everything Claude has written so far (the full text, not a delta). */
  text: string
  error: { message: string; kind: AiError['kind'] } | null
  startedAt: number
}

export interface AiJobsState {
  jobs: Readonly<Record<string, AiJob>>
}

export const useAiJobs = create<AiJobsState>()(() => ({ jobs: {} }))

export interface AiJobSpec<T> {
  key: string
  scope: string
  private?: boolean
  ref?: string | null
  /** Does the work, passing these callbacks on to the Claude task. */
  run: (cb: StreamCallbacks & { signal: AbortSignal }) => Promise<T>
  /** Turns anything thrown into a friendly AiError. */
  toError: (err: unknown) => AiError | Promise<AiError>
  /** Called with the result even if no component is showing it any more (save it to the cache here). */
  onDone?: (result: T) => void | Promise<void>
  /** Called when the job fails (not when it is stopped). */
  onError?: (error: AiError, partialText: string) => void
  /** Called synchronously when the job is stopped, with what Claude had written so far. */
  onAbort?: (partialText: string) => void
}

interface Running {
  id: number
  ctrl: AbortController
  text: string
  onAbort?: (partialText: string) => void
}

const running = new Map<string, Running>()
let nextId = 1

/** A job Claude is still working on. */
export type RunningAiJob = AiJob & { phase: 'loading' | 'streaming' }

export function isAiJobRunning(job: AiJob | undefined | null): job is RunningAiJob {
  return Boolean(job && (job.phase === 'loading' || job.phase === 'streaming'))
}

export function getAiJob(key: string): AiJob | undefined {
  return useAiJobs.getState().jobs[key]
}

function patch(key: string, id: number, fields: Partial<AiJob>) {
  useAiJobs.setState((s) => {
    const job = s.jobs[key]
    if (!job || job.id !== id) return s
    return { jobs: { ...s.jobs, [key]: { ...job, ...fields } } }
  })
}

function remove(key: string, id?: number) {
  useAiJobs.setState((s) => {
    const job = s.jobs[key]
    if (!job || (id !== undefined && job.id !== id)) return s
    const { [key]: _gone, ...rest } = s.jobs
    return { jobs: rest }
  })
}

/** Stop a running job: tidy up (onAbort) synchronously unless `quiet`, forget it, then abort the request. */
function stop(key: string, quiet = false) {
  const r = running.get(key)
  if (!r) return
  running.delete(key)
  try {
    if (!quiet) r.onAbort?.(r.text)
  } catch {
    /* tidying up is best-effort */
  }
  r.ctrl.abort()
}

/** Start a job (replacing any job with the same key). Returns its id. */
export function startAiJob<T>(spec: AiJobSpec<T>): number {
  const { key } = spec
  stop(key)
  const id = nextId++
  const ctrl = new AbortController()
  const r: Running = { id, ctrl, text: '', onAbort: spec.onAbort }
  running.set(key, r)
  const job: AiJob = {
    id,
    key,
    scope: spec.scope,
    private: Boolean(spec.private),
    ref: spec.ref ?? null,
    phase: 'loading',
    aiStatus: 'connecting',
    text: '',
    error: null,
    startedAt: Date.now(),
  }
  useAiJobs.setState((s) => ({ jobs: { ...s.jobs, [key]: job } }))
  const live = () => running.get(key)?.id === id

  void (async () => {
    try {
      const result = await spec.run({
        signal: ctrl.signal,
        onStatus: (aiStatus) => {
          if (live()) patch(key, id, { aiStatus })
        },
        onText: (text) => {
          if (!live()) return
          r.text = text
          patch(key, id, { text, phase: 'streaming' })
        },
      })
      if (!live()) return
      running.delete(key)
      try {
        await spec.onDone?.(result)
      } catch {
        /* saving is best-effort */
      }
      // The result lives in the cache now; the job only remembers how it ended.
      patch(key, id, { phase: 'done', aiStatus: 'done', error: null, text: '' })
    } catch (err) {
      if (!live()) return // stopped or replaced: already tidied up
      running.delete(key)
      let e: AiError
      try {
        e = await spec.toError(err)
      } catch {
        e = new AiError('unknown', 'Something went wrong while talking to Claude. Please try again.')
      }
      try {
        if (e.kind === 'aborted') spec.onAbort?.(r.text)
        else spec.onError?.(e, r.text)
      } catch {
        /* tidying up is best-effort */
      }
      if (e.kind === 'aborted') {
        remove(key, id)
        return
      }
      patch(key, id, { phase: 'error', aiStatus: null, text: '', error: { message: e.message, kind: e.kind } })
    }
  })()
  return id
}

/** Explicit Stop: abort the job for `key` (if running) and forget it, finished or not. */
export function cancelAiJob(key: string): void {
  stop(key)
  remove(key)
}

/**
 * Stop and forget jobs (all of them, or those matching `which`) without saving anything they had written so far —
 * used when the cache is being cleared, so nothing comes back afterwards.
 */
export function abortAiJobs(which?: (job: AiJob) => boolean): void {
  for (const job of Object.values(useAiJobs.getState().jobs)) {
    if (which && !which(job)) continue
    stop(job.key, true)
    remove(job.key)
  }
}

/** The repository, model or reading level changed: stop (tidying up, as Stop does) every job started for another one. */
export function abortAiJobsOutside(scope: string): void {
  for (const job of Object.values(useAiJobs.getState().jobs)) {
    if (job.scope !== scope) cancelAiJob(job.key)
  }
}
