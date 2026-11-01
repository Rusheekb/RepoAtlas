import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatMessage, ConceptMap, ContextSize, ModelId, Quiz, ReadingLevel, Tour } from '@/core/types'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import {
  aiCacheKey,
  deleteCachedAi,
  getAiCacheEntry,
  getCachedAi,
  isStoredAiResult,
  setCachedAi,
  storedAiResult,
  subscribeAiCache,
  type AiCacheOptions,
} from './cache'
import { abortAiJobsOutside, cancelAiJob, getAiJob, isAiJobRunning, startAiJob, useAiJobs, type AiJob, type AiJobSpec } from './jobs'
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
import { AiError, type AiContext, type AiStatus, type ExplainTask, type PromptTask, type StreamCallbacks } from './types'
import { uniqueId } from './validate'

export type AiRunState = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

const NO_KEY_EXPLAIN = 'Add your Claude API key in Settings to get in-depth explanations from Claude.'
const NO_KEY_CHAT = 'Add your Claude API key in Settings to chat with Claude about this project.'
const NO_REPO = 'Open a repository first.'

/*
 * How results are kept (see ./cache and ./jobs):
 * - Claude requests run as jobs that outlive the component that started them: switching views never cancels one, and
 *   the result is saved even if nobody is looking. Only Stop, a new request for the same thing, or a change of
 *   repository / model / reading level stops a job.
 * - Results are cached per repository, model and reading level, together with the commit they were made for. After
 *   the project gets new commits the reader still sees what they paid for, marked `stale` so the UI can offer to
 *   regenerate it. Chat history is kept per repository.
 * - Results about private repositories stay in memory only, unless the reader asked to remember their keys.
 */

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

/** What the cache keys and job scopes of the open repository are made of. */
interface RepoScope {
  fullName: string
  commitSha: string
  model: ModelId
  level: ReadingLevel
  contextSize: ContextSize
  isPrivate: boolean
  /** Jobs started for another scope are stopped (see watchScope). */
  scope: string
}

function scopeOf(fullName: string, model: string, level: string): string {
  return aiCacheKey([fullName, model, level])
}

function useRepoScope(): RepoScope | null {
  const analysis = useRepoStore((s) => s.analysis)
  const model = useSettings((s) => s.model)
  const level = useSettings((s) => s.readingLevel)
  const contextSize = useSettings((s) => s.contextSize)
  return useMemo(() => {
    if (!analysis) return null
    const fullName = analysis.meta.fullName
    return {
      fullName,
      commitSha: analysis.commitSha,
      model,
      level,
      contextSize,
      isPrivate: Boolean(analysis.meta.isPrivate),
      scope: scopeOf(fullName, model, level),
    }
  }, [analysis, model, level, contextSize])
}

/** Private repositories' results are only written to disk when the reader asked to remember their keys. */
function cacheOptions(isPrivate: boolean): AiCacheOptions {
  return { private: isPrivate, persist: !isPrivate || useSettings.getState().rememberKeys }
}

let watchingScope = false

/** Stop jobs for another repository / model / reading level as soon as the reader switches. Installed once. */
function watchScope() {
  if (watchingScope) return
  watchingScope = true
  const current = (): string | null => {
    const analysis = useRepoStore.getState().analysis
    if (!analysis) return null
    const { model, readingLevel } = useSettings.getState()
    return scopeOf(analysis.meta.fullName, model, readingLevel)
  }
  let last = current()
  const check = () => {
    const next = current()
    if (!next || next === last) return
    last = next
    abortAiJobsOutside(next)
  }
  useSettings.subscribe(check)
  useRepoStore.subscribe(check)
}

/** Any error → a friendly AiError. The SDK's error classes are only loaded when they're needed. */
async function friendlyError(err: unknown): Promise<AiError> {
  if (err instanceof AiError) return err
  const { toAiError } = await import('./client')
  return toAiError(err)
}

function launch<T>(spec: AiJobSpec<T>): void {
  watchScope()
  startAiJob(spec)
}

function subscribeCache(onChange: () => void): () => void {
  return subscribeAiCache(() => onChange())
}

/**
 * The cache entry for `key`, kept up to date (memory layer, shared by every component). Starts loading it from storage
 * when memory doesn't know it yet. `known` is false until that lookup has finished.
 */
