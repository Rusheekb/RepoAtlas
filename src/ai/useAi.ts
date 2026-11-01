import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { ChatMessage, ConceptMap, Quiz, Tour } from '@/core/types'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { aiCacheKey, getCachedAi, setCachedAi } from './cache'
import { toAiError } from './client'
import {
  askQuestion,
  buildCopyPrompt,
  explainTaskKey,
  generateConceptMap,
  generateQuiz,
  generateTours,
  runExplainTask,
  type PromptInput,
} from './tasks'
import type { AiContext, AiStatus, ExplainTask, PromptTask, StreamCallbacks } from './types'
import { uniqueId } from './validate'

export type AiRunState = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

const NO_KEY_EXPLAIN = 'Add your Claude API key in Settings to get in-depth explanations from Claude.'
const NO_KEY_CHAT = 'Add your Claude API key in Settings to chat with Claude about this project.'
const NO_REPO = 'Open a repository first.'

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

/** Everything prompts need except the key/model. Null until a repository has finished loading. */
function usePromptInput(): PromptInput | null {
  const level = useSettings((s) => s.readingLevel)
  const contextSize = useSettings((s) => s.contextSize)
  const analysis = useRepoStore((s) => s.analysis)
  const snapshot = useRepoStore((s) => s.snapshot)
  const getFileContent = useRepoStore((s) => s.getFileContent)
  return useMemo(
    () => (analysis && snapshot ? { level, contextSize, analysis, snapshot, getFileContent } : null),
    [level, contextSize, analysis, snapshot, getFileContent],
  )
}

/** Returns an AiContext when a repo is loaded AND a Claude API key is set; otherwise null. Re-renders on settings changes. */
export function useAiContext(): AiContext | null {
  const apiKey = useSettings((s) => s.anthropicApiKey).trim()
  const model = useSettings((s) => s.model)
  const input = usePromptInput()
  return useMemo(() => (apiKey && input ? { ...input, apiKey, model } : null), [apiKey, model, input])
}

/** True when the user has saved a Claude API key. */
export function useHasAiKey(): boolean {
  return useSettings((s) => s.anthropicApiKey.trim().length > 0)
}

/** A ref that always holds the latest committed value (read inside callbacks without re-creating them). */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

