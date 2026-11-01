import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { z } from 'zod'
import { MODELS } from '@/core/labels'
import type { ModelId } from '@/core/types'
import { AiError, type AiStatus, type AiUsage, type StreamCallbacks } from './types'

export interface ClaudeRequest {
  apiKey: string
  model: ModelId
  system: BetaTextBlockParam[]
  messages: BetaMessageParam[]
  effort: 'low' | 'medium' | 'high'
  maxTokens?: number
}

/** Generous by design: answers stream, so a high ceiling costs nothing unless Claude actually needs it. */
export const DEFAULT_MAX_TOKENS = 32_000

/** Appended to an answer that hit the output limit. */
export const CUT_SHORT_NOTE = '\n\n_(Answer cut short — it got very long.)_'

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** Server-side refusal fallbacks exist for Opus 5.5 and Sonnet 5.5 only (never send them for Haiku 5.5). */
export function supportsRefusalFallbacks(model: ModelId): boolean {
  return model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5'
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

let cached: { key: string; client: Anthropic } | null = null

/** One SDK client per API key (the user's own key, used straight from the browser). */
function getClient(apiKey: string): Anthropic {
  if (cached?.key === apiKey) return cached.client
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  cached = { key: apiKey, client }
  return client
}

function requireKey(apiKey: string): string {
  const key = apiKey.trim()
  if (!key) throw new AiError('no-key', 'Add your Claude API key in Settings to use Claude.')
  return key
}

/**
 * The exact request body sent to Claude. Exported for tests.
 * Adaptive thinking is always on; effort is always explicit; no sampling parameters, no prefill.
 */
export function buildStreamParams(req: ClaudeRequest, format?: ReturnType<typeof betaZodOutputFormat>): BetaMessageStreamParams {
  const params: BetaMessageStreamParams = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: format ? { effort: req.effort, format } : { effort: req.effort },
    system: req.system,
    messages: req.messages,
  }
  if (supportsRefusalFallbacks(req.model)) {
    params.betas = [FALLBACK_BETA]
    params.fallbacks = 'default'
  }
  return params
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming
// ─────────────────────────────────────────────────────────────────────────────

/** Calls `fn` with the latest value at most once every `ms` (leading + trailing), so React re-renders stay cheap. */
export function createThrottle(fn: ((value: string) => void) | undefined, ms = 50) {
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = 0
  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending === null || !fn) return
    const value = pending
    pending = null
    last = Date.now()
    fn(value)
  }
  return {
    push(value: string) {
      if (!fn) return
      pending = value
      const wait = ms - (Date.now() - last)
      if (wait <= 0) flush()
      else if (!timer) timer = setTimeout(flush, wait)
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}

function toUsage(u: Partial<BetaMessage['usage']> | null | undefined): AiUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  }
}

function textOf(message: BetaMessage): string {
  let out = ''
  for (const block of message.content) if (block.type === 'text') out += block.text
  return out
}

const REFUSED_MESSAGE =
  'Claude decided not to answer this one. That occasionally happens with code about security or similar sensitive topics. Try asking in a different way, or about a different part of the project.'

interface StreamOutcome<P> {
  final: BetaMessage & { parsed_output?: P | null }
  text: string
}

interface StreamFailure {
  error: unknown
  /** Text received before the failure. */
  text: string
  stopReason: string | null
  usage: AiUsage
}

class StreamFailed extends Error {
  failure: StreamFailure
  constructor(failure: StreamFailure) {
    super('stream failed')
    this.failure = failure
  }
}

