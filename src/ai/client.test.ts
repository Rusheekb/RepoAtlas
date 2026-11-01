import { z } from 'zod'
import type { ModelId } from '@/core/types'
import { CUT_SHORT_NOTE, createThrottle, generateStructured, streamText, testConnection, toAiError, type ClaudeRequest } from './client'
import { AiError, type AiStatus } from './types'

const mocks = vi.hoisted(() => ({ stream: vi.fn(), retrieve: vi.fn(), ctor: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number | undefined
    error: unknown
    constructor(status?: number, error?: unknown, message?: string) {
      super(message ?? 'api error')
      this.status = status
      this.error = error
    }
  }
  class APIUserAbortError extends APIError {
    constructor() {
      super(undefined, undefined, 'Request was aborted.')
    }
  }
  class APIConnectionError extends APIError {
    constructor(message = 'Connection error.') {
      super(undefined, undefined, message)
    }
  }
  class APIConnectionTimeoutError extends APIConnectionError {}
  class BadRequestError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class Anthropic {
    static APIError = APIError
    static APIUserAbortError = APIUserAbortError
    static APIConnectionError = APIConnectionError
    static APIConnectionTimeoutError = APIConnectionTimeoutError
    static BadRequestError = BadRequestError
    static AuthenticationError = AuthenticationError
    static PermissionDeniedError = PermissionDeniedError
    static NotFoundError = NotFoundError
    static RateLimitError = RateLimitError
    static InternalServerError = InternalServerError
    beta = { messages: { stream: (...args: unknown[]) => mocks.stream(...args) } }
    models = { retrieve: (...args: unknown[]) => mocks.retrieve(...args) }
    constructor(opts: unknown) {
      mocks.ctor(opts)
    }
  }
  return { default: Anthropic }
})

// Import after the mock so we can construct the mocked error classes.
const { default: Anthropic } = await import('@anthropic-ai/sdk')

/** Construct one of the mocked SDK error classes (their constructors differ from the real typings). */
function sdkError(Cls: unknown, ...args: unknown[]): Error {
  return new (Cls as new (...a: unknown[]) => Error)(...args)
}

type Ev = Record<string, unknown>

function textEvents(chunks: string[], stopReason = 'end_turn'): Ev[] {
  return [
    { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    ...chunks.map((text) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } })),
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ]
}

function finalMessage(text: string, stopReason = 'end_turn', parsed?: unknown) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 90, cache_creation_input_tokens: 10 },
    ...(parsed !== undefined ? { parsed_output: parsed } : {}),
  }
}

function fakeStream(events: Ev[], final: unknown, failWith?: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e
      if (failWith) throw failWith
    },
    finalMessage: async () => {
      if (failWith) throw failWith
      return final
    },
  }
}

let keyN = 0
function req(model: ModelId = 'claude-opus-5-5', effort: ClaudeRequest['effort'] = 'medium'): ClaudeRequest {
  return {
    apiKey: `sk-ant-test-${++keyN}`,
    model,
    effort,
    system: [
      { type: 'text', text: 'instructions' },
      { type: 'text', text: 'repo', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'Explain it' }],
  }
}

beforeEach(() => {
  mocks.stream.mockReset()
  mocks.retrieve.mockReset()
  mocks.ctor.mockReset()
})

describe('streamText request params', () => {
  it.each<ModelId>(['claude-opus-5-5', 'claude-sonnet-5-5'])('sends adaptive thinking, explicit effort and refusal fallbacks for %s', async (model) => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['Hi']), finalMessage('Hi')))
    const ctrl = new AbortController()
    const r = req(model, 'high')
    await streamText(r, { signal: ctrl.signal })
    expect(mocks.ctor).toHaveBeenCalledWith({ apiKey: r.apiKey, dangerouslyAllowBrowser: true })
    const [params, options] = mocks.stream.mock.calls[0]
    expect(params).toEqual({
      model,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: r.system,
      messages: r.messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    expect(options).toEqual({ signal: ctrl.signal })
  })

  it('never sends fallbacks for Haiku', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['Hi']), finalMessage('Hi')))
    await streamText(req('claude-haiku-5-5'))
    const [params] = mocks.stream.mock.calls[0]
    expect(params).not.toHaveProperty('fallbacks')
    expect(params).not.toHaveProperty('betas')
    expect(params.thinking).toEqual({ type: 'adaptive' })
    expect(params.output_config).toEqual({ effort: 'medium' })
  })

  it('never sends sampling params, budget_tokens or a prefill', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['Hi']), finalMessage('Hi')))
    await streamText(req())
    const [params] = mocks.stream.mock.calls[0]
    for (const k of ['temperature', 'top_p', 'top_k']) expect(params).not.toHaveProperty(k)
    expect(params.thinking).not.toHaveProperty('budget_tokens')
    expect(params.messages.at(-1).role).toBe('user')
  })

  it('reuses one client per key', async () => {
    mocks.stream.mockImplementation(() => fakeStream(textEvents(['Hi']), finalMessage('Hi')))
    const r = req()
    await streamText(r)
    await streamText(r)
    expect(mocks.ctor).toHaveBeenCalledTimes(1)
  })

  it('refuses to call Claude without a key', async () => {
    await expect(streamText({ ...req(), apiKey: '  ' })).rejects.toMatchObject({ kind: 'no-key' })
    expect(mocks.stream).not.toHaveBeenCalled()
  })
})

