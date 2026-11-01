import type { ChatMessage, ConceptMap, Quiz, Tour } from '@/core/types'
import type { AiContext, AiStatus, ExplainTask, PromptTask } from './types'

export type AiRunState = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

/** Returns an AiContext when a repo is loaded AND a Claude API key is set; otherwise null. Re-renders on settings changes. */
export function useAiContext(): AiContext | null {
  return null
}

/** True when the user has saved a Claude API key. */
export function useHasAiKey(): boolean {
  return false
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
  void task; void opts
  return { text: '', state: 'idle', aiStatus: null, error: null, errorKind: null, fromCache: false, run: () => {}, cancel: () => {} }
}

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

export function useConceptMap(): StructuredAi<ConceptMap> {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false, run: () => {}, cancel: () => {} }
}

/** Tours: generated set (cached) plus the ability to request a custom tour for a question (appended & cached). */
export function useTours(): StructuredAi<Tour[]> & { askTour: (question: string) => void; asking: boolean } {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false, run: () => {}, cancel: () => {}, askTour: () => {}, asking: false }
}

export function useQuiz(): StructuredAi<Quiz> {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false, run: () => {}, cancel: () => {} }
}

/** Chat about the repo. History persists per repo (IndexedDB) and survives reloads. */
export function useChat(): {
  messages: ChatMessage[]
  send: (question: string) => void
  state: AiRunState
  aiStatus: AiStatus | null
  error: string | null
  cancel: () => void
  clear: () => void
} {
  return { messages: [], send: () => {}, state: 'idle', aiStatus: null, error: null, cancel: () => {}, clear: () => {} }
}

/** Build a copy-paste prompt for claude.ai (for users without an API key). */
export function useCopyPrompt(): (task: PromptTask) => Promise<string> {
  return async () => ''
}

export type { ExplainTask, PromptTask }
