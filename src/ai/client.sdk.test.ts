// @vitest-environment node
/**
 * End-to-end check against the REAL @anthropic-ai/sdk (only `fetch` is faked): the request body and headers that
 * actually go over the wire, SSE parsing, structured-output parsing and HTTP error mapping.
 */
import { z } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { generateStructured, streamText, type ClaudeRequest } from './client'
import { ConceptMapSchema } from './schemas'
import { validateConceptMap } from './validate'
import { makeFixture } from './testFixtures'

function sse(events: Record<string, unknown>[]): string {
  return events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

function messageEvents(text: string, stopReason = 'end_turn'): Record<string, unknown>[] {
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(0, 5) } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(5) } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ]
}

interface Captured {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

function stubFetch(respond: () => Response): Captured[] {
  const calls: Captured[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) })
    return respond()
  })
  return calls
}

let n = 0
function req(model: ClaudeRequest['model'] = 'claude-opus-5-5'): ClaudeRequest {
  return {
    apiKey: `sk-ant-real-${++n}`,
    model,
    effort: 'medium',
    system: [
      { type: 'text', text: 'instructions' },
      { type: 'text', text: 'repo', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'hi' }],
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('client with the real SDK', () => {
  it('sends the documented body and headers and parses the stream', async () => {
    const calls = stubFetch(() => new Response(sse(messageEvents('Hello world')), { headers: { 'content-type': 'text/event-stream' } }))
    const statuses: string[] = []
    const r = await streamText(req(), { onStatus: (s) => statuses.push(s) })
    expect(r.text).toBe('Hello world')
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 7, cacheWriteTokens: 3 })
    expect(statuses).toEqual(['connecting', 'thinking', 'writing', 'done'])

    const [call] = calls
    expect(call.url).toContain('/v1/messages')
    expect(call.headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01')
    expect(call.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    // SDK 1.x sends the key as a bearer token.
    expect(call.headers.get('authorization') ?? call.headers.get('x-api-key')).toMatch(/sk-ant-real-/)
    expect(call.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      fallbacks: 'default',
    })
    expect(call.body).not.toHaveProperty('betas')
    for (const k of ['temperature', 'top_p', 'top_k']) expect(call.body).not.toHaveProperty(k)
  })

  it('sends no beta header or fallbacks for Haiku', async () => {
    const calls = stubFetch(() => new Response(sse(messageEvents('Hello world')), { headers: { 'content-type': 'text/event-stream' } }))
    await streamText(req('claude-haiku-5-5'))
    expect(calls[0].headers.get('anthropic-beta')).toBeNull()
    expect(calls[0].body).not.toHaveProperty('fallbacks')
  })

  it('parses structured output and sends the JSON schema', async () => {
    const json = '{"items":["a","b"]}'
    const calls = stubFetch(() => new Response(sse(messageEvents(json)), { headers: { 'content-type': 'text/event-stream' } }))
    const { data } = await generateStructured(req(), z.object({ items: z.array(z.string()) }))
    expect(data).toEqual({ items: ['a', 'b'] })
    const format = (calls[0].body.output_config as { format: { type: string; schema: unknown } }).format
    expect(format.type).toBe('json_schema')
    expect(format.schema).toMatchObject({ type: 'object', properties: { items: { type: 'array' } } })
  })

  it('maps a structured refusal to "refused"', async () => {
    stubFetch(() => new Response(sse(messageEvents('{"ite', 'refusal')), { headers: { 'content-type': 'text/event-stream' } }))
    await expect(generateStructured(req(), z.object({ items: z.array(z.string()) }))).rejects.toMatchObject({ kind: 'refused' })
  })

  it('a mid-stream "overloaded" error says Claude is busy (and rate limits say so too)', async () => {
    const partial = (type: string) =>
      sse(messageEvents('Hello world').slice(0, 6)) + `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type, message: 'x' } })}\n\n`
    stubFetch(() => new Response(partial('overloaded_error'), { headers: { 'content-type': 'text/event-stream' } }))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'overloaded', message: expect.stringMatching(/very busy/) })
    stubFetch(() => new Response(partial('api_error'), { headers: { 'content-type': 'text/event-stream' } }))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'overloaded' })
    stubFetch(() => new Response(partial('rate_limit_error'), { headers: { 'content-type': 'text/event-stream' } }))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('one off-list concept category no longer throws away the whole concept map', async () => {
    const concept = (id: string, category: string) => ({ id, name: id, emoji: '💡', category, summary: 's', explanation: 'e', analogy: 'a', files: [], importance: 3 })
    const map = {
      concepts: [concept('a', 'data'), concept('b', 'Technology'), concept('c', 'design pattern'), concept('d', 'tools'), concept('e', 'whatever')],
      relations: [],
    }
    stubFetch(() => new Response(sse(messageEvents(JSON.stringify(map))), { headers: { 'content-type': 'text/event-stream' } }))
    const { data } = await generateStructured(req(), ConceptMapSchema)
    const { analysis, snapshot } = makeFixture()
    expect(validateConceptMap(data, analysis, snapshot).concepts.map((c) => c.category)).toEqual(['data', 'technology', 'idea', 'technology', 'idea'])
    // The six categories are still described to Claude.
    const format = betaZodOutputFormat(ConceptMapSchema) as unknown as { schema: unknown }
    expect(JSON.stringify(format.schema)).toContain('Exactly one of: data, feature, process, actor, technology, idea')
  })

  it('maps HTTP errors to friendly kinds', async () => {
    const error = (status: number, type: string, message: string) => () =>
      new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json' } })
    stubFetch(error(401, 'authentication_error', 'invalid x-api-key'))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'invalid-key' })
    stubFetch(error(400, 'invalid_request_error', 'prompt is too long: 1200000 tokens > 1000000 maximum'))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'too-long' })
    stubFetch(error(403, 'permission_error', 'nope'))
    await expect(streamText(req())).rejects.toMatchObject({ kind: 'invalid-key' })
  })
})