describe('streamText streaming', () => {
  it('reports status and the full text as it streams', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['Hello ', 'world', '!']), finalMessage('Hello world!')))
    const statuses: AiStatus[] = []
    const texts: string[] = []
    const result = await streamText(req(), { onStatus: (s) => statuses.push(s), onText: (t) => texts.push(t) })
    expect(statuses).toEqual(['connecting', 'thinking', 'writing', 'done'])
    expect(texts.at(-1)).toBe('Hello world!')
    expect(texts.every((t) => 'Hello world!'.startsWith(t))).toBe(true)
    expect(result).toEqual({
      text: 'Hello world!',
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 90, cacheWriteTokens: 10 },
    })
  })

  it('throttles onText', async () => {
    const chunks = Array.from({ length: 500 }, () => 'x')
    mocks.stream.mockReturnValue(fakeStream(textEvents(chunks), finalMessage('x'.repeat(500))))
    const onText = vi.fn()
    await streamText(req(), { onText })
    expect(onText.mock.calls.length).toBeLessThan(20)
    expect(onText).toHaveBeenLastCalledWith('x'.repeat(500))
  })

  it('throws a friendly refusal error on stop_reason "refusal"', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['partial'], 'refusal'), finalMessage('partial', 'refusal')))
    await expect(streamText(req())).rejects.toMatchObject({ name: 'AiError', kind: 'refused' })
  })

  it('keeps the text and adds a note on stop_reason "max_tokens"', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['Long answer'], 'max_tokens'), finalMessage('Long answer', 'max_tokens')))
    const { text } = await streamText(req())
    expect(text).toBe(`Long answer${CUT_SHORT_NOTE}`)
    expect(text).toContain('_(Answer cut short — it got very long.)_')
  })

  it('treats an empty answer as bad output', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents([]), finalMessage('')))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'bad-output' })
  })

  it('maps errors thrown mid-stream', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['a']), null, sdkError(Anthropic.RateLimitError, 429, {}, 'rate limited')))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('reports aborts as "aborted"', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(streamText(req(), { signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' })
    mocks.stream.mockReturnValue(fakeStream([], null, sdkError(Anthropic.APIUserAbortError)))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'aborted' })
  })
})

describe('toAiError', () => {
  const cases: [string, unknown, AiError['kind']][] = [
    ['AuthenticationError', sdkError(Anthropic.AuthenticationError, 401, {}, 'invalid x-api-key'), 'invalid-key'],
    ['PermissionDeniedError', sdkError(Anthropic.PermissionDeniedError, 403, {}, 'forbidden'), 'invalid-key'],
    ['NotFoundError', sdkError(Anthropic.NotFoundError, 404, {}, 'model not found'), 'invalid-key'],
    ['RateLimitError', sdkError(Anthropic.RateLimitError, 429, {}, 'slow down'), 'rate-limited'],
    ['InternalServerError', sdkError(Anthropic.InternalServerError, 500, {}, 'oops'), 'overloaded'],
    ['status 529', sdkError(Anthropic.APIError, 529, {}, 'Overloaded'), 'overloaded'],
    ['BadRequest prompt too long', sdkError(Anthropic.BadRequestError, 400, {}, 'prompt is too long: 250000 tokens > 200000 maximum'), 'too-long'],
    ['BadRequest context window', sdkError(Anthropic.BadRequestError, 400, {}, 'input exceeds the context window'), 'too-long'],
    ['BadRequest other', sdkError(Anthropic.BadRequestError, 400, {}, 'messages: field required'), 'unknown'],
    ['APIConnectionError', sdkError(Anthropic.APIConnectionError), 'network'],
    ['APIConnectionTimeoutError', sdkError(Anthropic.APIConnectionTimeoutError, 'Request timed out.'), 'network'],
    ['APIUserAbortError', sdkError(Anthropic.APIUserAbortError), 'aborted'],
    ['DOM AbortError', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), 'aborted'],
    ['parse failure', new Error('Failed to parse structured output: bad'), 'bad-output'],
    ['random', new Error('kaboom'), 'unknown'],
    ['string', 'kaboom', 'unknown'],
  ]
  it.each(cases)('%s', (_name, err, kind) => {
    const e = toAiError(err)
    expect(e).toBeInstanceOf(AiError)
    expect(e.kind).toBe(kind)
    expect(e.message.length).toBeGreaterThan(5)
  })

  it('uses warm, non-technical messages', () => {
    expect(toAiError(sdkError(Anthropic.AuthenticationError, 401, {}, 'x')).message).toBe(
      'Claude didn’t accept that API key. Check it in Settings — it should start with sk-ant-.',
    )
    expect(toAiError(sdkError(Anthropic.InternalServerError, 529, {}, 'x')).message).toBe('Claude is very busy right now. Please try again in a minute.')
    expect(toAiError(sdkError(Anthropic.BadRequestError, 400, {}, 'Your credit balance is too low')).message).toMatch(/out of credit/)
  })

  it('treats an aborted signal as aborted regardless of the error', () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(toAiError(new Error('whatever'), ctrl.signal).kind).toBe('aborted')
  })

  it('passes AiErrors through', () => {
    const e = new AiError('refused', 'no')
    expect(toAiError(e)).toBe(e)
  })
})

