import type { ChatMessage, ConceptMap, Quiz, Tour } from '@/core/types'
import type { AiContext, ExplainTask, PromptTask, StreamCallbacks } from './types'

/** Stream a markdown explanation for a module / file / folder / selection / concept / tech / term / the whole project. */
export async function runExplainTask(ctx: AiContext, task: ExplainTask, cb?: StreamCallbacks): Promise<string> {
  void ctx; void task; void cb
  throw new Error('TODO: implement runExplainTask')
}

/** Generate the AI concept map (8–18 concepts, relations reference concept ids, files are real repo paths). source: 'ai'. */
export async function generateConceptMap(ctx: AiContext, cb?: StreamCallbacks): Promise<ConceptMap> {
  void ctx; void cb
  throw new Error('TODO: implement generateConceptMap')
}

/**
 * Generate guided tours (3–5 tours of 4–9 steps), or a single tour answering `question` ("How does login work?").
 * Steps reference real files, verbatim snippets and module ids from the analysis. source: 'ai'.
 */
export async function generateTours(ctx: AiContext, opts?: { question?: string }, cb?: StreamCallbacks): Promise<Tour[]> {
  void ctx; void opts; void cb
  throw new Error('TODO: implement generateTours')
}

/** Generate a 6–8 question multiple-choice quiz about how this project works. */
export async function generateQuiz(ctx: AiContext, cb?: StreamCallbacks): Promise<Quiz> {
  void ctx; void cb
  throw new Error('TODO: implement generateQuiz')
}

/** Answer a question about the repo, given prior chat history. Pulls in files mentioned/relevant to the question. */
export async function askQuestion(ctx: AiContext, history: ChatMessage[], question: string, cb?: StreamCallbacks): Promise<string> {
  void ctx; void history; void question; void cb
  throw new Error('TODO: implement askQuestion')
}

/**
 * Build a complete, self-contained prompt (instructions + repo context + task) that a user without an API key can
 * paste into claude.ai. Uses a smaller context so it fits in a chat message.
 */
export async function buildCopyPrompt(ctx: Omit<AiContext, 'apiKey' | 'model'>, task: PromptTask): Promise<string> {
  void ctx; void task
  throw new Error('TODO: implement buildCopyPrompt')
}