function useCacheEntry(key: string | null, load?: { fallback?: () => Promise<unknown>; private?: boolean }): { known: boolean; value: unknown } {
  const entry = useSyncExternalStore(subscribeCache, () => (key ? getAiCacheEntry(key) : undefined))
  const loadRef = useLatest(load)
  const missing = entry === undefined
  useEffect(() => {
    if (key && missing) void getCachedAi(key, loadRef.current)
  }, [key, missing, loadRef])
  return { known: Boolean(key) && !missing, value: entry?.value }
}

interface Settled<T> {
  data: T
  commitSha: string
}

/**
 * A saved result ({ data, commitSha }) for `key`. `legacyKey` is where older versions of RepoAtlas saved it (with the
 * commit in the key): read once if nothing is saved under `key` yet.
 */
function useStored<T>(
  key: string | null,
  legacyKey: string | null,
  parse: (v: unknown) => T | null,
  repo: RepoScope | null,
): { known: boolean; stored: Settled<T> | null } {
  const commitSha = repo?.commitSha ?? ''
  const isPrivate = repo?.isPrivate ?? false
  const entry = useCacheEntry(
    key,
    repo
      ? {
          private: repo.isPrivate,
          fallback:
            legacyKey && key
              ? async () => {
                  const old = await getCachedAi<unknown>(legacyKey)
                  const data = old === undefined ? null : parse(old)
                  if (data === null) return undefined
                  // Save it under the new key, so it is still found after the project's next commit.
                  const record = storedAiResult(data, commitSha)
                  void setCachedAi(key, record, cacheOptions(isPrivate))
                  return record
                }
              : undefined,
        }
      : undefined,
  )
  const stored = useMemo(() => {
    const v = entry.value
    if (!isStoredAiResult(v)) return null
    const data = parse(v.data)
    return data === null ? null : { data, commitSha: v.commitSha }
  }, [entry.value, parse])
  return { known: entry.known, stored }
}

/** The job producing `key`, if any (running, or finished in this tab). */
function useJob(key: string | null): AiJob | undefined {
  return useAiJobs((s) => (key ? s.jobs[key] : undefined))
}