async function runStream<P>(
  req: ClaudeRequest,
  format: ReturnType<typeof betaZodOutputFormat> | undefined,
  cb: StreamCallbacks | undefined,
): Promise<StreamOutcome<P>> {
  const apiKey = requireKey(req.apiKey)
  if (cb?.signal?.aborted) throw new AiError('aborted', 'Stopped.')

  let status: AiStatus | null = null
  const setStatus = (next: AiStatus) => {
    if (status === next) return
    status = next
    cb?.onStatus?.(next)
  }
  setStatus('connecting')

  const throttle = createThrottle(cb?.onText)
  let text = ''
  let stopReason: string | null = null
  let usage: AiUsage = toUsage(null)

  try {
    const client = getClient(apiKey)
    const stream = client.beta.messages.stream(buildStreamParams({ ...req, apiKey }, format), { signal: cb?.signal })
    for await (const event of stream as AsyncIterable<BetaRawMessageStreamEvent>) {
      switch (event.type) {
        case 'message_start':
          usage = toUsage(event.message.usage)
          break
        case 'content_block_start':
          if (event.content_block.type === 'thinking' || event.content_block.type === 'redacted_thinking') setStatus('thinking')
          else if (event.content_block.type === 'text') setStatus('writing')
          break
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            text += event.delta.text
            throttle.push(text)
          }
          break
        case 'message_delta':
          if (event.delta.stop_reason) stopReason = event.delta.stop_reason
          usage = {
            inputTokens: event.usage.input_tokens ?? usage.inputTokens,
            outputTokens: event.usage.output_tokens ?? usage.outputTokens,
            cacheReadTokens: event.usage.cache_read_input_tokens ?? usage.cacheReadTokens,
            cacheWriteTokens: event.usage.cache_creation_input_tokens ?? usage.cacheWriteTokens,
          }
          break
        default:
          break
      }
    }
    const final = (await stream.finalMessage()) as BetaMessage & { parsed_output?: P | null }
    throttle.flush()
    return { final, text }
  } catch (error) {
    throttle.cancel()
    throw new StreamFailed({ error, text, stopReason, usage })
  }
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
  let outcome: StreamOutcome<null>
  try {
    outcome = await runStream<null>(req, undefined, cb)
  } catch (err) {
    if (err instanceof StreamFailed) {
      if (err.failure.stopReason === 'refusal') throw new AiError('refused', REFUSED_MESSAGE)
      throw toAiError(err.failure.error, cb?.signal)
    }
    throw toAiError(err, cb?.signal)
  }
  const { final } = outcome
  if (final.stop_reason === 'refusal') throw new AiError('refused', REFUSED_MESSAGE)

  let text = textOf(final) || outcome.text
  if (!text.trim()) throw new AiError('bad-output', 'Claude didn’t write an answer this time. Please try again.')
  if (final.stop_reason === 'max_tokens' || final.stop_reason === 'model_context_window_exceeded') text += CUT_SHORT_NOTE

  cb?.onText?.(text)
  cb?.onStatus?.('done')
  return { text, usage: toUsage(final.usage) }
}