function repoId(input: PromptInput): [string, string] {
  return [input.analysis.meta.fullName, input.analysis.commitSha]
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanations
// ─────────────────────────────────────────────────────────────────────────────

interface ExplanationState {
  text: string
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  errorKind: string | null
  fromCache: boolean
}

const IDLE_EXPLANATION: ExplanationState = { text: '', state: 'idle', aiStatus: null, error: null, errorKind: null, fromCache: false }

/** The cache key for an explanation, or null when no repository is loaded / no task. */
export function useExplanationCacheKey(task: ExplainTask | null): string | null {
  const input = usePromptInput()
  const model = useSettings((s) => s.model)
  const taskKey = task ? explainTaskKey(task) : null
  if (!input || !taskKey) return null
  return aiCacheKey(['explain', ...repoId(input), model, input.level, input.contextSize, taskKey])
}

/**
 * Explanation for a task. Loads a cached result automatically (if any) when the task changes; never auto-calls Claude
 * unless `autoRun` is true. `run()` streams a fresh answer (and caches it). `cancel()` aborts.
 * Cache key includes repo, commit, model, reading level and task.
 */
export function useExplanation(task: ExplainTask | null, opts?: { autoRun?: boolean }): {
  text: string
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  errorKind: string | null
  fromCache: boolean
  run: () => void
  cancel: () => void
} {
  const ai = useAiContext()
  const cacheKey = useExplanationCacheKey(task)
  const [st, setSt] = useState<ExplanationState>(IDLE_EXPLANATION)
  const latest = useLatest({ task, ai, cacheKey, autoRun: Boolean(opts?.autoRun) })
  const ctrlRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  /** Last complete answer for the current key, restored when a regeneration is cancelled or fails. */
  const settledRef = useRef<{ key: string | null; text: string; fromCache: boolean }>({ key: null, text: '', fromCache: false })

  const stop = useCallback(() => {
    runIdRef.current++
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  const run = useCallback(() => {
    const { task: t, ai: ctx, cacheKey: key } = latest.current
    if (!t || !key) return
    if (!ctx) {
      setSt((s) => ({ ...s, state: 'error', aiStatus: null, error: NO_KEY_EXPLAIN, errorKind: 'no-key' }))
      return
    }
    stop()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const id = runIdRef.current
    const live = () => id === runIdRef.current
    setSt({ text: '', state: 'loading', aiStatus: 'connecting', error: null, errorKind: null, fromCache: false })
    runExplainTask(ctx, t, {
      signal: ctrl.signal,
      onStatus: (aiStatus) => {
        if (live()) setSt((s) => ({ ...s, aiStatus }))
      },
      onText: (text) => {
        if (live()) setSt((s) => ({ ...s, text, state: 'streaming' }))
      },
    }).then(
      (text) => {
        if (!live()) return
        ctrlRef.current = null
        settledRef.current = { key, text, fromCache: false }
        setSt({ text, state: 'done', aiStatus: 'done', error: null, errorKind: null, fromCache: false })
        void setCachedAi(key, text)
      },
      (err: unknown) => {
        if (!live()) return
        ctrlRef.current = null
        const e = toAiError(err)
        const prev = settledRef.current.key === key ? settledRef.current : null
        if (e.kind === 'aborted') {
          setSt(prev ? { ...IDLE_EXPLANATION, text: prev.text, state: 'done', fromCache: prev.fromCache } : IDLE_EXPLANATION)
          return
        }
        setSt({ text: prev?.text ?? '', state: 'error', aiStatus: null, error: e.message, errorKind: e.kind, fromCache: prev?.fromCache ?? false })
      },
    )
  }, [latest, stop])

  const cancel = useCallback(() => {
    if (!ctrlRef.current) return
    stop()
    const prev = settledRef.current.key === latest.current.cacheKey ? settledRef.current : null
    setSt(prev ? { ...IDLE_EXPLANATION, text: prev.text, state: 'done', fromCache: prev.fromCache } : IDLE_EXPLANATION)
  }, [latest, stop])

  useEffect(() => {
    // A different task / repo / model / level: stop anything in flight, then look in the cache.
    stop()
    settledRef.current = { key: null, text: '', fromCache: false }
    setSt(IDLE_EXPLANATION)
    if (!cacheKey) return
    const loadId = runIdRef.current
    let alive = true
    void getCachedAi<string>(cacheKey).then((hit) => {
      if (!alive || loadId !== runIdRef.current) return
      if (typeof hit === 'string' && hit.trim()) {
        settledRef.current = { key: cacheKey, text: hit, fromCache: true }
        setSt({ text: hit, state: 'done', aiStatus: null, error: null, errorKind: null, fromCache: true })
      } else if (latest.current.autoRun && latest.current.ai) {
        run()
      }
    })
    return () => {
      alive = false
      stop()
    }
  }, [cacheKey, latest, run, stop])

  return { ...st, run, cancel }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured generators (concept map / tours / quiz)
// ─────────────────────────────────────────────────────────────────────────────

/** Shared state shape for structured generators (concept map / tours / quiz). */
export interface StructuredAi<T> {
  data: T | null
  state: AiRunState
  aiStatus: AiStatus | null
  /** Characters of output received so far (for a progress indicator while JSON streams). */
  progressChars: number
  error: string | null
  errorKind: string | null
  fromCache: boolean
  run: () => void
  cancel: () => void
}

type StructuredState<T> = Omit<StructuredAi<T>, 'run' | 'cancel'>

function idleStructured<T>(): StructuredState<T> {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false }
}

interface StructuredInternals<T> {
  cacheKey: string | null
  setState: Dispatch<SetStateAction<StructuredState<T>>>
  dataRef: RefObject<T | null>
  ai: () => AiContext | null
}

function useStructured<T>(
  kind: 'concepts' | 'tours' | 'quiz',
  generate: (ctx: AiContext, cb: StreamCallbacks) => Promise<T>,
  fromCacheValue: (value: unknown) => T | null,
  opts?: { autoRun?: boolean },
): StructuredAi<T> & { internals: StructuredInternals<T> } {
  const input = usePromptInput()
  const ai = useAiContext()
  const model = useSettings((s) => s.model)
  const cacheKey = input ? aiCacheKey([kind, ...repoId(input), model, input.level]) : null
  const [st, setSt] = useState<StructuredState<T>>(idleStructured)
  const latest = useLatest({ ai, cacheKey, generate, autoRun: Boolean(opts?.autoRun) })
  const dataRef = useRef<T | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const settledRef = useRef<{ key: string | null; data: T | null; fromCache: boolean }>({ key: null, data: null, fromCache: false })

  useLayoutEffect(() => {
    dataRef.current = st.data
  }, [st.data])

  const stop = useCallback(() => {
    runIdRef.current++
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  const restore = useCallback(() => {
    const prev = settledRef.current.key === latest.current.cacheKey ? settledRef.current : null
    // Keep anything added since the last full run (e.g. a custom tour), not just the last generated result.
    const data = dataRef.current ?? prev?.data ?? null
    return data ? { ...idleStructured<T>(), data, state: 'done' as const, fromCache: prev?.fromCache ?? false } : idleStructured<T>()
  }, [latest])

  const run = useCallback(() => {
    const { ai: ctx, cacheKey: key, generate: gen } = latest.current
    if (!key) return
    if (!ctx) {
      setSt((s) => ({ ...s, state: 'error', aiStatus: null, error: NO_KEY_EXPLAIN, errorKind: 'no-key' }))
      return
    }
    stop()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const id = runIdRef.current
    const live = () => id === runIdRef.current
    setSt((s) => ({ ...s, state: 'loading', aiStatus: 'connecting', progressChars: 0, error: null, errorKind: null }))
    gen(ctx, {
      signal: ctrl.signal,
      onStatus: (aiStatus) => {
        if (live()) setSt((s) => ({ ...s, aiStatus }))
      },
      onText: (text) => {
        if (live()) setSt((s) => ({ ...s, state: 'streaming', progressChars: text.length }))
      },
    }).then(
      (data) => {
        if (!live()) return
        ctrlRef.current = null
        settledRef.current = { key, data, fromCache: false }
        dataRef.current = data
        setSt({ data, state: 'done', aiStatus: 'done', progressChars: 0, error: null, errorKind: null, fromCache: false })
        void setCachedAi(key, data)
      },
      (err: unknown) => {
        if (!live()) return
        ctrlRef.current = null
        const e = toAiError(err)
        if (e.kind === 'aborted') {
          setSt(restore())
          return
        }
        setSt((s) => ({ ...s, state: 'error', aiStatus: null, progressChars: 0, error: e.message, errorKind: e.kind }))
      },
    )
  }, [latest, restore, stop])

  const cancel = useCallback(() => {
    if (!ctrlRef.current) return
    stop()
    setSt(restore())
  }, [restore, stop])

  useEffect(() => {
    stop()
    settledRef.current = { key: null, data: null, fromCache: false }
    dataRef.current = null
    setSt(idleStructured<T>())
    if (!cacheKey) return
    const loadId = runIdRef.current
    let alive = true
    void getCachedAi<unknown>(cacheKey).then((hit) => {
      if (!alive || loadId !== runIdRef.current) return
      const data = hit === undefined ? null : fromCacheValue(hit)
      if (data !== null) {
        settledRef.current = { key: cacheKey, data, fromCache: true }
        dataRef.current = data
        setSt({ ...idleStructured<T>(), data, state: 'done', fromCache: true })
      } else if (latest.current.autoRun && latest.current.ai) {
        run()
      }
    })
    return () => {
      alive = false
      stop()
    }
  }, [cacheKey, fromCacheValue, latest, run, stop])

  return {
    ...st,
    run,
    cancel,
    internals: { cacheKey, setState: setSt, dataRef, ai: () => latest.current.ai },
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function cachedConceptMap(v: unknown): ConceptMap | null {
  return isObject(v) && Array.isArray(v.concepts) && Array.isArray(v.relations) ? (v as unknown as ConceptMap) : null
}

function cachedTours(v: unknown): Tour[] | null {
  return Array.isArray(v) && v.every((t) => isObject(t) && Array.isArray(t.steps)) ? (v as Tour[]) : null
}

function cachedQuiz(v: unknown): Quiz | null {
  return isObject(v) && Array.isArray(v.questions) ? (v as unknown as Quiz) : null
}

function stripInternals<T>(s: StructuredAi<T> & { internals: unknown }): StructuredAi<T> {
  const { internals: _internals, ...rest } = s
  return rest
}

/** The AI concept map ("Key Ideas"), cached per repo, commit, model and reading level. */
export function useConceptMap(opts?: { autoRun?: boolean }): StructuredAi<ConceptMap> {
  return stripInternals(useStructured('concepts', (ctx, cb) => generateConceptMap(ctx, cb), cachedConceptMap, opts))
}

/** Tours: generated set (cached) plus the ability to request a custom tour for a question (appended & cached). */
export function useTours(opts?: { autoRun?: boolean }): StructuredAi<Tour[]> & { askTour: (question: string) => void; asking: boolean } {
  const base = useStructured<Tour[]>('tours', (ctx, cb) => generateTours(ctx, undefined, cb), cachedTours, opts)
  const { internals } = base
  const latest = useLatest(internals)
  const [asking, setAsking] = useState(false)
  const askCtrlRef = useRef<AbortController | null>(null)
  const askIdRef = useRef(0)

  const stopAsk = useCallback(() => {
    askIdRef.current++
    askCtrlRef.current?.abort()
    askCtrlRef.current = null
  }, [])

  // A different repo / model / level: drop any custom-tour request in flight.
  useEffect(() => {
    setAsking(false)
    return stopAsk
  }, [internals.cacheKey, stopAsk])

  const askTour = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q) return
      const { cacheKey: key, setState, dataRef, ai } = latest.current
      const ctx = ai()
      if (!key) return
      if (!ctx) {
        setState((s) => ({ ...s, error: NO_KEY_EXPLAIN, errorKind: 'no-key' }))
        return
      }
      stopAsk()
      const ctrl = new AbortController()
      askCtrlRef.current = ctrl
      const id = askIdRef.current
      const live = () => id === askIdRef.current && latest.current.cacheKey === key
      setAsking(true)
      setState((s) => ({ ...s, aiStatus: 'connecting', progressChars: 0, error: null, errorKind: null }))
      const takenIds = new Set((dataRef.current ?? []).map((t) => t.id))
      generateTours(ctx, { question: q, takenIds }, {
        signal: ctrl.signal,
        onStatus: (aiStatus) => {
          if (live()) setState((s) => ({ ...s, aiStatus }))
        },
        onText: (text) => {
          if (live()) setState((s) => ({ ...s, progressChars: text.length }))
        },
      }).then(
        (tours) => {
          if (!live()) return
          askCtrlRef.current = null
          setAsking(false)
          const current = latest.current.dataRef.current ?? []
          const taken = new Set(current.map((t) => t.id))
          const added = tours.slice(0, 1).map((t) => ({ ...t, id: uniqueId(t.id, taken, 'tour') }))
          const next = [...current, ...added]
          latest.current.dataRef.current = next
          setState((s) => ({ ...s, data: next, state: 'done', aiStatus: 'done', progressChars: 0 }))
          void setCachedAi(key, next)
        },
        (err: unknown) => {
          if (!live()) return
          askCtrlRef.current = null
          setAsking(false)
          const e = toAiError(err)
          if (e.kind === 'aborted') setState((s) => ({ ...s, aiStatus: null, progressChars: 0 }))
          else setState((s) => ({ ...s, aiStatus: null, progressChars: 0, error: e.message, errorKind: e.kind }))
        },
      )
    },
    [latest, stopAsk],
  )

  const baseCancel = base.cancel
  const cancel = useCallback(() => {
    if (askCtrlRef.current) {
      stopAsk()
      setAsking(false)
      latest.current.setState((s) => ({ ...s, aiStatus: null, progressChars: 0 }))
    }
    baseCancel()
  }, [baseCancel, latest, stopAsk])

  return { ...stripInternals(base), cancel, askTour, asking }
}

/** The AI quiz ("Test Yourself"), cached per repo, commit, model and reading level. */
export function useQuiz(opts?: { autoRun?: boolean }): StructuredAi<Quiz> {
  return stripInternals(useStructured('quiz', (ctx, cb) => generateQuiz(ctx, cb), cachedQuiz, opts))
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isChatMessage(v: unknown): v is ChatMessage {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    (v.role === 'user' || v.role === 'assistant') &&
    typeof v.content === 'string' &&
    typeof v.createdAt === 'number'
  )
}

const STOPPED_NOTE = '\n\n_(You stopped this answer.)_'

/** Chat about the repo. History persists per repo (IndexedDB) and survives reloads. */
export function useChat(): {
  messages: ChatMessage[]
  send: (question: string) => void
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  /** AiError kind of the last failure ('no-key', 'invalid-key', 'rate-limited' …), so the UI can offer the right fix. */
  errorKind: string | null
  cancel: () => void
  clear: () => void
} {
  const input = usePromptInput()
  const ai = useAiContext()
  const chatKey = input ? aiCacheKey(['chat', ...repoId(input)]) : null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<AiRunState>('idle')
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState<{ message: string; kind: string } | null>(null)
  const latest = useLatest({ ai, chatKey })
  const messagesRef = useRef<ChatMessage[]>([])
  const ctrlRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  const update = useCallback((next: ChatMessage[], persistKey?: string | null) => {
    messagesRef.current = next
    setMessages(next)
    if (persistKey) void setCachedAi(persistKey, next)
  }, [])

  const stop = useCallback(() => {
    runIdRef.current++
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  useEffect(() => {
    stop()
    update([])
    setState('idle')
    setAiStatus(null)
    setError(null)
    if (!chatKey) return
    let alive = true
    void getCachedAi<unknown>(chatKey).then((saved) => {
      if (!alive || !Array.isArray(saved)) return
      // A reply that was mid-stream when the page closed is kept as-is; an empty one is dropped.
      const restored = saved.filter(isChatMessage).filter((m) => m.role === 'user' || m.content.trim() || m.error)
      if (!restored.length) return
      // If the reader already asked something while history was loading, keep both (old first).
      const current = messagesRef.current
      const ids = new Set(current.map((m) => m.id))
      update([...restored.filter((m) => !ids.has(m.id)), ...current])
    })
    return () => {
      alive = false
      stop()
    }
  }, [chatKey, stop, update])

  const send = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q || ctrlRef.current) return
      const { ai: ctx, chatKey: key } = latest.current
      if (!key) {
        setError({ message: NO_REPO, kind: 'unknown' })
        setState('error')
        return
      }
      if (!ctx) {
        setError({ message: NO_KEY_CHAT, kind: 'no-key' })
        setState('error')
        return
      }
      const history = messagesRef.current
      const now = Date.now()
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: q, createdAt: now }
      const replyId = newId()
      update([...history, userMsg, { id: replyId, role: 'assistant', content: '', createdAt: now }])

      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      const id = ++runIdRef.current
      const live = () => id === runIdRef.current
      const patch = (fields: Partial<ChatMessage>, persist: boolean) =>
        update(
          messagesRef.current.map((m) => (m.id === replyId ? { ...m, ...fields } : m)),
          persist ? key : null,
        )

      setState('loading')
      setAiStatus('connecting')
      setError(null)
      askQuestion(ctx, history, q, {
        signal: ctrl.signal,
        onStatus: (s) => {
          if (live()) setAiStatus(s)
        },
        onText: (text) => {
          if (!live()) return
          patch({ content: text }, false)
          setState('streaming')
        },
      }).then(
        (text) => {
          if (!live()) return
          ctrlRef.current = null
          patch({ content: text, error: undefined }, true)
          setState('done')
          setAiStatus('done')
        },
        (err: unknown) => {
          if (!live()) return
          ctrlRef.current = null
          const e = toAiError(err)
          setAiStatus(null)
          if (e.kind === 'aborted') {
            const partial = messagesRef.current.find((m) => m.id === replyId)?.content ?? ''
            if (partial.trim()) patch({ content: partial + STOPPED_NOTE }, true)
            else update(messagesRef.current.filter((m) => m.id !== replyId), key)
            setState('idle')
            return
          }
          patch({ error: e.message }, true)
          setError({ message: e.message, kind: e.kind })
          setState('error')
        },
      )
    },
    [latest, update],
  )

  const cancel = useCallback(() => {
    // The pending request settles as 'aborted' and tidies up the partial reply itself.
    ctrlRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    stop()
    update([], latest.current.chatKey)
    setState('idle')
    setAiStatus(null)
    setError(null)
  }, [latest, stop, update])

  return { messages, send, state, aiStatus, error: error?.message ?? null, errorKind: error?.kind ?? null, cancel, clear }
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy-paste prompt
// ─────────────────────────────────────────────────────────────────────────────

/** Build a copy-paste prompt for claude.ai (for users without an API key). */
export function useCopyPrompt(): (task: PromptTask) => Promise<string> {
  const input = usePromptInput()
  return useCallback(
    async (task: PromptTask) => {
      if (!input) throw new Error(NO_REPO)
      return buildCopyPrompt(input, task)
    },
    [input],
  )
}

export type { ExplainTask, PromptTask }
