import type { Concept, ContextSize, ModelId, ReadingLevel, RepoAnalysis, RepoSnapshot } from '@/core/types'

/** Everything an AI task needs. Built from the settings + repo stores by useAiContext(). */
export interface AiContext {
  apiKey: string
  model: ModelId
  level: ReadingLevel
  contextSize: ContextSize
  analysis: RepoAnalysis
  snapshot: RepoSnapshot
  /** Fetch any file's text (downloads on demand if it wasn't in the snapshot). */
  getFileContent: (path: string) => Promise<string>
}

/** Lifecycle of one Claude call, for friendly UI status ("Claude is reading the code…", "Writing…"). */
export type AiStatus = 'connecting' | 'thinking' | 'writing' | 'done'

export interface StreamCallbacks {
  /** Called with the full text so far (not the delta) as it streams. */
  onText?: (fullText: string) => void
  onStatus?: (status: AiStatus) => void
  signal?: AbortSignal
}

/** Things that can be explained in markdown prose. */
export type ExplainTask =
  | { kind: 'overview' }
  | { kind: 'module'; moduleId: string }
  | { kind: 'file'; path: string }
  | { kind: 'folder'; path: string }
  | { kind: 'selection'; path: string; startLine: number; endLine: number }
  | { kind: 'concept'; concept: Concept }
  | { kind: 'tech'; techId: string }
  | { kind: 'term'; termId: string }

/** Every prompt the app can build (used for "copy prompt" when there's no API key). */
export type PromptTask =
  | ExplainTask
  | { kind: 'concepts' }
  | { kind: 'tours'; question?: string }
  | { kind: 'quiz' }
  | { kind: 'chat'; question: string }

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Friendly AI error. `kind` lets the UI offer the right fix (e.g. open Settings for a bad key). */
export class AiError extends Error {
  kind: 'no-key' | 'invalid-key' | 'rate-limited' | 'overloaded' | 'refused' | 'too-long' | 'network' | 'aborted' | 'bad-output' | 'unknown'
  detail?: string
  constructor(kind: AiError['kind'], message: string, detail?: string) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.detail = detail
  }
}

export type { RepoAnalysis, RepoSnapshot }
