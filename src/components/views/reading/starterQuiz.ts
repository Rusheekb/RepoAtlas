import { formatNumber, formatPercent } from '@/core/format'
import { LAYER_INFO, PROJECT_KIND_INFO, ROLE_INFO } from '@/core/labels'
import { basename } from '@/core/paths'
import { ROOT_MODULE_ID, type AnalyzedFile, type Layer, type ProjectKindId, type Quiz, type QuizQuestion, type RepoAnalysis } from '@/core/types'
import { describeLanguage, GLOSSARY, getTerm, TECH_CATALOG } from '@/knowledge'

/**
 * A starter quiz built from the analysis alone (no AI): the main language, the kind of project, what a part of the
 * code does, where the program starts, what a technology is for, a word from the glossary … each with plausible wrong
 * answers drawn from the same project, so guessing is hard and every explanation teaches something true.
 */

export interface StarterQuizOptions {
  /** Different seeds pick different parts, technologies and words, and shuffle the answers differently. */
  seed?: number
  /** How many questions (default 6). */
  count?: number
}

type Rng = () => number

/** Small, fast seeded random numbers (mulberry32), so a seed always gives the same quiz. */
export function seededRandom(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length ? items[Math.floor(rng() * items.length)] : undefined
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** "A toolbox…" → "a toolbox…", for use mid-sentence. Leaves names and acronyms ("React", "API") alone. */
export function lowerFirst(s: string): string {
  const t = s.trim()
  const firstWord = t.split(/\s/, 1)[0] ?? ''
  if (firstWord.length > 1 && firstWord.slice(1) !== firstWord.slice(1).toLowerCase()) return t
  const plain = ['A', 'An', 'The', 'Its', 'It', 'It’s', "It's", 'There', 'There’s', 'This', 'Uses', 'Has', 'Holds', 'Code', 'Software', 'Programs', 'Some']
  if (!plain.includes(firstWord)) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/** The first sentence of a description, trimmed to a readable length for an answer button. */
export function firstSentence(text: string, max = 150): string {
  const t = clean(text)
  const m = /^(.+?[.!?])(?=\s+[A-Z“"(]|$)/.exec(t)
  const s = m ? m[1] : t
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,;:\s]+$/, '')}…`
}

const code = (path: string) => `\`${path}\``

/**
 * Assemble one question: de-duplicates answers (ignoring case), keeps up to three wrong ones, shuffles.
 * Returns null when fewer than two believable wrong answers are left.
 */
export function makeQuestion(question: string, correct: string, wrong: readonly string[], explanation: string, rng: Rng): QuizQuestion | null {
  const right = clean(correct)
  if (!right) return null
  const seen = new Set([right.toLowerCase()])
  const distractors: string[] = []
  for (const w of wrong) {
    const c = clean(w)
    if (!c || seen.has(c.toLowerCase())) continue
    seen.add(c.toLowerCase())
    distractors.push(c)
    if (distractors.length === 3) break
  }
  if (distractors.length < 2) return null
  const options = shuffle([right, ...distractors], rng)
  return { question, options, answerIndex: options.indexOf(right), explanation: clean(explanation) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Question makers
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_LANGUAGES = ['JavaScript', 'Python', 'Java', 'Go', 'Ruby', 'C#', 'PHP', 'Rust', 'TypeScript', 'Swift', 'Kotlin', 'C++']
/** Languages a newcomer would recognize as "programming languages" (not styling, markup or data formats). */
const PROGRAMMING_LANGUAGES = new Set([...COMMON_LANGUAGES, 'C', 'Shell', 'Dart', 'Scala', 'Elixir', 'Lua', 'R', 'Haskell', 'Perl', 'Objective-C', 'TSX', 'Clojure', 'Julia', 'Zig', 'Erlang', 'F#'])

function languageQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  const top = a.languages[0]
  if (!top) return null
  const others = a.languages
    .slice(1, 6)
    .map((l) => l.name)
    .filter((n) => PROGRAMMING_LANGUAGES.has(n))
  const pool = shuffle(COMMON_LANGUAGES, rng)
  // One wrong answer from the project itself (plausible), the rest from popular languages.
  const wrong = [...shuffle(others, rng).slice(0, 1), ...pool]
  const about = describeLanguage(top.name)?.description
  const share =
    top.percent >= 99.5
      ? `Nearly all of the code is ${top.name}.`
      : top.percent >= 50
        ? `About ${formatPercent(top.percent)} of the code is ${top.name}.`
        : `${top.name} is the biggest share of the code, at about ${formatPercent(top.percent)}.`
  return makeQuestion(
    'Which programming language is most of this project’s code written in?',
    top.name,
    wrong,
    `${share}${about ? ` ${firstSentence(about, 220)}` : ''}`,
    rng,
  )
}

const KIND_POOL: ProjectKindId[] = ['web-app', 'api-server', 'library', 'cli-tool', 'mobile-app', 'game', 'data-science', 'desktop-app', 'browser-extension', 'website']

/**
 * Words that tie a project to a kind of software. A project whose own description mentions them is (or helps build)
 * that kind, so offering it as a wrong answer would mark a careful reader wrong: "a framework for building web
 * applications" must not get "Web application" as a trap.
 */
const KIND_CLUES: Partial<Record<ProjectKindId, RegExp>> = {
  'web-app': /\bweb\b|\bweb-?apps?\b|\bapplications?\b|\bfront-?end\b|\bbrowsers?\b|\bsites?\b|\bpages?\b|\w\.(com|org|net|io|dev|app)\b/i,
  website: /\bweb\b|\bweb-?sites?\b|\bsites?\b|\bpages?\b|\bblogs?\b|\bstatic\b|\w\.(com|org|net|io|dev|app)\b/i,
  'api-server': /\bweb\b|\bapis?\b|\brest(ful)?\b|\bhttp\b|\bservers?\b|\bback-?end\b|\bmicro-?services?\b|\bservices?\b|\brequests?\b/i,
  'cli-tool': /\bcommand[- ]line\b|\bcli\b|\bterminal\b|\bconsole\b|\bshell\b/i,
  'mobile-app': /\bmobile\b|\bios\b|\bandroid\b|\bphones?\b|\bapps?\b/i,
  'desktop-app': /\bdesktop\b|\belectron\b|\bgui\b|\bapps?\b|\bapplications?\b/i,
  'browser-extension': /\bextensions?\b|\bbrowsers?\b|\bchrome\b|\bfirefox\b|\badd-?ons?\b/i,
  'data-science': /\bdata\b|\banalytics?\b|\banalysis\b|\bnotebooks?\b|\bstatistic|\bmachine learning\b/i,
  game: /\bgames?\b|\bgaming\b|\bplay(er|ers)?\b/i,
}

/** The project's own words about itself: its GitHub description and the start of its README. */
function selfDescription(a: RepoAnalysis): string {
  const readme = (a.readme?.content ?? '')
    .slice(0, 2000)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // pictures and badges
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their words
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\n/)
    .filter((l) => l.trim() && !/^\s*(#|```|\|)/.test(l))
    .slice(0, 6)
    .join(' ')
  return `${a.meta.description ?? ''} ${readme}`
}

/** Kinds that make fair wrong answers for this project: never its own, and never one its description points to. */
export function kindDistractors(a: RepoAnalysis, correct: ProjectKindId): ProjectKindId[] {
  const text = selfDescription(a)
  return KIND_POOL.filter((k) => k !== correct && !KIND_CLUES[k]?.test(text))
}

function kindQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  const kind = a.projectKind
  if (!kind || kind.id === 'unknown' || kind.confidence < 0.3) return null
  const info = PROJECT_KIND_INFO[kind.id]
  const label = kind.label || info.label
  const wrong = shuffle(
    kindDistractors(a, kind.id).map((k) => PROJECT_KIND_INFO[k].label),
    rng,
  )
  const reason = kind.reasons[0] ? ` One clue: ${lowerFirst(kind.reasons[0]).replace(/\.?$/, '.')}` : ''
  const article = /^[aeiou]/i.test(label) ? 'an' : 'a'
  return makeQuestion('What kind of project is this?', label, wrong, `It’s ${article} ${label.toLowerCase()}: ${lowerFirst(kind.description || info.description)}${reason}`, rng)
}

/** Short answer-button wording for each kind of code. */
const LAYER_ANSWERS: Record<Layer, string> = {
  ui: 'The screens and visuals people see',
  api: 'How the project talks to the outside world',
  logic: 'The core rules and processing',
  data: 'The shape of the data and where it’s stored',
  test: 'Automatic checks that the code still works',
  config: 'Settings that tell tools how to behave',
  docs: 'Guides and explanations written for people',
  infra: 'Scripts that build and ship the project',
  other: 'Images, samples and other supporting files',
}

const CORE_LAYERS = new Set<Layer>(['ui', 'api', 'logic', 'data'])

/** The parts worth asking about: real folders, the ones holding the project's own code first, biggest first. */
function quizModules(a: RepoAnalysis) {
  return a.modules
    .filter((m) => m.id !== ROOT_MODULE_ID && m.fileCount > 0)
    .sort((x, y) => Number(CORE_LAYERS.has(y.layer)) - Number(CORE_LAYERS.has(x.layer)) || y.lines - x.lines || x.id.localeCompare(y.id))
}

function moduleQuestion(a: RepoAnalysis, rng: Rng, avoid: ReadonlySet<string>): { q: QuizQuestion; moduleId: string; layer: Layer } | null {
  const mods = quizModules(a).filter((m) => !avoid.has(m.id))
  const usedLayers = new Set(a.modules.filter((m) => avoid.has(m.id)).map((m) => m.layer))
  // Prefer a part with a different kind of code than one we already asked about.
  const fresh = mods.filter((m) => !usedLayers.has(m.layer))
  const m = pick((fresh.length ? fresh : mods).slice(0, 3), rng)
  if (!m) return null
  const inRepo = shuffle([...new Set(a.modules.map((x) => x.layer))].filter((l) => l !== m.layer), rng)
  const rest = shuffle(
    (Object.keys(LAYER_ANSWERS) as Layer[]).filter((l) => l !== m.layer && !inRepo.includes(l) && l !== 'other'),
    rng,
  )
  const wrong = [...inRepo.slice(0, 2), ...rest].map((l) => LAYER_ANSWERS[l])
  const where = m.path && m.path !== m.name ? ` (${code(m.path)})` : ''
  const q = makeQuestion(
    `What does the “${m.name}” part of the project${where} mostly hold?`,
    LAYER_ANSWERS[m.layer],
    wrong,
    `${m.description} In this app we call that kind of code “${LAYER_INFO[m.layer].label}”.`,
    rng,
  )
  return q ? { q, moduleId: m.id, layer: m.layer } : null
}

/** Names that sound like a starting point; using them as wrong answers would be unfair. */
const ENTRY_LIKE = /^(index|main|app|server|cli|__init__|__main__|mod|lib|program|start|run|manage|setup)\b/i
/** Folders of samples and checks: their files are often little starting points of their own. */
const SIDE_FOLDERS = /(^|\/)(examples?|samples?|demos?|tests?|__tests__|spec|fixtures?|docs?|benchmarks?)\//i

function isPlainSource(f: AnalyzedFile, entry: ReadonlySet<string>): boolean {
  return f.kind === 'source' && !entry.has(f.path) && !f.isEntry && !ENTRY_LIKE.test(f.name) && !SIDE_FOLDERS.test(f.path)
}

function entryQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  const path = a.entryPoints.find((p) => p in a.files)
  if (!path) return null
  const entry = new Set(a.entryPoints)
  const files = Object.values(a.files)
  const tests = files.filter((f) => (f.kind === 'test' || f.role === 'test') && f.kind !== 'asset')
  const helpers = files.filter((f) => isPlainSource(f, entry) && f.importedBy.length > 0)
  const configs = files.filter((f) => (f.kind === 'config' || f.role === 'config') && !entry.has(f.path) && !f.name.startsWith('.'))
  const others = files.filter((f) => isPlainSource(f, entry))
  const wrong = [pick(helpers, rng), pick(helpers, rng), pick(tests, rng), pick(configs, rng), ...shuffle(others, rng).slice(0, 3)]
    .filter((f): f is AnalyzedFile => Boolean(f) && f?.path !== path)
    .map((f) => code(f.path))
  const why = a.files[path].entryReason
  return makeQuestion(
    'Which file is the most likely starting point, where the program begins?',
    code(path),
    wrong,
    `${why ? `${why.replace(/\.?$/, '.')} ` : ''}A starting point is like a building’s front door: everything else is reached from there.`,
    rng,
  )
}

function techQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  const usable = a.techStack.filter((t) => t.category !== 'language' && t.description)
  const core = usable.filter((t) => t.importance === 'core')
  const supporting = usable.filter((t) => t.importance === 'supporting')
  const tech = pick([...core, ...supporting].slice(0, 3), rng) ?? pick(usable.slice(0, 3), rng)
  if (!tech) return null
  const usedCategories = new Set(a.techStack.map((t) => t.category))
  const usedIds = new Set(a.techStack.map((t) => t.id))
  const strangers = TECH_CATALOG.filter((t) => t.category !== 'language' && !usedCategories.has(t.category) && !usedIds.has(t.id) && t.description)
  const wrong = shuffle(strangers, rng)
    .map((t) => firstSentence(t.description))
    // An answer that names its own technology would give the game away.
    .filter((d) => !d.toLowerCase().includes(tech.name.toLowerCase()))
  return makeQuestion(
    `This project uses “${tech.name}”. What is that for?`,
    firstSentence(tech.description),
    wrong,
    `${tech.description}${tech.analogy ? ` ${tech.analogy}` : ''}`,
    rng,
  )
}

function hubQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  const path = a.hubs.find((p) => (a.files[p]?.importedBy.length ?? 0) >= 3)
  if (!path) return null
  const hub = a.files[path]
  const entry = new Set(a.entryPoints)
  const leaves = Object.values(a.files).filter(
    (f) => isPlainSource(f, entry) && f.path !== path && f.importedBy.length <= 1 && f.language === hub.language && !a.hubs.slice(0, 5).includes(f.path),
  )
  // Neighbors of the hub (same folder) make the most believable wrong answers.
  const near = leaves.filter((f) => f.dir === hub.dir)
  const wrong = [...shuffle(near, rng).slice(0, 2), ...shuffle(leaves, rng)].map((f) => code(f.path))
  const n = hub.importedBy.length
  return makeQuestion(
    'Which of these files do the most other files in the project rely on?',
    code(path),
    wrong,
    `${code(basename(path))} is used by ${formatNumber(n)} other files. A file like that is a hub, like a busy train station many lines pass through: change it, and the effects ripple out.`,
    rng,
  )
}

