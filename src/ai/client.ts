import type { BetaMessageParam, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { z } from 'zod'
import type { ModelId } from '@/core/types'
import type { AiUsage, StreamCallbacks } from './types'

export interface ClaudeRequest {
  apiKey: string
  model: ModelId
  system: BetaTextBlockParam[]
  messages: BetaMessageParam[]
  effort: 'low' | 'medium' | 'high'
  maxTokens?: number
}

/**
 * Stream a markdown answer from Claude (browser, user's own key — dangerouslyAllowBrowser: true).
 * Uses client.beta.messages.stream with adaptive thinking, output_config.effort, and server-side refusal fallbacks
 * (betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default') for Opus 5.5 / Sonnet 5.5 (not Haiku 5.5).
 * Reports status: connecting → thinking (thinking blocks) → writing (text deltas) → done.
 * Checks stop_reason ('refusal' → AiError('refused'), 'max_tokens' → keep text, append a note).
 * Maps SDK errors (Anthropic.AuthenticationError, RateLimitError, …) to AiError with friendly messages.
 */
export async function streamText(req: ClaudeRequest, cb?: StreamCallbacks): Promise<{ text: string; usage: AiUsage }> {
  void req; void cb
  throw new Error('TODO: implement streamText')
}

/** Like streamText but constrains output to a zod schema (output_config.format via betaZodOutputFormat) and returns the parsed object. */
export async function generateStructured<T>(
  req: ClaudeRequest,
  schema: z.ZodType<T>,
  cb?: StreamCallbacks,
): Promise<{ data: T; usage: AiUsage }> {
  void req; void schema; void cb
  throw new Error('TODO: implement generateStructured')
}

/** Validate an API key cheaply (e.g. client.models.retrieve(model)) without generating tokens. */
export async function testConnection(apiKey: string, model: ModelId): Promise<{ ok: boolean; message: string }> {
  void apiKey; void model
  throw new Error('TODO: implement testConnection')
}

/** Turn any error into a friendly one-line message for non-technical users. */
export function describeAiError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
