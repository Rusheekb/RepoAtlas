import { z } from 'zod'

/**
 * Zod schemas for structured Claude outputs.
 *
 * They are deliberately loose (no min/max counts, no integer constraints): structured outputs only enforce a subset
 * of JSON Schema, and anything stricter would make the client-side parse reject otherwise useful answers. Counts,
 * id formats, ranges and references are enforced afterwards by the post-validation in ./validate.ts.
 * The `.describe()` texts are sent to Claude as part of the JSON schema.
 */

export const ConceptCategorySchema = z.enum(['data', 'feature', 'process', 'actor', 'technology', 'idea'])

export const ConceptMapSchema = z.object({
  concepts: z
    .array(
      z.object({
        id: z.string().describe('Unique kebab-case id, e.g. "shopping-cart".'),
        name: z.string().describe('Short name, 1–4 words, e.g. "Shopping cart".'),
        emoji: z.string().describe('One emoji that represents the idea.'),
        category: ConceptCategorySchema.describe(
          'data = a kind of information; feature = something users can do; process = a sequence of steps; actor = a person or system that does things; technology = a tool the project relies on; idea = a design principle or pattern.',
        ),
        summary: z.string().describe('One plain-English sentence.'),
        explanation: z.string().describe('Markdown, 1–4 short paragraphs, plain English, specific to this project.'),
        analogy: z.string().describe('An everyday analogy, one or two sentences.'),
        files: z.array(z.string()).describe('1–5 repository file paths, copied exactly from the file tree.'),
        importance: z.number().describe('Integer from 1 (minor) to 5 (central to the project).'),
      }),
    )
    .describe('8–18 key ideas.'),
  relations: z
    .array(
      z.object({
        from: z.string().describe('A concept id from the list above.'),
        to: z.string().describe('A different concept id from the list above.'),
        label: z.string().describe('Short verb phrase read as "from label to", e.g. "is stored in".'),
      }),
    )
    .describe('How the ideas relate.'),
})

export const ToursSchema = z.object({
  tours: z.array(
    z.object({
      id: z.string().describe('Unique kebab-case id, e.g. "app-startup".'),
      title: z.string().describe('Short title, e.g. "What happens when the app starts".'),
      question: z.string().describe('The question this tour answers, e.g. "What happens when I open the app?"'),
      emoji: z.string().describe('One emoji.'),
      summary: z.string().describe('One or two plain-English sentences describing the journey.'),
      steps: z
        .array(
          z.object({
            title: z.string().describe('Short step title.'),
            explanation: z.string().describe('Markdown, 2–5 plain-English sentences.'),
            file: z.string().nullable().describe('Exact repository path this step looks at, or null for a conceptual step.'),
            snippet: z
              .string()
              .nullable()
              .describe('One short line copied character-for-character from that file, or null.'),
            moduleId: z.string().nullable().describe('One of the given module ids, or null.'),
          }),
        )
        .describe('4–9 steps in the order things happen.'),
    }),
  ),
})

export const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe('A question about how this specific project works.'),
      options: z.array(z.string()).describe('3 or 4 answer options; exactly one is correct.'),
      answerIndex: z.number().describe('0-based index of the correct option.'),
      explanation: z.string().describe('Why the answer is right, in plain English, mentioning real file paths.'),
    }),
  ),
})

export type ConceptMapOutput = z.infer<typeof ConceptMapSchema>
export type ToursOutput = z.infer<typeof ToursSchema>
export type QuizOutput = z.infer<typeof QuizSchema>
