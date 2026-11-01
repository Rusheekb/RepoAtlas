export * from './types'
export { streamText, generateStructured, testConnection, describeAiError, type ClaudeRequest } from './client'
export { buildRepoContext, type RepoContext } from './context'
export { getCachedAi, setCachedAi, clearAiCache, aiCacheKey } from './cache'
export { ConceptMapSchema, ToursSchema, QuizSchema } from './schemas'
export { SYSTEM_INSTRUCTIONS, levelGuidance } from './prompts'
export { runExplainTask, generateConceptMap, generateTours, generateQuiz, askQuestion, buildCopyPrompt } from './tasks'
export {
  useAiContext,
  useHasAiKey,
  useExplanation,
  useConceptMap,
  useTours,
  useQuiz,
  useChat,
  useCopyPrompt,
  type AiRunState,
  type StructuredAi,
} from './useAi'
