export * from './types'
export {
  streamText,
  generateStructured,
  testConnection,
  describeAiError,
  toAiError,
  supportsRefusalFallbacks,
  type ClaudeRequest,
} from './client'
export { buildRepoContext, getRepoContext, type RepoContext } from './context'
export { getCachedAi, setCachedAi, deleteCachedAi, clearAiCache, aiCacheKey } from './cache'
export { ConceptMapSchema, ToursSchema, QuizSchema } from './schemas'
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