function termQuestion(a: RepoAnalysis, rng: Rng, avoid: ReadonlySet<string>): { q: QuizQuestion; id: string } | null {
  const ids = a.glossaryTermIds.filter((id) => !avoid.has(id) && getTerm(id))
  // Everyday words like "file" or "folder" make dull questions; prefer the project's real vocabulary.
  const interesting = ids.filter((id) => getTerm(id)?.category !== 'basics')
  const id = pick((interesting.length ? interesting : ids).slice(0, 8), rng)
  const term = id ? getTerm(id) : undefined
  if (!id || !term) return null
  const sameCategory = GLOSSARY.filter((t) => t.id !== id && t.category === term.category)
  const others = GLOSSARY.filter((t) => t.id !== id && t.category !== term.category)
  const wrong = [...shuffle(sameCategory, rng).slice(0, 2), ...shuffle(others, rng)].map((t) => firstSentence(t.short, 170))
  const q = makeQuestion(
    `In programming, what does “${term.term}” mean?`,
    firstSentence(term.short, 170),
    wrong,
    `${term.short}${term.analogy ? ` ${term.analogy}` : ''}`,
    rng,
  )
  return q ? { q, id } : null
}

function readmeQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  if (!a.readme) return null
  return makeQuestion(
    `What is the ${code(basename(a.readme.path))} file for?`,
    'A welcome note explaining what the project is and how to use it',
    ['The secret passwords the program needs', 'A backup copy of all the code', 'A list of everyone who downloaded the project'],
    'README means “read me first”. It’s the project’s front page: GitHub shows it right under the list of files, and it’s the best place to start.',
    rng,
  )
}

