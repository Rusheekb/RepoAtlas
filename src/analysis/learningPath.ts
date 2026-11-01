import type { LearningStep, ModuleInfo, RepoAnalysis } from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { basename } from '@/core/paths'
import { capitalize, count, firstSentence, safeName, sentence, wordCount } from './structure/text'
import { relianceOf, relianceText } from './graph'

type PathInput = Omit<RepoAnalysis, 'learningPath' | 'starterConcepts' | 'starterTours'>

const PERIPHERAL_LAYERS = new Set(['test', 'docs', 'infra', 'config', 'other'])

function clampMinutes(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Minutes to read a file of this many lines (code reads slowly: ~40 lines a minute for a newcomer). */
function fileMinutes(lines: number | null | undefined): number {
  return clampMinutes((lines ?? 60) / 40, 2, 10)
}

/** How important a module is for understanding the project: its size plus how connected it is. */
export function rankModules(analysis: Pick<RepoAnalysis, 'modules' | 'moduleEdges'>): ModuleInfo[] {
  const totalLines = analysis.modules.reduce((s, m) => s + m.lines, 0) || 1
  const degree = new Map<string, number>()
  let totalWeight = 0
  for (const e of analysis.moduleEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + e.weight)
    degree.set(e.target, (degree.get(e.target) ?? 0) + e.weight * 1.5)
    totalWeight += e.weight
  }
  const score = (m: ModuleInfo) => m.lines / totalLines + (totalWeight > 0 ? (degree.get(m.id) ?? 0) / (totalWeight * 2.5) : 0)
  return analysis.modules
    .filter((m) => !PERIPHERAL_LAYERS.has(m.layer) && (m.id !== ROOT_MODULE_ID || m.role === 'Main code (top level)'))
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
}

/**
 * Recommended order to explore the repo (6–10 steps): read the README → see The Big Picture → look at the map →
 * open the main entry point → visit the 2–4 most important modules (by size/centrality) → a hub file → take a tour →
 * test yourself. Each step has a plain-English "why" and a rough reading time.
 */
export function buildLearningPath(analysis: PathInput, options: { name?: string } = {}): LearningStep[] {
  const steps: LearningStep[] = []
  const used = new Set<string>()
  const push = (s: LearningStep) => {
    if (used.has(s.id)) return
    used.add(s.id)
    steps.push(s)
  }
  // The same name the overview uses ("httpie" for the httpie/cli repository).
  const repo = safeName(options.name?.trim() || analysis.meta.repo || 'this project', 40)

  if (analysis.readme) {
    const words = wordCount(analysis.readme.content)
    push({
      id: 'readme',
      title: 'Read the welcome note',
      description: `The README is the project’s front door: the authors explain what ${repo} does and how to use it. Skim it first — don’t worry about words you don’t know yet.`,
      target: { type: 'readme' },
      minutes: clampMinutes(words / 200, 2, 10),
    })
  }

  push({
    id: 'big-picture',
    title: 'See the big picture',
    description: `A plain-English summary of what ${repo} is, what it’s built with and how it’s organized.`,
    target: { type: 'view', view: 'overview' },
    minutes: 3,
  })

  if (analysis.modules.length >= 2) {
    push({
      id: 'map',
      title: 'Look at the map of main parts',
      description: `See the ${count(analysis.modules.length, 'main part')} and which ones rely on which — like a subway map of the code.`,
      target: { type: 'view', view: 'map' },
      minutes: 4,
    })
  }

  const entry = analysis.entryPoints.find((p) => analysis.files[p])
  if (entry) {
    const f = analysis.files[entry]
    push({
      id: `file:${entry}`,
      title: `Open the starting point: ${basename(entry)}`,
      description: `${sentence(f.entryReason ?? 'This is where things begin.')} Everything else is reached from here, so it’s the natural first page of the story.`,
      target: { type: 'file', path: entry },
      minutes: fileMinutes(f.lines),
    })
  }

  const hub = analysis.hubs.find((p) => p !== entry && analysis.files[p])
  // Leave room for the hub, the tour and the quiz within 10 steps.
  const slots = Math.max(2, Math.min(4, 10 - steps.length - (hub ? 1 : 0) - 2))
  const ranked = rankModules(analysis)
  const picks = ranked.slice(0, slots)
  const biggest = Math.max(0, ...ranked.map((m) => m.lines))
  const incoming = new Map<string, number>()
  for (const e of analysis.moduleEdges) incoming.set(e.target, (incoming.get(e.target) ?? 0) + e.weight)
  const mostUsed = [...incoming.entries()].filter(([id]) => ranked.some((m) => m.id === id)).sort((a, b) => b[1] - a[1])[0]?.[0]
  picks.forEach((m) => {
    const start = m.keyFiles.find((p) => p !== entry)
    const lead = sentence(firstSentence(m.description))
    // Only the main code is ranked (tests, docs and examples are left out), so say so: docs/ may well be bigger.
    const why =
      m.lines === biggest && biggest > 0
        ? 'It’s the biggest part of the main code.'
        : m.id === mostUsed
          ? 'More of the project relies on it than on any other part.'
          : (incoming.get(m.id) ?? 0) > 0
            ? 'Other parts of the project rely on it.'
            : 'It’s one of the main parts of the project.'
    push({
      id: `module:${m.id}`,
      title: `Explore ${m.emoji} ${safeName(m.name, 40)}`,
      description: `${lead} ${why}${start ? ` A good file to start with is ${basename(start)}.` : ''}`,
      target: { type: 'module', id: m.id },
      minutes: clampMinutes(m.lines / 150, 3, 12),
    })
  })

  if (hub && !used.has(`file:${hub}`)) {
    const f = analysis.files[hub]
    const reliance = relianceOf(f, analysis.files)
    push({
      id: `file:${hub}`,
      title: `Meet the most relied-on file: ${basename(hub)}`,
      // Same count as the overview's "most relied-on file" and the file cards.
      description: `${capitalize(relianceText(reliance))} ${reliance.total === 1 ? 'uses' : 'use'} it, so understanding it makes the rest of the code much easier to follow.`,
      target: { type: 'file', path: hub },
      minutes: fileMinutes(f.lines),
    })
  }

  push({
    id: 'tours',
    title: 'Take a guided tour',
    description: 'Follow, step by step, how the code actually runs — from the starting point through the main pieces.',
    target: { type: 'view', view: 'tours' },
    minutes: 5,
  })

  // Small projects: add a few more views to explore so the path still feels like a path.
  const fillers: LearningStep[] = [
    {
      id: 'concepts',
      title: 'Learn the key ideas',
      description: 'See the important ideas behind the project and how they relate to each other.',
      target: { type: 'view', view: 'concepts' },
      minutes: 3,
    },
    {
      id: 'codemap',
      title: 'See where the code lives',
      description: 'Every file as a tile, sized by how much it holds — a quick way to see which areas are big and which are small.',
      target: { type: 'view', view: 'codemap' },
      minutes: 2,
    },
    {
      id: 'glossary',
      title: 'Look up unfamiliar words',
      description: 'Technical words used in this project, explained simply with everyday comparisons.',
      target: { type: 'view', view: 'glossary' },
      minutes: 3,
    },
  ]
  for (const f of fillers) if (steps.length < 6) push(f)

  push({
    id: 'quiz',
    title: 'Test yourself',
    description: 'A quick, friendly quiz to check what has sunk in. Nobody’s grading you — it just helps the ideas stick.',
    target: { type: 'view', view: 'quiz' },
    minutes: 3,
  })
  return steps.length > 10 ? [...steps.slice(0, 9), steps[steps.length - 1]] : steps
}
