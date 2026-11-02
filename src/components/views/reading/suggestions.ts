import { ROOT_MODULE_ID, type RepoAnalysis } from '@/core/types'

export interface SuggestedQuestion {
  /** @deprecated Suggestions are shown as plain questions now (no emoji); kept optional so older callers still compile. */
  emoji?: string
  text: string
}

/** Layers whose parts make good "what does this part do?" questions (not tests, docs or setup). */
const INTERESTING_LAYERS = new Set(['ui', 'api', 'logic', 'data'])

/**
 * Starter questions for "Ask a Question", tailored to the project: the classics every newcomer wonders about, plus one
 * about its biggest part and one about a technology it relies on.
 */
export function suggestedQuestions(analysis: RepoAnalysis, max = 7): SuggestedQuestion[] {
  const hasData = analysis.modules.some((m) => m.layer === 'data') || Object.values(analysis.files).some((f) => f.layer === 'data')
  const out: SuggestedQuestion[] = [
    { text: 'What does this project do, in simple terms?' },
    { text: 'Where does the program start?' },
    hasData
      ? { text: 'How is information stored?' }
      : { text: 'How does information flow through the project?' },
  ]

  const biggest = analysis.modules
    .filter((m) => m.id !== ROOT_MODULE_ID && INTERESTING_LAYERS.has(m.layer))
    .sort((a, b) => b.lines - a.lines)[0]
  if (biggest) out.push({ text: `What does the “${biggest.name}” part do, and why is it the biggest part of the main code?` })

  const tech =
    analysis.techStack.find((t) => t.category !== 'language' && t.importance === 'core') ??
    analysis.techStack.find((t) => t.category !== 'language' && t.importance === 'supporting')
  if (tech) out.push({ text: `What is ${tech.name}, and how does this project use it?` })

  out.push({ text: 'What would I change to add a feature?' })
  out.push({ text: 'Explain the main parts like I’m 10' })

  if (analysis.stats.testFiles > 0) out.push({ text: 'How does the project check that it still works?' })
  return out.slice(0, max)
}