function testsQuestion(a: RepoAnalysis, rng: Rng): QuizQuestion | null {
  if (a.stats.testFiles < 1) return null
  return makeQuestion(
    `This project has ${formatNumber(a.stats.testFiles)} test ${a.stats.testFiles === 1 ? 'file' : 'files'}. What are they for?`,
    'They automatically check that the code still works after a change',
    ['They are practice exams for new programmers', 'They are spare copies of the code, kept just in case', 'They make the program run faster'],
    `${ROLE_INFO.test.description} Programmers run them after every change, like a pilot’s pre-flight checklist, so mistakes are caught before anyone else sees them.`,
    rng,
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** Build a 5–6 question quiz about this project from the analysis. Always returns at least the questions it can make. */
export function buildStarterQuiz(analysis: RepoAnalysis, opts: StarterQuizOptions = {}): Quiz {
  const count = Math.max(1, opts.count ?? 6)
  const rng = seededRandom(opts.seed ?? 1)
  const usedModules = new Set<string>()
  const usedTerms = new Set<string>()

  const mod = () => {
    const r = moduleQuestion(analysis, rng, usedModules)
    if (!r) return null
    usedModules.add(r.moduleId)
    return r.q
  }
  const term = () => {
    const r = termQuestion(analysis, rng, usedTerms)
    if (!r) return null
    usedTerms.add(r.id)
    return r.q
  }

  // Warm-ups first, then a mix. Later makers are back-ups for projects where earlier ones have nothing to ask.
  const warmups = [() => kindQuestion(analysis, rng), () => languageQuestion(analysis, rng)]
  const main = shuffle([mod, () => entryQuestion(analysis, rng), () => techQuestion(analysis, rng), term, () => hubQuestion(analysis, rng)], rng)
  const spares = [mod, term, () => testsQuestion(analysis, rng), () => readmeQuestion(analysis, rng), term]

  const questions: QuizQuestion[] = []
  const seenQuestions = new Set<string>()
  for (const make of [...warmups, ...main, ...spares]) {
    if (questions.length >= count) break
    const q = make()
    if (!q || seenQuestions.has(q.question)) continue
    seenQuestions.add(q.question)
    questions.push(q)
  }
  return { questions }
}

/** Keep only well-formed questions (e.g. from Claude): 2+ distinct options and a valid answer. */
export function validQuestions(quiz: Quiz | null | undefined): QuizQuestion[] {
  if (!quiz || !Array.isArray(quiz.questions)) return []
  return quiz.questions.filter(
    (q) =>
      typeof q.question === 'string' &&
      q.question.trim() &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.every((o) => typeof o === 'string' && o.trim()) &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex < q.options.length,
  )
}