function parseLoose<T>(schema: z.ZodType<T>, text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  if (!trimmed) return null
  try {
    const parsed = schema.safeParse(JSON.parse(trimmed))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function isStructuredParseError(err: unknown): boolean {
  return err instanceof Error && /failed to parse structured output/i.test(err.message)
}

const TOO_LONG_OUTPUT =
  'Claude’s answer got so long it was cut off before it finished. Please try again — choosing a smaller “Context size” in Settings can help.'
const BAD_OUTPUT = 'Claude’s answer came back in a shape RepoAtlas couldn’t read. Please try again.'

/** Like streamText but constrains output to a zod schema (output_config.format via betaZodOutputFormat) and returns the parsed object. */
export async function generateStructured<T>(
  req: ClaudeRequest,
  schema: z.ZodType<T>,
  cb?: StreamCallbacks,
): Promise<{ data: T; usage: AiUsage }> {
  const format = betaZodOutputFormat(schema)
  let outcome: StreamOutcome<T>
  try {
    outcome = await runStream<T>(req, format, cb)
  } catch (err) {
    if (!(err instanceof StreamFailed)) throw toAiError(err, cb?.signal)
    const { error, text, stopReason, usage } = err.failure
    if (stopReason === 'refusal') throw new AiError('refused', REFUSED_MESSAGE)
    if (isStructuredParseError(error)) {
      // The SDK parses each text block on its own; a fallback hop can split the JSON across blocks. Try the whole text.
      const data = parseLoose(schema, text)
      if (data !== null) {
        cb?.onStatus?.('done')
        return { data, usage }
      }
      if (stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded') throw new AiError('bad-output', TOO_LONG_OUTPUT)
      throw new AiError('bad-output', BAD_OUTPUT, error instanceof Error ? error.message : String(error))
    }
    throw toAiError(error, cb?.signal)
  }

  const { final } = outcome
  if (final.stop_reason === 'refusal') throw new AiError('refused', REFUSED_MESSAGE)
  const data = final.parsed_output ?? parseLoose(schema, textOf(final) || outcome.text)
  if (data === null || data === undefined) {
    if (final.stop_reason === 'max_tokens' || final.stop_reason === 'model_context_window_exceeded') throw new AiError('bad-output', TOO_LONG_OUTPUT)
    throw new AiError('bad-output', BAD_OUTPUT)
  }
  cb?.onStatus?.('done')
  return { data, usage: toUsage(final.usage) }
}

/** Validate an API key cheaply (e.g. client.models.retrieve(model)) without generating tokens. */
export async function testConnection(apiKey: string, model: ModelId): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'Paste your Claude API key first. It starts with sk-ant-.' }
  try {
    await getClient(key).models.retrieve(model)
    const label = MODELS[model]?.label ?? model
    const note = key.startsWith('sk-ant-') ? '' : ' (Heads-up: Claude API keys usually start with sk-ant-.)'
    return { ok: true, message: `Connected! ${label} is ready to explain code.${note}` }
  } catch (err) {
    return { ok: false, message: describeAiError(err) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : ''
}

/** Error "type" from an Anthropic error body ({ type: 'error', error: { type: 'billing_error', … } }), if present. */
function apiErrorType(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { type?: unknown }; type?: unknown } | undefined
  const t = body?.error?.type ?? body?.type
  return typeof t === 'string' ? t : ''
}

const BILLING_MESSAGE =
  'Your Anthropic account seems to be out of credit. Add credit at console.anthropic.com (Billing), then try again.'

/** Map any thrown value (SDK error, AbortError, AiError …) to a friendly AiError. Most specific checks first. */
export function toAiError(err: unknown, signal?: AbortSignal): AiError {
  if (err instanceof AiError) return err
  if (err instanceof StreamFailed) return toAiError(err.failure.error, signal)
  const detail = errorText(err) || undefined

  if (
    signal?.aborted ||
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  ) {
    return new AiError('aborted', 'Stopped.', detail)
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError('invalid-key', 'Claude didn’t accept that API key. Check it in Settings — it should start with sk-ant-.', detail)
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(
      'invalid-key',
      'Your API key works, but your Anthropic account isn’t allowed to do this. Check your account at console.anthropic.com, or pick a different model in Settings.',
      detail,
    )
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError('invalid-key', 'That Claude model isn’t available to your account. Pick a different model in Settings.', detail)
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError(
      'rate-limited',
      'You’ve reached Claude’s usage limit for the moment. Wait a minute and try again (your plan’s limits are at console.anthropic.com).',
      detail,
    )
  }
  if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && (err.status === 529 || (err.status ?? 0) >= 500))) {
    return new AiError('overloaded', 'Claude is very busy right now. Please try again in a minute.', detail)
  }
  if (err instanceof Anthropic.BadRequestError) {
    const msg = errorText(err)
    if (/credit balance|billing|purchase credits/i.test(msg) || apiErrorType(err) === 'billing_error') {
      return new AiError('unknown', BILLING_MESSAGE, detail)
    }
    if (/prompt is too long|too many tokens|context (window|length)|exceeds? .*(context|token limit)/i.test(msg)) {
      return new AiError(
        'too-long',
        'This project is too big to send to Claude in one go. In Settings, choose a smaller “Context size” and try again.',
        detail,
      )
    }
    return new AiError('unknown', 'Claude couldn’t handle that request. Please try again — if it keeps happening, try a different model in Settings.', detail)
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError('network', 'Claude took too long to respond. Check your internet connection and try again.', detail)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError(
      'network',
      'Couldn’t reach Claude. Check your internet connection and try again. (Ad-blockers or strict firewalls can also block api.anthropic.com.)',
      detail,
    )
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402 || apiErrorType(err) === 'billing_error') return new AiError('unknown', BILLING_MESSAGE, detail)
    return new AiError('unknown', 'Something went wrong while talking to Claude. Please try again.', detail)
  }
  if (isStructuredParseError(err)) return new AiError('bad-output', BAD_OUTPUT, detail)
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return new AiError('network', 'Couldn’t reach Claude. Check your internet connection and try again.', detail)
  }
  return new AiError('unknown', 'Something went wrong while talking to Claude. Please try again.', detail)
}

/** Turn any error into a friendly one-line message for non-technical users. */
export function describeAiError(err: unknown): string {
  return toAiError(err).message
}
