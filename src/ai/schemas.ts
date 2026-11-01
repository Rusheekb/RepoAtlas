import { z } from 'zod'

/** Zod schemas for structured Claude outputs (kept compatible with structured-outputs JSON Schema limits). */
export const ConceptMapSchema = z.object({
  concepts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      emoji: z.string(),
      category: z.enum(['data', 'feature', 'process', 'actor', 'technology', 'idea']),
      summary: z.string(),
      explanation: z.string(),
      analogy: z.string(),
      files: z.array(z.string()),
      importance: z.number(),
    }),
  ),
  relations: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
})

export const ToursSchema = z.object({
  tours: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      question: z.string(),
      emoji: z.string(),
      summary: z.string(),
      steps: z.array(
        z.object({
          title: z.string(),
          explanation: z.string(),
          file: z.string().nullable(),
          snippet: z.string().nullable(),
          moduleId: z.string().nullable(),
        }),
      ),
    }),
  ),
})

export const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      answerIndex: z.number(),
      explanation: z.string(),
    }),
  ),
})
