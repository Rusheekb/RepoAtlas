import { basename } from '@/core/paths'
import type { AnalyzedFile, RepoAnalysis } from '@/core/types'
import { isGeneratedFile, isLockfile } from './context'

/**
 * Picks the files most relevant to a chat question, so their full text can go in the user turn
 * (the shared repository context stays byte-identical across turns and keeps the prompt cache warm).
 * Word lists for every file are built once per analysis and reused, so this stays fast on huge repos.
 */

const STOPWORDS = new Set(
  (
    'a an the and or but if then else of to in on at by for with from into onto about over under as is are was were be been being ' +
    'it its this that these those there here what which who whom whose where when why how do does did done doing can could would ' +
    'should will shall may might must have has had having not no yes any some all each every more most other such only own same so ' +
    'than too very just also like me my mine you your yours we our us they them their he she his her i im ive id get gets got make ' +
    'makes made use uses used using work works working happen happens happened explain tell show shows know want need please thing ' +
    'things file files code project repo repository part parts app does doing way ways something anything everything one ones'
  ).split(/\s+/),
)

/** Split identifiers and prose into lower-case words: "UserProfile.tsx" → ["user", "profile", "tsx"]. */
export function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function stem(w: string): string {
  for (const suffix of ['ing', 'ers', 'ies', 'ed', 'es', 'er', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) return w.slice(0, -suffix.length)
  }
  return w
}

/** Lower-case word stems from free text (question words, stop words and very short words removed). */
export function queryTerms(text: string): string[] {
  const out: string[] = []
  for (const w of splitWords(text)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    const s = stem(w)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

/** A word matches a query stem when it starts with it, or (for real words) when the stem starts with the word. */
function matches(words: readonly string[], term: string): boolean {
  for (const w of words) {
    if (w.startsWith(term)) return true
    if (w.length >= 4 && /^[a-z]+$/.test(w) && term.startsWith(w)) return true
  }
  return false
}

interface IndexedFile {
  file: AnalyzedFile
  name: string[]
  dir: string[]
  symbols: string[][]
  summary: string[]
  routes: string[]
}

interface RepoIndex {
  files: IndexedFile[]
  /** Lower-case basename → paths, for "what does main.py do?" style questions. */
  byName: Map<string, string[]>
  /** Lower-case path → real path. */
  byPath: Map<string, string>
}

const indexes = new WeakMap<RepoAnalysis, RepoIndex>()

function indexRepo(analysis: RepoAnalysis): RepoIndex {
  const hit = indexes.get(analysis)
  if (hit) return hit
  const dirWords = new Map<string, string[]>()
  const files: IndexedFile[] = []
  const byName = new Map<string, string[]>()
  const byPath = new Map<string, string>()
  for (const f of Object.values(analysis.files)) {
    byPath.set(f.path.toLowerCase(), f.path)
    const lowerName = basename(f.path).toLowerCase()
    const named = byName.get(lowerName)
    if (named) named.push(f.path)
    else byName.set(lowerName, [f.path])
    if (f.kind === 'asset' || f.kind === 'generated' || isLockfile(f.path) || isGeneratedFile(f.path, f)) continue
    let dir = dirWords.get(f.dir)
    if (!dir) {
      dir = splitWords(f.dir)
      dirWords.set(f.dir, dir)
    }
    files.push({
      file: f,
      name: splitWords(basename(f.path).replace(/\.[^.]+$/, '')),
      dir,
      symbols: f.symbols.slice(0, 200).map((s) => splitWords(s.name)),
      summary: splitWords(f.summary),
      routes: f.routes.flatMap((r) => splitWords(r.path)),
    })
  }
  const index = { files, byName, byPath }
  indexes.set(analysis, index)
  return index
}

/** Files the question names explicitly, by full path or by a distinctive file name (e.g. "main.py"), in order of mention. */
export function filesNamedIn(question: string, analysis: RepoAnalysis): string[] {
  const { byName, byPath } = indexRepo(analysis)
  const found: { path: string; at: number }[] = []
  const re = /[A-Za-z0-9_.\-/]*[A-Za-z0-9_-]\.[A-Za-z0-9]+/g
  for (let m = re.exec(question); m; m = re.exec(question)) {
    const token = m[0].replace(/^\.?\//, '').replace(/[.]+$/, '').toLowerCase()
    const exact = byPath.get(token)
    if (exact) {
      found.push({ path: exact, at: m.index })
      continue
    }
    const candidates = byName.get(basename(token))
    if (candidates?.length === 1 && basename(token).length >= 5) found.push({ path: candidates[0], at: m.index })
  }
  const seen = new Set<string>()
  return found
    .sort((x, y) => x.at - y.at)
    .filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)))
    .map((f) => f.path)
}

/** Tests, fixtures and type-checking stubs: rarely what a newcomer's question is about. */
const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|e2e|fixtures?|__mocks__|type_?checks?|typings?_tests?)\//i
const TEST_NAME = /(^test_|_test\.|\.test\.|\.spec\.|_spec\.|^conftest\.py$)/i

export function isTestLike(file: Pick<AnalyzedFile, 'path' | 'kind'>): boolean {
  return file.kind === 'test' || TEST_PATH.test(file.path) || TEST_NAME.test(basename(file.path))
}

/** Does the question itself ask about tests? Then test files are fair game. */
function asksAboutTests(terms: string[]): boolean {
  return terms.some((t) => t.startsWith('test') || t === 'spec' || t === 'fixtur' || t === 'fixture' || t === 'mock')
}

function scoreFile(f: IndexedFile, terms: string[], testsWanted = false): number {
  let score = 0
  for (const t of terms) {
    if (matches(f.name, t)) score += 6
    else if (matches(f.dir, t)) score += 3
    let symbolHits = 0
    for (const words of f.symbols) if (matches(words, t)) symbolHits++
    score += Math.min(6, symbolHits * 2)
    if (matches(f.routes, t)) score += 2
    if (matches(f.summary, t)) score += 1
  }
  // A single weak hit (one word in the heuristic summary) isn't worth sending a whole file for.
  if (score < 2) return 0
  const file = f.file
  if (file.fetched) score += 1
  if (file.isEntry) score += 1
  score += Math.min(2, Math.floor(file.importedBy.length / 5))
  // Tests mention everything they test, so they match almost any question. Unless the reader asks about tests,
  // they only come after the real source files.
  if (!testsWanted && isTestLike(file)) score = score * 0.25 - 2
  return score
}

/** Up to `max` repo paths relevant to the question: files it names first, then the best keyword matches. */
export function pickRelevantFiles(analysis: RepoAnalysis, question: string, max = 6): string[] {
  const out = filesNamedIn(question, analysis).slice(0, max)
  if (out.length >= max) return out
  const terms = queryTerms(question)
  if (!terms.length) return out
  const taken = new Set(out)
  const testsWanted = asksAboutTests(terms)
  const scored: { path: string; score: number }[] = []
  for (const f of indexRepo(analysis).files) {
    if (taken.has(f.file.path)) continue
    const score = scoreFile(f, terms, testsWanted)
    if (score > 0) scored.push({ path: f.file.path, score })
  }
  scored.sort((x, y) => y.score - x.score || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
  for (const s of scored) {
    if (out.length >= max) break
    out.push(s.path)
  }
  return out
}
