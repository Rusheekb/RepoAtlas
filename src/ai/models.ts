import type { ModelId } from '@/core/types'

/**
 * Model facts the request builder needs, kept out of ./client so they can be used without loading the Anthropic SDK.
 */

/** Server-side refusal fallbacks exist for Opus 5.5 and Sonnet 5.5 only (never send them for Haiku 5.5). */
export function supportsRefusalFallbacks(model: ModelId): boolean {
  return model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5'
}