interface LocalError {
  key: string | null
  message: string
  kind: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanations
// ─────────────────────────────────────────────────────────────────────────────

function explanationKeys(repo: RepoScope, taskKey: string): { key: string; legacyKey: string } {
  return {
    key: aiCacheKey(['explain', repo.fullName, repo.model, repo.level, taskKey]),
    legacyKey: aiCacheKey(['explain', repo.fullName, repo.commitSha, repo.model, repo.level, repo.contextSize, taskKey]),
  }
}

function parseText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** The cache key for an explanation, or null when no repository is loaded / no task. */
export function useExplanationCacheKey(task: ExplainTask | null): string | null {
  const repo = useRepoScope()
  const taskKey = task ? explainTaskKey(task) : null
  return repo && taskKey ? explanationKeys(repo, taskKey).key : null
}

/**
 * Explanation for a task. Loads a cached result automatically (if any) when the task changes; never auto-calls Claude
 * unless `autoRun` is true (and nothing at all is saved). `run()` streams a fresh answer (and caches it); `cancel()`
 * stops it. Cached per repo, model, reading level and task; `stale` means it was written for an older commit.
 * Switching to another task or view does not stop a running answer: it finishes and is saved in the background.
 */
export function useExplanation(task: ExplainTask | null, opts?: { autoRun?: boolean }): {
  text: string
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  errorKind: string | null
  fromCache: boolean
  /** The saved answer was written for an older version of the code (offer to regenerate it). */
  stale: boolean
  run: () => void
  cancel: () => void
} {
  const ai = useAiContext()
  const repo = useRepoScope()
  const taskKey = task ? explainTaskKey(task) : null
  const keys = repo && taskKey ? explanationKeys(repo, taskKey) : null
  const key = keys?.key ?? null
  const { known, stored } = useStored(key, keys?.legacyKey ?? null, parseText, repo)
  const job = useJob(key)
  const [localError, setLocalError] = useState<LocalError | null>(null)
  const latest = useLatest({ task, ai, key, repo })

  const run = useCallback(() => {
    const { task: t, ai: ctx, key: k, repo: r } = latest.current
    if (!t || !k || !r) return
    if (!ctx) {
      setLocalError({ key: k, message: NO_KEY_EXPLAIN, kind: 'no-key' })
      return
    }
    setLocalError(null)
    launch<string>({
      key: k,
      scope: r.scope,
      private: r.isPrivate,
      run: (cb) => runExplainTask(ctx, t, cb),
      toError: friendlyError,
      onDone: (text) => void setCachedAi(k, storedAiResult(text, r.commitSha), cacheOptions(r.isPrivate)),
    })
  }, [latest])

  const cancel = useCallback(() => {
    const k = latest.current.key
    if (k && isAiJobRunning(getAiJob(k))) cancelAiJob(k)
  }, [latest])

  // autoRun: decided once per key, when we know whether anything is saved.
  const decided = useRef<string | null>(null)
  const autoRun = Boolean(opts?.autoRun)
  useEffect(() => {
    if (!key || !known || decided.current === key) return
    decided.current = key
    if (autoRun && !stored && !getAiJob(key) && latest.current.ai) run()
  }, [key, known, stored, autoRun, run, latest])

  const running = isAiJobRunning(job)
  const local = localError && localError.key === key ? localError : null
  const jobError = job?.phase === 'error' ? job.error : null
  const text = running ? job.text : (stored?.data ?? '')
  const state: AiRunState = running ? job.phase : jobError || local ? 'error' : stored ? 'done' : 'idle'
  return {
    text,
    state,
    aiStatus: running ? job.aiStatus : job?.phase === 'done' && stored ? 'done' : null,
    error: jobError?.message ?? local?.message ?? null,
    errorKind: jobError?.kind ?? local?.kind ?? null,
    fromCache: Boolean(stored) && !running && job?.phase !== 'done',
    stale: Boolean(stored && repo && !running && stored.commitSha !== repo.commitSha),
    run,
    cancel,
  }
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
  /**
   * The result shown was made for an older version of the code (the project has new commits since): show a note
   * and offer to regenerate. Always set by the hooks.
   */
  stale?: boolean
  run: () => void
  cancel: () => void
}

type StructuredKind = 'concepts' | 'tours' | 'quiz'

function structuredKeys(kind: StructuredKind, repo: RepoScope): { key: string; legacyKey: string } {
  return {
    key: aiCacheKey([kind, repo.fullName, repo.model, repo.level]),
    legacyKey: aiCacheKey([kind, repo.fullName, repo.commitSha, repo.model, repo.level]),
  }
}

/** The fields every structured hook derives from its saved result, its job and a local "no key" error. */
function structuredView<T>(
  data: T | null,
  stale: boolean,
  job: AiJob | undefined,
  local: LocalError | null,
): Omit<StructuredAi<T>, 'run' | 'cancel'> {
  const running = isAiJobRunning(job)
  const jobError = job?.phase === 'error' ? job.error : null
  return {
    data,
    state: running ? job.phase : jobError || local ? 'error' : data !== null ? 'done' : 'idle',
    aiStatus: running ? job.aiStatus : job?.phase === 'done' && data !== null ? 'done' : null,
    progressChars: running ? job.text.length : 0,
    error: jobError?.message ?? local?.message ?? null,
    errorKind: jobError?.kind ?? local?.kind ?? null,
    fromCache: data !== null && !running && job?.phase !== 'done',
    stale: data !== null && stale,
  }
}

function useStructured<T>(
  kind: 'concepts' | 'quiz',
  generate: (ctx: AiContext, cb: StreamCallbacks) => Promise<T>,
  parse: (value: unknown) => T | null,
  opts?: { autoRun?: boolean },
): StructuredAi<T> {
  const ai = useAiContext()
  const repo = useRepoScope()
  const keys = repo ? structuredKeys(kind, repo) : null
  const key = keys?.key ?? null
  const { known, stored } = useStored(key, keys?.legacyKey ?? null, parse, repo)
  const job = useJob(key)
  const [localError, setLocalError] = useState<LocalError | null>(null)
  const latest = useLatest({ ai, key, repo, generate })

  const run = useCallback(() => {
    const { ai: ctx, key: k, repo: r, generate: gen } = latest.current
    if (!k || !r) return
    if (!ctx) {
      setLocalError({ key: k, message: NO_KEY_EXPLAIN, kind: 'no-key' })
      return
    }
    setLocalError(null)
    launch<T>({
      key: k,
      scope: r.scope,
      private: r.isPrivate,
      run: (cb) => gen(ctx, cb),
      toError: friendlyError,
      onDone: (data) => void setCachedAi(k, storedAiResult(data, r.commitSha), cacheOptions(r.isPrivate)),
    })
  }, [latest])

  const cancel = useCallback(() => {
    const k = latest.current.key
    if (k && isAiJobRunning(getAiJob(k))) cancelAiJob(k)
  }, [latest])

  const decided = useRef<string | null>(null)
  const autoRun = Boolean(opts?.autoRun)
  useEffect(() => {
    if (!key || !known || decided.current === key) return
    decided.current = key
    if (autoRun && !stored && !getAiJob(key) && latest.current.ai) run()
  }, [key, known, stored, autoRun, run, latest])

  const local = localError && localError.key === key ? localError : null
  const stale = Boolean(stored && repo && stored.commitSha !== repo.commitSha)
  return { ...structuredView(stored?.data ?? null, stale, job, local), run, cancel }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function cachedConceptMap(v: unknown): ConceptMap | null {
  return isObject(v) && Array.isArray(v.concepts) && Array.isArray(v.relations) ? (v as unknown as ConceptMap) : null
}

function cachedTours(v: unknown): Tour[] | null {
  return Array.isArray(v) && v.every((t) => isObject(t) && typeof t.id === 'string' && Array.isArray(t.steps)) ? (v as Tour[]) : null
}

function cachedQuiz(v: unknown): Quiz | null {
  return isObject(v) && Array.isArray(v.questions) ? (v as unknown as Quiz) : null
}

const runConceptMap = (ctx: AiContext, cb: StreamCallbacks) => generateConceptMap(ctx, cb)
const runQuiz = (ctx: AiContext, cb: StreamCallbacks) => generateQuiz(ctx, cb)

/** The AI concept map ("Key Ideas"), cached per repo, model and reading level (`stale` after new commits). */
export function useConceptMap(opts?: { autoRun?: boolean }): StructuredAi<ConceptMap> {
  return useStructured('concepts', runConceptMap, cachedConceptMap, opts)
}

/** The AI quiz ("Test Yourself"), cached per repo, model and reading level (`stale` after new commits). */
export function useQuiz(opts?: { autoRun?: boolean }): StructuredAi<Quiz> {
  return useStructured('quiz', runQuiz, cachedQuiz, opts)
}

function storedTours(v: unknown): Tour[] {
  return isStoredAiResult(v) ? (cachedTours(v.data) ?? []) : []
}

/**
 * Tours: the generated set plus the reader's own tours (one per question they asked). They are saved separately,
 * so "Write new tours" replaces only the generated set and links to the reader's own tours keep working.
 */
export function useTours(opts?: { autoRun?: boolean }): StructuredAi<Tour[]> & { askTour: (question: string) => void; asking: boolean } {
  const ai = useAiContext()
  const repo = useRepoScope()
  const keys = repo ? structuredKeys('tours', repo) : null
  const genKey = keys?.key ?? null
  const customKey = repo ? aiCacheKey(['tours-custom', repo.fullName, repo.model, repo.level]) : null
  const generated = useStored(genKey, keys?.legacyKey ?? null, cachedTours, repo)
  const custom = useStored(customKey, null, cachedTours, repo)
  const genJob = useJob(genKey)
  const askJob = useJob(customKey)
  const [localError, setLocalError] = useState<LocalError | null>(null)
  const latest = useLatest({ ai, genKey, customKey, repo })

  const data = useMemo(() => {
    if (!generated.stored && !custom.stored) return null
    return [...(generated.stored?.data ?? []), ...(custom.stored?.data ?? [])]
  }, [generated.stored, custom.stored])

  const run = useCallback(() => {
    const { ai: ctx, genKey: g, customKey: c, repo: r } = latest.current
    if (!g || !c || !r) return
    if (!ctx) {
      setLocalError({ key: g, message: NO_KEY_EXPLAIN, kind: 'no-key' })
      return
    }
    setLocalError(null)
    const takenIds = new Set(storedTours(getAiCacheEntry(c)?.value).map((t) => t.id))
    launch<Tour[]>({
      key: g,
      scope: r.scope,
      private: r.isPrivate,
      run: (cb) => generateTours(ctx, { takenIds }, cb),
      toError: friendlyError,
      onDone: async (tours) => {
        // Never take an id one of the reader's own tours already uses (their links must keep working).
        const taken = new Set(storedTours(await getCachedAi(c)).map((t) => t.id))
        const next = tours.map((t) => (taken.has(t.id) ? { ...t, id: uniqueId(t.id, taken, 'tour') } : (taken.add(t.id), t)))
        void setCachedAi(g, storedAiResult(next, r.commitSha), cacheOptions(r.isPrivate))
      },
    })
  }, [latest])

  const askTour = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q) return
      const { ai: ctx, genKey: g, customKey: c, repo: r } = latest.current
      if (!g || !c || !r) return
      if (!ctx) {
        setLocalError({ key: g, message: NO_KEY_EXPLAIN, kind: 'no-key' })
        return
      }
      setLocalError(null)
      const takenIds = new Set([...storedTours(getAiCacheEntry(g)?.value), ...storedTours(getAiCacheEntry(c)?.value)].map((t) => t.id))
      launch<Tour[]>({
        key: c,
        scope: r.scope,
        private: r.isPrivate,
        run: (cb) => generateTours(ctx, { question: q, takenIds }, cb),
        toError: friendlyError,
        onDone: async (tours) => {
          const [gen, mine] = await Promise.all([getCachedAi(g), getCachedAi(c)])
          const current = storedTours(mine)
          const taken = new Set([...storedTours(gen), ...current].map((t) => t.id))
          const added = tours.slice(0, 1).map((t) => ({ ...t, id: uniqueId(t.id, taken, 'tour') }))
          void setCachedAi(c, storedAiResult([...current, ...added], r.commitSha), cacheOptions(r.isPrivate))
        },
      })
    },
    [latest],
  )

  const cancel = useCallback(() => {
    for (const k of [latest.current.genKey, latest.current.customKey]) {
      if (k && isAiJobRunning(getAiJob(k))) cancelAiJob(k)
    }
  }, [latest])

  const decided = useRef<string | null>(null)
  const autoRun = Boolean(opts?.autoRun)
  const known = generated.known && custom.known
  useEffect(() => {
    if (!genKey || !known || decided.current === genKey) return
    decided.current = genKey
    if (autoRun && !generated.stored && !custom.stored && !getAiJob(genKey) && latest.current.ai) run()
  }, [genKey, known, generated.stored, custom.stored, autoRun, run, latest])

  const local = localError && localError.key === genKey ? localError : null
  const asking = isAiJobRunning(askJob)
  const basis = generated.stored ?? custom.stored
  const stale = Boolean(repo && basis && basis.commitSha !== repo.commitSha)
  const view = structuredView(data, stale, genJob, local)
  // The most recent failure (a full run or a question) is the one to show.
  const askError = askJob?.phase === 'error' ? askJob : null
  const genError = genJob?.phase === 'error' ? genJob : null
  const lastError = askError && (!genError || askError.startedAt >= genError.startedAt) ? askError.error : null
  return {
    ...view,
    aiStatus: asking ? askJob.aiStatus : view.aiStatus,
    progressChars: asking ? askJob.text.length : view.progressChars,
    error: lastError?.message ?? view.error,
    errorKind: lastError?.kind ?? view.errorKind,
    run,
    cancel,
    askTour,
    asking,
  }
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

