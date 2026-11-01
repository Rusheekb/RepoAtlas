import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ConceptMapSchema, QuizSchema, ToursSchema } from './schemas'

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; anyOf?: JsonSchema[]; additionalProperties?: boolean }

/** Structured outputs need every object closed and every property required. */
function assertStrict(s: JsonSchema, path = '$'): void {
  if (s.type === 'object') {
    expect(s.additionalProperties, path).toBe(false)
    expect([...(s.required ?? [])].sort(), path).toEqual(Object.keys(s.properties ?? {}).sort())
    for (const [k, v] of Object.entries(s.properties ?? {})) assertStrict(v, `${path}.${k}`)
  }
  if (s.items) assertStrict(s.items, `${path}[]`)
  for (const v of s.anyOf ?? []) assertStrict(v, path)
}

describe('structured output schemas', () => {
  it.each([
    ['ConceptMapSchema', ConceptMapSchema],
    ['ToursSchema', ToursSchema],
    ['QuizSchema', QuizSchema],
  ] as const)('%s converts to a strict JSON schema', (_name, schema) => {
    const format = betaZodOutputFormat(schema)
    expect(format.type).toBe('json_schema')
    assertStrict(format.schema as JsonSchema)
  })

  it('parses a valid tours answer, including null fields', () => {
    const format = betaZodOutputFormat(ToursSchema)
    const parsed = format.parse(
      JSON.stringify({
        tours: [
          {
            id: 'a',
            title: 't',
            question: 'q',
            emoji: '🧭',
            summary: 's',
            steps: [{ title: 'x', explanation: 'y', file: null, snippet: null, moduleId: null }],
          },
        ],
      }),
    )
    expect(parsed.tours[0].steps[0].file).toBeNull()
  })

  it('accepts off-list concept categories (validateConceptMap maps them), so one odd word never sinks a whole map', () => {
    const r = ConceptMapSchema.safeParse({
      concepts: [{ id: 'a', name: 'A', emoji: '💡', category: 'Technology', summary: '', explanation: '', analogy: '', files: [], importance: 3 }],
      relations: [],
    })
    expect(r.success).toBe(true)
  })
})
