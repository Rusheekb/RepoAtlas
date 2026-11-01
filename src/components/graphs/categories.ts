/**
 * Plain-English categories and fixed color slots used by the concept map and the tech-stack "layer cake".
 * Colors are the layer palette's CSS variables, so both themes switch automatically.
 */
import type { ConceptCategory, Layer, TechCategory, TechItem } from '@/core/types'

/** Fixed order = fixed palette slot. */
export const CONCEPT_CATEGORIES: readonly ConceptCategory[] = ['feature', 'actor', 'process', 'data', 'idea', 'technology']

export const CONCEPT_CATEGORY_INFO: Record<ConceptCategory, { label: string; description: string; color: string }> = {
  feature: {
    label: 'Feature',
    description: 'Something people can do with the project.',
    color: 'var(--layer-ui)',
  },
  actor: {
    label: 'Who’s involved',
    description: 'A person, role or outside system that takes part.',
    color: 'var(--layer-api)',
  },
  process: {
    label: 'Process',
    description: 'A series of steps that happen in order.',
    color: 'var(--layer-logic)',
  },
  data: {
    label: 'Information',
    description: 'Information the project keeps or passes around.',
    color: 'var(--layer-data)',
  },
  idea: {
    label: 'Big idea',
    description: 'A principle or way of thinking behind the design.',
    color: 'var(--layer-test)',
  },
  technology: {
    label: 'Technology',
    description: 'A tool or building block the project relies on.',
    color: 'var(--layer-docs)',
  },
}

/** Info for a category, tolerating unexpected values from AI output. */
export function conceptCategoryInfo(category: string): { label: string; description: string; color: string } {
  return (CONCEPT_CATEGORY_INFO as Record<string, { label: string; description: string; color: string }>)[category] ?? {
    label: 'Other',
    description: 'Another kind of idea.',
    color: 'var(--layer-other)',
  }
}

export type TechRowId = 'surface' | 'engine' | 'data' | 'tools'

export interface TechRow {
  id: TechRowId
  label: string
  description: string
  emoji: string
  /** Layer whose color marks this row (matches the "kind of code" colors used everywhere else). */
  layer: Layer
}

/** The layer cake, top to bottom. */
export const TECH_ROWS: readonly TechRow[] = [
  {
    id: 'surface',
    label: 'What you see',
    description: 'The screens, buttons and looks that people actually interact with.',
    emoji: '🖼️',
    layer: 'ui',
  },
  {
    id: 'engine',
    label: 'The engine',
    description: 'The code that does the real work behind the screens: rules, calculations and answers to requests.',
    emoji: '⚙️',
    layer: 'logic',
  },
  {
    id: 'data',
    label: 'Where data lives',
    description: 'Where information is stored so it is still there tomorrow.',
    emoji: '🗄️',
    layer: 'data',
  },
  {
    id: 'tools',
    label: 'Tools behind the scenes',
    description: 'Helpers the developers use to build, check and ship the project. Users never see these.',
    emoji: '🧰',
    layer: 'infra',
  },
]

export const TECH_CATEGORY_ROW: Record<TechCategory, TechRowId> = {
  frontend: 'surface',
  styling: 'surface',
  mobile: 'surface',
  desktop: 'surface',
  game: 'surface',
  language: 'engine',
  backend: 'engine',
  api: 'engine',
  state: 'engine',
  auth: 'engine',
  payments: 'engine',
  ai: 'engine',
  'data-science': 'engine',
  cli: 'engine',
  utility: 'engine',
  database: 'data',
  build: 'tools',
  testing: 'tools',
  quality: 'tools',
  ci: 'tools',
  infra: 'tools',
  cloud: 'tools',
  docs: 'tools',
  'package-manager': 'tools',
}

export function techRowOf(category: TechCategory | string): TechRowId {
  return (TECH_CATEGORY_ROW as Record<string, TechRowId>)[category] ?? 'engine'
}

const IMPORTANCE_ORDER: Record<TechItem['importance'], number> = { core: 0, supporting: 1, tooling: 2 }

/** Tech grouped into cake rows (top to bottom), empty rows dropped, most important first, duplicates removed. */
export function groupTechByRow(tech: readonly TechItem[]): { row: TechRow; items: TechItem[] }[] {
  const seen = new Set<string>()
  const buckets = new Map<TechRowId, TechItem[]>()
  for (const item of tech) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const row = techRowOf(item.category)
    const list = buckets.get(row) ?? []
    list.push(item)
    buckets.set(row, list)
  }
  const out: { row: TechRow; items: TechItem[] }[] = []
  for (const row of TECH_ROWS) {
    const items = buckets.get(row.id)
    if (!items?.length) continue
    items.sort(
      (a, b) =>
        (IMPORTANCE_ORDER[a.importance] ?? 3) - (IMPORTANCE_ORDER[b.importance] ?? 3) || a.name.localeCompare(b.name),
    )
    out.push({ row, items })
  }
  return out
}

/** A one-line plain-English hint for a tech chip: its analogy if there is one, else the first sentence. */
export function techHint(item: Pick<TechItem, 'analogy' | 'description'>, maxLength = 72): string {
  const raw = (item.analogy?.trim() || item.description?.trim() || '').replace(/\s+/g, ' ')
  const firstSentence = raw.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? raw
  const text = firstSentence.length ? firstSentence : raw
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}
