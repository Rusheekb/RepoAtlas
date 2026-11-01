import type { Concept, ConceptCategory, ConceptMap, ConceptRelation, Quiz, QuizQuestion, RepoAnalysis, RepoSnapshot, Tour, TourStep } from '@/core/types'
import type { ConceptMapOutput, QuizOutput, ToursOutput } from './schemas'

/**
 * Post-validation of Claude's structured output against what the static analysis actually found.
 * Claude is good but not perfect: paths can be misremembered, snippets paraphrased, ids duplicated.
 * Everything here is defensive and never throws.
 */

/** "Shopping Cart!" → "shopping-cart"; "userAccount" → "user-account". */
export function toKebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** A kebab-case id derived from `base` that isn't in `taken` yet (and is then added to it). */
export function uniqueId(base: string, taken: Set<string>, fallback = 'item'): string {
  const root = toKebab(base) || fallback
  let id = root
  let n = 2
  while (taken.has(id)) id = `${root}-${n++}`
  taken.add(id)
  return id
}

function clean(s: unknown): string {
  return typeof s === 'string' ? s.trim() : ''
}

/** Strip backticks, "./", leading slashes, Windows separators and trailing line references. */
export function normalizePath(raw: string): string {
  return raw
    .trim()
    .replace(/^`+|`+$/g, '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/(#L\d+(-L?\d+)?|:\d+(:\d+)?(-\d+)?)$/, '')
}

/** Resolve a path Claude wrote to a real repository path (exact, then unambiguous case-insensitive), or null. */
export function makePathResolver(analysis: RepoAnalysis, snapshot?: RepoSnapshot): (raw: string | null | undefined) => string | null {
  const known = new Set<string>(Object.keys(analysis.files))
  if (snapshot) for (const t of snapshot.tree) known.add(t.path)
  const lower = new Map<string, string | null>()
  for (const p of known) {
    const k = p.toLowerCase()
    lower.set(k, lower.has(k) ? null : p)
  }
  const repoPrefix = `${analysis.meta.fullName}/`.toLowerCase()
  return (raw) => {
    if (typeof raw !== 'string') return null
    let p = normalizePath(raw)
    if (!p) return null
    if (known.has(p)) return p
    if (p.toLowerCase().startsWith(repoPrefix)) p = p.slice(repoPrefix.length)
    if (known.has(p)) return p
    return lower.get(p.toLowerCase()) ?? null
  }
}

/** Whitespace-insensitive "does this snippet really occur in the file?" check. */
export function snippetOccurs(snippet: string, content: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, '')
  const needle = squash(snippet.replace(/^(…|\.\.\.)|(…|\.\.\.)$/g, ''))
  if (!needle) return false
  return squash(content).includes(needle)
}

const CATEGORY_EMOJI: Record<ConceptCategory, string> = {
  data: '🗂️',
  feature: '✨',
  process: '🔄',
  actor: '🧑',
  technology: '🛠️',
  idea: '💡',
}

/** Keep a real emoji; replace empty strings, ":shortcodes:" or words with a fallback. */
export function cleanEmoji(raw: unknown, fallback: string): string {
  const e = clean(raw)
  if (!e || /[A-Za-z0-9:]/.test(e)) return fallback
  return Array.from(e).slice(0, 4).join('')
}

function clampImportance(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 3
  return Math.max(1, Math.min(5, v))
}

const MAX_CONCEPTS = 24
const MAX_RELATIONS = 60

