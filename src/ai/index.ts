import type { ZodType } from 'zod'
import type { ModelId } from '@/core/types'
import type { ClaudeRequest } from './client'
import type { AiUsage, StreamCallbacks } from './types'

export * from './types'
export type { ClaudeRequest } from './client'
export { supportsRefusalFallbacks } from './models'
export { buildRepoContext, getRepoContext, type RepoContext, type FileCoverage } from './context'
export {
  getCachedAi,
  setCachedAi,
  deleteCachedAi,
  clearAiCache,
  forgetPrivateAiData,
  aiCacheKey,
  type AiCacheOptions,
} from './cache'
export { useAiJobs, cancelAiJob, type AiJob, type AiJobPhase } from './jobs'
export { SYSTEM_INSTRUCTIONS, levelGuidance } from './prompts'
export {
  runExplainTask,
  generateConceptMap,
  generateTours,
  generateQuiz,
  askQuestion,
  buildCopyPrompt,
  explainTaskKey,
  type PromptInput,
} from './tasks'
export { pickRelevantFiles } from './relevance'
export {
  useAiContext,
  useHasAiKey,
  useExplanation,
  useExplanationCacheKey,
  useConceptMap,
  useTours,
  useQuiz,
  useChat,
  useCopyPrompt,
  type AiRunState,
  type StructuredAi,
} from './useAi'

/*
 * The Anthropic SDK and zod are heavy and only needed once a reader actually calls Claude, so this barrel never pulls
 * them in statically: the functions below load ./client on first use. The zod schemas and the synchronous error
 * mappers (toAiError, describeAiError) need those libraries, so they are not re-exported here: import them from
 * '@/ai/schemas' / '@/ai/client' (ideally with a dynamic import) where they're really needed.
 */
type Client = typeof import('./client')
const loadClient = (): Promise<Client> => import('./client')

/** Stream a markdown answer from Claude (see ./client). */
export async function streamText(req: ClaudeRequest, cb?: StreamCallbacks): Promise<{ text: string; usage: AiUsage }> {
  return (await loadClient()).streamText(req, cb)
}

/** Like streamText, constrained to a zod schema (see ./client). */
export async function generateStructured<T>(req: ClaudeRequest, schema: ZodType<T>, cb?: StreamCallbacks): Promise<{ data: T; usage: AiUsage }> {
  return (await loadClient()).generateStructured(req, schema, cb)
}

/** Check an API key cheaply (see ./client). */
export async function testConnection(apiKey: string, model: ModelId): Promise<{ ok: boolean; message: string }> {
  return (await loadClient()).testConnection(apiKey, model)
}