describe('generateStructured', () => {
  const Schema = z.object({ items: z.array(z.string()) })

  it('sends a JSON schema format and returns parsed_output', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['{"items":["a"]}']), finalMessage('{"items":["a"]}', 'end_turn', { items: ['a'] })))
    const { data } = await generateStructured(req('claude-opus-5-5', 'high'), Schema)
    expect(data).toEqual({ items: ['a'] })
    const [params] = mocks.stream.mock.calls[0]
    expect(params.output_config.effort).toBe('high')
    expect(params.output_config.format.type).toBe('json_schema')
    expect(params.output_config.format.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(params.max_tokens).toBe(32000)
    expect(params.fallbacks).toBe('default')
  })

  it('falls back to parsing the text when parsed_output is missing', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['{"items":["b"]}']), finalMessage('{"items":["b"]}')))
    const { data } = await generateStructured(req(), Schema)
    expect(data).toEqual({ items: ['b'] })
  })

  it('recovers when the SDK fails to parse but the full text is valid', async () => {
    mocks.stream.mockReturnValue(
      fakeStream(textEvents(['{"items":', '["c"]}']), null, new Error('Failed to parse structured output: split block')),
    )
    const { data } = await generateStructured(req(), Schema)
    expect(data).toEqual({ items: ['c'] })
  })

  it('reports refusals and unusable output', async () => {
    mocks.stream.mockReturnValue(fakeStream(textEvents(['{"it'], 'refusal'), null, new Error('Failed to parse structured output: x')))
    await expect(generateStructured(req(), Schema)).rejects.toMatchObject({ kind: 'refused' })
    mocks.stream.mockReturnValue(fakeStream(textEvents(['{"it'], 'max_tokens'), null, new Error('Failed to parse structured output: x')))
    await expect(generateStructured(req(), Schema)).rejects.toMatchObject({ kind: 'bad-output' })
    mocks.stream.mockReturnValue(fakeStream(textEvents(['nope']), finalMessage('nope', 'end_turn', null)))
    await expect(generateStructured(req(), Schema)).rejects.toMatchObject({ kind: 'bad-output' })
  })
})

describe('testConnection', () => {
  it('retrieves the model without generating tokens', async () => {
    mocks.retrieve.mockResolvedValue({ id: 'claude-opus-5-5' })
    const r = await testConnection('sk-ant-good', 'claude-opus-5-5')
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/Connected/)
    expect(mocks.retrieve).toHaveBeenCalledWith('claude-opus-5-5')
    expect(mocks.stream).not.toHaveBeenCalled()
  })

  it('explains failures in plain words', async () => {
    mocks.retrieve.mockRejectedValue(sdkError(Anthropic.AuthenticationError, 401, {}, 'invalid'))
    const r = await testConnection('sk-ant-bad', 'claude-opus-5-5')
    expect(r).toEqual({ ok: false, message: 'Claude didn’t accept that API key. Check it in Settings — it should start with sk-ant-.' })
    expect((await testConnection('', 'claude-opus-5-5')).ok).toBe(false)
  })
})

describe('createThrottle', () => {
  it('calls immediately, then at most once per interval with the latest value', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const t = createThrottle(fn, 50)
      t.push('a')
      t.push('ab')
      t.push('abc')
      expect(fn.mock.calls).toEqual([['a']])
      vi.advanceTimersByTime(60)
      expect(fn.mock.calls).toEqual([['a'], ['abc']])
      t.push('abcd')
      t.cancel()
      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