function chatMessages(v: unknown): ChatMessage[] {
  return Array.isArray(v) ? v.filter(isChatMessage) : []
}

/** An empty reply that nobody is writing any more (the page closed while Claude was answering). */
function isAbandonedReply(m: ChatMessage): boolean {
  return m.role === 'assistant' && !m.content.trim() && !m.error
}

/** Edit the saved chat (`edit` returns null to leave it alone). Synchronous when the chat is in memory. */
function editChat(key: string, isPrivate: boolean, edit: (messages: ChatMessage[]) => ChatMessage[] | null): void {
  const apply = (saved: unknown) => {
    const next = edit(chatMessages(saved))
    if (next) void setCachedAi(key, next, cacheOptions(isPrivate))
  }
  const entry = getAiCacheEntry(key)
  if (entry) apply(entry.value)
  else void getCachedAi(key).then(apply)
}

function patchReply(key: string, isPrivate: boolean, replyId: string, update: (m: ChatMessage) => ChatMessage | null): void {
  editChat(key, isPrivate, (messages) => {
    const reply = messages.find((m) => m.id === replyId)
    if (!reply) return null // the chat was cleared meanwhile
    const next = update(reply)
    return next ? messages.map((m) => (m.id === replyId ? next : m)) : messages.filter((m) => m.id !== replyId)
  })
}