export function validateConceptMap(raw: ConceptMapOutput, analysis: RepoAnalysis, snapshot?: RepoSnapshot): ConceptMap {
  const resolve = makePathResolver(analysis, snapshot)
  const taken = new Set<string>()
  const alias = new Map<string, string>()
  const concepts: Concept[] = []

  for (const c of raw.concepts ?? []) {
    if (concepts.length >= MAX_CONCEPTS) break
    const name = clean(c.name)
    if (!name) continue
    const id = uniqueId(clean(c.id) || name, taken, 'idea')
    for (const key of [id, clean(c.id), toKebab(clean(c.id)), toKebab(name), name.toLowerCase()]) {
      if (key && !alias.has(key)) alias.set(key, id)
    }
    const files: string[] = []
    for (const f of c.files ?? []) {
      const p = resolve(f)
      if (p && !files.includes(p)) files.push(p)
    }
    concepts.push({
      id,
      name,
      emoji: cleanEmoji(c.emoji, CATEGORY_EMOJI[c.category] ?? '💡'),
      category: c.category in CATEGORY_EMOJI ? c.category : 'idea',
      summary: clean(c.summary),
      explanation: clean(c.explanation),
      analogy: clean(c.analogy),
      files: files.slice(0, 8),
      importance: clampImportance(c.importance),
    })
  }

  const lookup = (ref: unknown): string | undefined => {
    const r = clean(ref)
    return alias.get(r) ?? alias.get(toKebab(r)) ?? alias.get(r.toLowerCase())
  }
  const relations: ConceptRelation[] = []
  const seen = new Set<string>()
  for (const r of raw.relations ?? []) {
    if (relations.length >= MAX_RELATIONS) break
    const from = lookup(r.from)
    const to = lookup(r.to)
    if (!from || !to || from === to) continue
    const label = clean(r.label).replace(/\s+/g, ' ').slice(0, 60) || 'relates to'
    const key = `${from}→${to}→${label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    relations.push({ from, to, label })
  }

  return { concepts, relations, source: 'ai' }
}

const MAX_TOURS = 6
const MAX_STEPS = 12

export interface TourValidationOptions {
  snapshot?: RepoSnapshot
  /** File contents for snippet checks. `undefined`/`null` = unknown (the snippet is kept). */
  contentOf?: (path: string) => string | null | undefined
  /** Ids already used (e.g. by tours the reader has). New ids avoid them. */
  takenIds?: Set<string>
  /** Keep only the first tour (custom-question mode) and use this question if Claude left it empty. */
  single?: { question: string }
}

export function validateTours(raw: ToursOutput, analysis: RepoAnalysis, opts: TourValidationOptions = {}): Tour[] {
  const resolve = makePathResolver(analysis, opts.snapshot)
  const moduleIds = new Set(analysis.modules.map((m) => m.id))
  const moduleByName = new Map<string, string>()
  for (const m of analysis.modules) {
    moduleByName.set(m.name.toLowerCase(), m.id)
    moduleByName.set(m.path.toLowerCase(), m.id)
  }
  const taken = new Set(opts.takenIds ?? [])
  const tours: Tour[] = []

  for (const t of raw.tours ?? []) {
    if (tours.length >= (opts.single ? 1 : MAX_TOURS)) break
    const steps: TourStep[] = []
    for (const s of t.steps ?? []) {
      if (steps.length >= MAX_STEPS) break
      const title = clean(s.title)
      const explanation = clean(s.explanation)
      if (!title && !explanation) continue
      const file = resolve(s.file)
      let snippet = file ? clean(s.snippet) || null : null
      if (snippet && file) {
        const content = opts.contentOf?.(file)
        if (typeof content === 'string' && !snippetOccurs(snippet, content)) snippet = null
      }
      const rawModule = clean(s.moduleId)
      let moduleId: string | null = null
      if (rawModule) moduleId = moduleIds.has(rawModule) ? rawModule : (moduleByName.get(rawModule.toLowerCase()) ?? null)
      if (!moduleId && rawModule && file) moduleId = analysis.files[file]?.moduleId ?? null
      if (moduleId && !moduleIds.has(moduleId)) moduleId = null
      steps.push({ title: title || 'Next step', explanation, file, snippet, moduleId })
    }
    if (!steps.length) continue
    const title = clean(t.title) || opts.single?.question || 'A guided tour'
    tours.push({
      id: uniqueId(clean(t.id) || title, taken, 'tour'),
      title,
      question: clean(t.question) || opts.single?.question || title,
      emoji: cleanEmoji(t.emoji, '🧭'),
      summary: clean(t.summary),
      steps,
      source: 'ai',
    })
  }
  return tours
}

const MAX_QUESTIONS = 10

export function validateQuiz(raw: QuizOutput): Quiz {
  const questions: QuizQuestion[] = []
  for (const q of raw.questions ?? []) {
    if (questions.length >= MAX_QUESTIONS) break
    const question = clean(q.question)
    if (!question) continue
    const options = (q.options ?? []).map(clean)
    const idx = typeof q.answerIndex === 'number' && Number.isInteger(q.answerIndex) ? q.answerIndex : -1
    if (idx < 0 || idx >= options.length) continue
    const correct = options[idx]
    if (!correct) continue
    const unique: string[] = []
    for (const o of options) if (o && !unique.some((u) => u.toLowerCase() === o.toLowerCase())) unique.push(o)
    let kept = unique
    if (kept.length > 4) {
      const others = kept.filter((o) => o.toLowerCase() !== correct.toLowerCase()).slice(0, 3)
      kept = unique.filter((o) => o.toLowerCase() === correct.toLowerCase() || others.includes(o))
    }
    if (kept.length < 3) continue
    const answerIndex = kept.findIndex((o) => o.toLowerCase() === correct.toLowerCase())
    if (answerIndex < 0) continue
    questions.push({ question, options: kept, answerIndex, explanation: clean(q.explanation) })
  }
  return { questions }
}