const STOPPED_NOTE = '\n\n_(You stopped this answer.)_'

/**
 * Chat about the repo. History is saved per repository (IndexedDB) and survives reloads and new commits. A question
 * is saved the moment it is asked, and an answer keeps streaming (and is saved) when the reader switches views.
 */
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
  const ai = useAiContext()
  const repo = useRepoScope()
  const chatKey = repo ? aiCacheKey(['chat', repo.fullName]) : null
  const legacyKey = repo ? aiCacheKey(['chat', repo.fullName, repo.commitSha]) : null
  const load = useMemo(
    () =>
      legacyKey && repo
        ? {
            private: repo.isPrivate,
            fallback: async () => {
              const old = await getCachedAi<unknown>(legacyKey)
              if (!Array.isArray(old) || !chatKey) return undefined
              const messages = chatMessages(old)
              void setCachedAi(chatKey, messages, cacheOptions(repo.isPrivate))
              return messages
            },
          }
        : undefined,
    [legacyKey, chatKey, repo],
  )
  const entry = useCacheEntry(chatKey, load)
  const job = useJob(chatKey)
  const [localError, setLocalError] = useState<LocalError | null>(null)
  const latest = useLatest({ ai, chatKey, legacyKey, repo, load })

  const running = isAiJobRunning(job)
  const liveId = running ? job.ref : null
  const liveText = running ? job.text : ''
  const messages = useMemo(() => {
    const out: ChatMessage[] = []
    for (const m of chatMessages(entry.value)) {
      if (m.id === liveId) out.push({ ...m, content: liveText })
      else if (!isAbandonedReply(m)) out.push(m)
    }
    return out
  }, [entry.value, liveId, liveText])

  const send = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q) return
      const { ai: ctx, chatKey: key, repo: r, load: l } = latest.current
      if (key && isAiJobRunning(getAiJob(key))) return
      if (!key || !r) {
        setLocalError({ key, message: NO_REPO, kind: 'unknown' })
        return
      }
      if (!ctx) {
        setLocalError({ key, message: NO_KEY_CHAT, kind: 'no-key' })
        return
      }
      setLocalError(null)
      const begin = (saved: unknown) => {
        if (isAiJobRunning(getAiJob(key))) return
        const history = chatMessages(saved).filter((m) => !isAbandonedReply(m))
        const now = Date.now()
        const userMsg: ChatMessage = { id: newId(), role: 'user', content: q, createdAt: now }
        const replyId = newId()
        // Save the question straight away: it must survive the reader leaving the page while Claude answers.
        void setCachedAi(key, [...history, userMsg, { id: replyId, role: 'assistant', content: '', createdAt: now }], cacheOptions(r.isPrivate))
        launch<string>({
          key,
          ref: replyId,
          scope: r.scope,
          private: r.isPrivate,
          run: (cb) => askQuestion(ctx, history, q, cb),
          toError: friendlyError,
          onDone: (text) => patchReply(key, r.isPrivate, replyId, (m) => ({ ...m, content: text, error: undefined })),
          onError: (e) => patchReply(key, r.isPrivate, replyId, (m) => ({ ...m, error: e.message })),
          onAbort: (partial) =>
            patchReply(key, r.isPrivate, replyId, (m) => (partial.trim() ? { ...m, content: partial + STOPPED_NOTE } : null)),
        })
      }
      const saved = getAiCacheEntry(key)
      if (saved) begin(saved.value)
      else void getCachedAi(key, l).then(begin)
    },
    [latest],
  )

  const cancel = useCallback(() => {
    // The partial reply is kept with a note (or dropped if Claude hadn't written anything yet).
    const key = latest.current.chatKey
    if (key && isAiJobRunning(getAiJob(key))) cancelAiJob(key)
  }, [latest])

  const clear = useCallback(() => {
    const { chatKey: key, legacyKey: old, repo: r } = latest.current
    setLocalError(null)
    if (!key || !r) return
    cancelAiJob(key)
    void setCachedAi(key, [], cacheOptions(r.isPrivate))
    if (old) void deleteCachedAi(old)
  }, [latest])

  const local = localError && localError.key === chatKey ? localError : null
  const jobError = job?.phase === 'error' ? job.error : null
  const state: AiRunState = running ? job.phase : jobError || local ? 'error' : job?.phase === 'done' ? 'done' : 'idle'
  return {
    messages,
    send,
    state,
    aiStatus: running ? job.aiStatus : job?.phase === 'done' ? 'done' : null,
    error: jobError?.message ?? local?.message ?? null,
    errorKind: jobError?.kind ?? local?.kind ?? null,
    cancel,
    clear,
  }
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
