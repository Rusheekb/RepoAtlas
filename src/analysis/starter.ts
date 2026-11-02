import type {
  AnalyzedFile,
  Concept,
  ConceptCategory,
  ConceptMap,
  ConceptRelation,
  Layer,
  ModuleInfo,
  ProjectKindId,
  RepoAnalysis,
  TechCategory,
  TechItem,
  Tour,
  TourStep,
} from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { ROLE_INFO, VIEW_INFO } from '@/core/labels'
import { basename } from '@/core/paths'
import { rankModules } from './learningPath'
import { familyOf } from './structure/family'
import { detectStartIn } from './structure/signals'
import { findLine, firstMeaningfulLine, modelFields, snippetAtLine, symbolSnippet } from './structure/snippets'
import { article, capitalize, code, count, escapeMd, escapeMdKeepCode, firstSentence, humanize, listJoin, lowerFirst, readmeIntro, safeName, sentence, slugify, truncateChars } from './structure/text'
import { isPeripheral, zonesOf } from './structure/zones'

type StarterInput = Omit<RepoAnalysis, 'starterConcepts' | 'starterTours'>

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const KIND_ANALOGY: Record<ProjectKindId, string> = {
  'web-app': 'Like a shop on the internet: people walk in, look around and get things done.',
  website: 'Like a magazine you read in the browser: pages of content, nicely laid out.',
  'api-server': 'Like a restaurant kitchen: orders come in through a window, and finished dishes go back out.',
  library: 'Like a toolbox that other builders borrow tools from for their own projects.',
  'cli-tool': 'Like a kitchen gadget: you give it one clear instruction and it does that job.',
  'mobile-app': 'Like a pocket-sized shop you carry around on your phone.',
  'desktop-app': 'Like an appliance installed at home: it lives on your own computer.',
  'browser-extension': 'Like a clip-on accessory for your web browser that adds new tricks.',
  'data-science': 'Like a detective’s notebook: clues (data) go in, findings and charts come out.',
  'ml-model': 'Like teaching a student with lots of worked examples until they can answer new questions.',
  game: 'Like a board game where the code is both the rulebook and the board.',
  infrastructure: 'Like the blueprints and wiring plans for a building.',
  documentation: 'Like a well-organized library of guides.',
  monorepo: 'Like a shopping mall: separate shops under one roof, sharing the same hallways.',
  bot: 'Like a helpful assistant sitting in a chat room, answering whenever someone calls.',
  plugin: 'Like an attachment for a power drill: it adds a new ability to a tool you already have.',
  unknown: 'Like a workshop full of parts that work together.',
}

const LAYER_ANALOGY: Record<Layer, string> = {
  ui: 'Like the shop window and counters — what customers actually see and touch.',
  api: 'Like the front desk and mailroom: where messages come in and go out.',
  logic: 'Like the kitchen: where the real work happens behind the scenes.',
  data: 'Like the filing cabinets, and the forms that go in them.',
  test: 'Like a quality inspector checking every product before it leaves.',
  config: 'Like the settings panel on an appliance.',
  docs: 'Like the instruction manual in the box.',
  infra: 'Like the loading dock and the delivery trucks.',
  other: 'Like the storage room at the back.',
}

const TECH_ANALOGY: Partial<Record<TechCategory, string>> = {
  language: 'Like the language a book is written in — everything else is expressed in it.',
  frontend: 'Like a box of LEGO bricks for building screens.',
  backend: 'Like the engine room of a ship.',
  database: 'Like a giant, perfectly organized filing cabinet.',
  testing: 'Like a checklist inspector who never gets tired.',
  styling: 'Like an interior designer’s palette of colors and fabrics.',
  build: 'Like a factory line that packs the product for shipping.',
  state: 'Like a whiteboard everyone in the office can read and update.',
  api: 'Like a phone line between two offices.',
  cloud: 'Like renting space in someone else’s very reliable building.',
  infra: 'Like the plumbing and wiring of a building.',
  ai: 'Like a very well-read assistant you can ask for help.',
  auth: 'Like the ID check at a building’s front door.',
  payments: 'Like the cash register and card reader at a shop.',
  'data-science': 'Like a calculator and chart paper rolled into one.',
  mobile: 'Like a translator that helps one design run on many phones.',
}

const ACTOR: Record<ProjectKindId, { id: string; name: string; emoji: string; summary: string; verb: string } | null> = {
  'web-app': { id: 'people-using-it', name: 'People using the app', emoji: '🧑‍💻', summary: 'The visitors who open the app in their browser and click around.', verb: 'use' },
  website: { id: 'visitors', name: 'Visitors', emoji: '🧑‍💻', summary: 'The people who read the site in their browser.', verb: 'read' },
  'api-server': { id: 'apps-calling-it', name: 'Apps that call the server', emoji: '📱', summary: 'Websites, phone apps and other programs that send requests to this server.', verb: 'send requests to' },
  library: { id: 'programmers', name: 'Programmers using it', emoji: '👩‍🔧', summary: 'Developers who plug this library into their own projects.', verb: 'build with' },
  'cli-tool': { id: 'person-at-the-terminal', name: 'The person at the terminal', emoji: '⌨️', summary: 'Someone typing commands to make the tool do its job.', verb: 'run' },
  'mobile-app': { id: 'phone-users', name: 'People with the app', emoji: '📱', summary: 'The people who install the app on their phones.', verb: 'use' },
  'desktop-app': { id: 'people-using-it', name: 'People using the app', emoji: '🧑‍💻', summary: 'The people who install and open the app on their computers.', verb: 'use' },
  'browser-extension': { id: 'browser-users', name: 'People who install it', emoji: '🧑‍💻', summary: 'The people who add the extension to their browser.', verb: 'use' },
  'data-science': { id: 'analysts', name: 'Analysts', emoji: '🔎', summary: 'The people exploring the data and reading the results.', verb: 'explore' },
  'ml-model': { id: 'model-users', name: 'People using the model', emoji: '🔎', summary: 'The people (or programs) that ask the model for predictions.', verb: 'ask' },
  game: { id: 'players', name: 'Players', emoji: '🎮', summary: 'The people playing the game.', verb: 'play' },
  infrastructure: { id: 'operators', name: 'The operations team', emoji: '👷', summary: 'The people who use these plans to create and run servers.', verb: 'apply' },
  documentation: { id: 'readers', name: 'Readers', emoji: '📖', summary: 'The people reading and learning from these guides.', verb: 'read' },
  monorepo: null,
  bot: { id: 'chat-members', name: 'Chat members', emoji: '💬', summary: 'The people in the chat who talk to the bot.', verb: 'chat with' },
  plugin: { id: 'tool-users', name: 'People using the host tool', emoji: '🧑‍💻', summary: 'The people who install this plugin into the tool they already use.', verb: 'install' },
  unknown: null,
}

const DATA_KINDS = new Set(['class', 'struct', 'interface', 'type', 'variable', 'constant', 'module'])

/** "UserSchema" → "User", "OrderEntity" → "Order". */
function displayName(name: string): string {
  return name.replace(/(Model|Entity|Schema|Record)$/, '') || name
}

/** Symbols in a model/schema file that describe a kind of stored information (User, Order …), not helpers or errors. */
function dataShapes(f: AnalyzedFile) {
  return f.symbols.filter((s) => {
    if (!DATA_KINDS.has(s.kind) || !/^[A-Z][A-Za-z0-9]+$/.test(s.name)) return false
    if (/(Error|Exception|Err|Validator|Handler|Func|Fn|Option|Builder|Factory|Service|Client|Controller|Router|Test|Manager|QuerySet)$/.test(s.name)) return false
    const helperName = /(Schema|Props|Config|Options|Base|Meta|Mixin|Manager|Serializer|Form|Admin|Dto|DTO|Input|Args)$/.test(s.name) && s.name.length > 6
    return !(helperName && f.role !== 'model')
  })
}

/** A file's name, with its folder when the name alone says little ("json/__init__.py", "users/index.ts"). */
function shortName(path: string): string {
  const name = basename(path)
  const parent = basename(path.slice(0, Math.max(0, path.length - name.length - 1)))
  return parent && /^(__init__\.py|index\.[a-z]+|mod\.rs|main\.[a-z]+|page\.[a-z]+|route\.[a-z]+|layout\.[a-z]+|\+page\.[a-z]+|views\.py|models\.py|urls\.py|app\.py)$/i.test(name) ? `${parent}/${name}` : name
}

/** Names for a pair of files that might share a base name (flask/app.py vs sansio/app.py). */
function pairNames(a: string, b: string): [string, string] {
  if (basename(a) !== basename(b)) return [shortName(a), shortName(b)]
  const tail = (p: string) => p.split('/').slice(-2).join('/')
  return [tail(a), tail(b)]
}

function isCore(f: AnalyzedFile | undefined): f is AnalyzedFile {
  return !!f && !isPeripheral(f.path) && f.kind !== 'test' && f.kind !== 'generated'
}

/** A verbatim line from the file that best represents it. */
function snippetFor(file: AnalyzedFile, contents: Record<string, string>, prefer?: 'start' | 'route'): string | null {
  const content = contents[file.path]
  if (!content) return null
  if (prefer === 'route' && file.routes[0]) {
    const s = snippetAtLine(content, file.routes[0].line)
    if (s) return s
  }
  if (prefer === 'start' || file.isEntry) {
    const start = detectStartIn(content, familyOf(file.language), file.language)
    if (start) {
      const s = snippetAtLine(content, start.line)
      if (s) return s
    }
  }
  const main = mainSymbolOf(file)
  if (main) {
    const s = symbolSnippet(content, main)
    if (s) return s
  }
  return firstMeaningfulLine(content)?.text ?? findLine(content, /^(?!\/\/|#|\/\*|\*|--)\S/, 200)?.text ?? null
}

function mainSymbolOf(file: AnalyzedFile) {
  const pool = file.symbols.filter((s) => s.kind !== 'method' && !/^__\w+__$/.test(s.name))
  const exported = pool.filter((s) => s.exported)
  const list = exported.length > 0 ? exported : pool
  const stem = file.name.replace(/\..*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  return list.find((s) => s.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === stem) ?? list[0] ?? null
}

function keySymbolsSentence(file: AnalyzedFile): string {
  const names = [...new Set(file.symbols.filter((s) => s.exported && s.kind !== 'method').map((s) => s.name))].slice(0, 3)
  if (names.length === 0) return ''
  return `Look for ${listJoin(names.map(code))} — ${names.length === 1 ? 'that’s the main thing this file offers' : 'the main things this file offers'}.`
}

function roleSentence(file: AnalyzedFile): string {
  if (file.role === 'library' || file.role === 'other' || file.role === 'entry') return ''
  const info = ROLE_INFO[file.role]
  return `Its role: ${lowerFirst(info.label)} — ${lowerFirst(info.description)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Concepts
// ─────────────────────────────────────────────────────────────────────────────

function categoryForLayer(layer: Layer): ConceptCategory {
  switch (layer) {
    case 'ui':
    case 'logic':
      return 'feature'
    case 'api':
    case 'infra':
    case 'test':
      return 'process'
    case 'data':
      return 'data'
    default:
      return 'idea'
  }
}

interface ConceptBuilder {
  concepts: Concept[]
  relations: ConceptRelation[]
  ids: Set<string>
}

function uniqueId(b: ConceptBuilder, base: string): string {
  let id = slugify(base)
  let n = 2
  while (b.ids.has(id)) id = `${slugify(base)}-${n++}`
  b.ids.add(id)
  return id
}

function relate(b: ConceptBuilder, from: string, label: string, to: string): void {
  if (from === to) return
  if (!b.ids.has(from) || !b.ids.has(to)) return
  if (b.relations.some((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from))) return
  b.relations.push({ from, to, label })
}

function techFiles(t: TechItem, analysis: StarterInput): string[] {
  const out: string[] = []
  for (const ev of t.evidence ?? []) {
    const p = ev.split(/\s+(?:→|->|:)\s+/)[0]?.trim()
    if (p && analysis.files[p] && !out.includes(p)) out.push(p)
  }
  if (out.length === 0) {
    // Files that import the technology's package.
    for (const f of Object.values(analysis.files)) {
      if (f.externalImports.some((x) => x.toLowerCase() === t.id.toLowerCase() || x.toLowerCase() === t.name.toLowerCase())) out.push(f.path)
      if (out.length >= 4) break
    }
  }
  return out.slice(0, 5)
}

/**
 * A heuristic concept map so "Key Ideas" works without AI: concepts derived from the project kind, main modules,
 * core technologies, data models (files with role 'model'/'schema' → their class names), routes and entry points,
 * related with simple verbs ("uses", "stores", "shows", "is built with"). 6–16 concepts. source: 'starter'.
 */
export interface StarterOptions {
  /** What to call the project ("httpie" for the httpie/cli repository); defaults to the repository's name. */
  name?: string
}

export function buildStarterConcepts(analysis: StarterInput, contents: Record<string, string> = {}, options: StarterOptions = {}): ConceptMap {
  const b: ConceptBuilder = { concepts: [], relations: [], ids: new Set() }
  const kind = analysis.projectKind
  const repo = safeName(options.name?.trim() || analysis.meta.repo || 'This project', 40)
  const files = Object.values(analysis.files)
  const intro = readmeIntro(analysis.readme?.content, 400)
  const add = (c: Omit<Concept, 'id'> & { id?: string }, base: string): string => {
    const id = c.id ?? uniqueId(b, base)
    if (c.id) b.ids.add(c.id)
    b.concepts.push({ ...c, id, files: c.files.filter((p) => analysis.files[p]).slice(0, 8), importance: Math.max(1, Math.min(5, Math.round(c.importance))) })
    return id
  }

  // 1. The project itself.
  const kindLabel = kind.id === 'unknown' ? 'software project' : lowerFirst(kind.label)
  const projectId = add(
    {
      id: 'the-project',
      name: repo,
      emoji: kind.emoji,
      category: 'idea',
      summary: sentence(`${repo} is ${article(kindLabel)} ${kindLabel} — ${lowerFirst(kind.description).replace(/\.$/, '')}`),
      explanation: [
        intro ? `In the authors’ words: “${escapeMd(intro)}”` : analysis.meta.description ? `Its description says: “${escapeMd(truncateChars(analysis.meta.description, 240))}”` : '',
        kind.reasons.length > 0 ? `How we can tell: ${kind.reasons.slice(0, 3).map((r) => lowerFirst(escapeMd(r)).replace(/\.$/, '')).join('; ')}.` : '',
        analysis.modules.length > 1 ? `It’s organized into ${count(analysis.modules.length, 'main part')}, each with its own job.` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      analogy: KIND_ANALOGY[kind.id],
      files: [...analysis.entryPoints.slice(0, 2), ...(analysis.readme ? [analysis.readme.path] : [])],
      importance: 5,
    },
    'the-project',
  )

  // 2. Who uses it.
  const actor = ACTOR[kind.id]
  let actorId: string | null = null
  if (actor) {
    actorId = add(
      {
        name: actor.name,
        emoji: actor.emoji,
        category: 'actor',
        summary: actor.summary,
        explanation: `Everything in ${repo} exists to serve them. When you read the code, it helps to ask: “what would this person see or need at this moment?”`,
        analogy: 'Like the customer a shop is designed around.',
        files: [],
        importance: 3,
      },
      actor.id,
    )
    relate(b, actorId, actor.verb, projectId)
  }

  // 3. Where it starts.
  const entry = analysis.entryPoints.find((p) => analysis.files[p])
  let startId: string | null = null
  if (entry) {
    const f = analysis.files[entry]
    startId = add(
      {
        name: 'Starting point',
        emoji: '🚀',
        category: 'process',
        summary: sentence(`Where ${repo} begins: ${code(entry)}`),
        explanation: [
          escapeMdKeepCode(sentence(f.entryReason ?? 'This looks like the place things begin.')),
          f.imports.length > 0
            ? `From there it brings in ${listJoin(f.imports.slice(0, 3).map((p) => code(shortName(p))))}${f.imports.length > 3 ? ` and ${f.imports.length - 3} more` : ''}, which is how the rest of the code gets involved.`
            : '',
          analysis.entryPoints.length === 2 ? `There’s one other possible starting point: ${code(analysis.entryPoints[1])}.` : '',
          analysis.entryPoints.length > 2 ? `There are ${analysis.entryPoints.length - 1} other possible starting points, such as ${code(analysis.entryPoints[1])}.` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        analogy: 'Like the ignition key of a car — turn it and everything else wakes up.',
        files: analysis.entryPoints.slice(0, 3),
        importance: 4,
      },
      'starting-point',
    )
    relate(b, projectId, 'starts at', startId)
  }

  // 4. The main parts.
  const ranked = rankModules(analysis).slice(0, 5)
  const moduleConcept = new Map<string, string>()
  const projectConcept = b.concepts.find((c) => c.id === projectId)
  ranked.forEach((m, i) => {
    // The project's own main folder (flask/src/flask, gin's top level) is the project itself, not a second idea next to it.
    if (projectConcept && slugify(m.name) === slugify(repo)) {
      moduleConcept.set(m.id, projectId)
      for (const p of m.keyFiles) if (!projectConcept.files.includes(p) && analysis.files[p] && projectConcept.files.length < 8) projectConcept.files.push(p)
      return
    }
    // Keep folder names such as "ginS" as written; only lower-case names get a capital ("binding" → "Binding").
    const name = /[A-Z]/.test(m.name) ? m.name : capitalize(m.name)
    const id = add(
      {
        name,
        emoji: m.emoji,
        category: categoryForLayer(m.layer),
        summary: sentence(firstSentence(m.description)),
        explanation: [
          escapeMdKeepCode(m.description.split(/(?<=[.!?])\s+/).slice(1).join(' ') || m.description),
          m.keyFiles.length > 0 ? `Key files: ${m.keyFiles.slice(0, 4).map((p) => code(shortName(p))).join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        analogy: LAYER_ANALOGY[m.layer],
        files: m.keyFiles,
        importance: i < 2 ? 4 : 3,
      },
      `part-${m.name}`,
    )
    moduleConcept.set(m.id, id)
    relate(b, projectId, 'is made of', id)
  })
  if (startId && entry) {
    const mid = moduleConcept.get(analysis.files[entry].moduleId)
    if (mid) relate(b, startId, 'lives in', mid)
  }
  let edgeLinks = 0
  for (const e of analysis.moduleEdges) {
    const from = moduleConcept.get(e.source)
    const to = moduleConcept.get(e.target)
    if (from && to && edgeLinks < 6) {
      relate(b, from, 'uses', to)
      edgeLinks++
    }
  }

  // 5. Core technologies (frameworks first, a database if there is one, then the main language).
  const techs = analysis.techStack.filter((t) => t.importance === 'core' && t.category !== 'language')
  const database = analysis.techStack.find((t) => t.category === 'database' && t.importance !== 'tooling')
  const picked: TechItem[] = techs.slice(0, 3)
  if (database && !picked.includes(database)) picked.push(database)
  const mainLang = analysis.techStack.find((t) => t.category === 'language')
  if (mainLang && picked.length < 4) picked.push(mainLang)
  const techConcept = new Map<string, string>()
  for (const t of picked) {
    const id = add(
      {
        name: t.name,
        emoji: t.category === 'database' ? '🗄️' : t.category === 'language' ? '🔤' : '🛠️',
        category: 'technology',
        summary: sentence(firstSentence(t.description || `${t.name} is one of the tools this project is built with`)),
        explanation: [escapeMd(t.description || `${t.name} is one of the tools this project relies on.`), t.evidence?.length ? `We spotted it in ${listJoin(t.evidence.slice(0, 3).map((e) => escapeMd(e)))}.` : '']
          .filter(Boolean)
          .join('\n\n'),
        analogy: t.analogy || TECH_ANALOGY[t.category] || 'Like a specialized tool in a workshop.',
        files: techFiles(t, analysis),
        importance: t.category === 'language' ? 3 : 4,
      },
      `tech-${t.id}`,
    )
    techConcept.set(t.id, id)
    relate(b, projectId, t.category === 'language' ? 'is written in' : 'is built with', id)
    if (t.category === 'frontend') {
      for (const m of ranked) if (m.layer === 'ui' && moduleConcept.get(m.id)) relate(b, moduleConcept.get(m.id) as string, 'is built with', id)
    }
  }

  // 6. Data models.
  const modelFiles = files
    .filter((f) => isCore(f) && (f.role === 'model' || f.role === 'schema') && dataShapes(f).length > 0)
    .sort((a, b) => Number(b.role === 'model') - Number(a.role === 'model') || b.importedBy.length - a.importedBy.length || a.path.localeCompare(b.path))
  const seenModels = new Set<string>()
  let models = 0
  for (const f of modelFiles) {
    for (const s of dataShapes(f)) {
      if (models >= 5) break
      const display = displayName(s.name)
      if (seenModels.has(display.toLowerCase())) continue
      seenModels.add(display.toLowerCase())
      const content = contents[f.path]
      const fields = content ? modelFields(content, s).map((n) => humanize(n) || n) : []
      const id = add(
        {
          name: display,
          emoji: '🧾',
          category: 'data',
          summary: sentence(`${capitalize(article(display))} ${display} is one of the kinds of information ${repo} keeps track of`),
          explanation: [
            `It’s described in ${code(f.path)}${s.kind === 'class' ? ` as ${code(s.name)}` : ''}.`,
            fields.length > 0 ? `Each ${escapeMd(humanize(display) || display)} has details such as ${listJoin(fields.slice(0, 6).map((x) => `**${escapeMd(x)}**`))}.` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          analogy: `Like a form with blanks to fill in — every ${humanize(display) || display} gets the same blanks.`,
          files: [f.path],
          importance: 3,
        },
        display,
      )
      models++
      if (database && techConcept.get(database.id)) relate(b, id, 'is stored in', techConcept.get(database.id) as string)
      const mid = moduleConcept.get(f.moduleId)
      if (mid) relate(b, id, 'is defined in', mid)
      else relate(b, projectId, 'keeps track of', id)
    }
  }

  // 7. Web addresses.
  const routeFiles = files.filter((f) => isCore(f) && f.routes.length > 0).sort((a, b) => b.routes.length - a.routes.length)
  if (routeFiles.length > 0) {
    const allRoutes = routeFiles.flatMap((f) => f.routes.map((r) => ({ ...r, file: f.path })))
    const shown = allRoutes.slice(0, 6)
    const id = add(
      {
        name: 'Web addresses',
        emoji: '🧭',
        category: 'process',
        summary: sentence(`The ${count(allRoutes.length, 'web address', 'web addresses')} ${repo} answers, like ${escapeMd(`${shown[0].method === 'ANY' ? '' : `${shown[0].method} `}${shown[0].path}`)}`),
        explanation: [
          'Each address is like a door into the server: a request arrives at one of them, and the code behind that door decides what to send back.',
          shown.map((r) => `- ${code(`${r.method === 'ANY' ? '' : `${r.method} `}${r.path}`)} — in ${code(basename(r.file))}`).join('\n'),
        ].join('\n\n'),
        analogy: 'Like the list of departments in a building’s lobby — each address leads to a different desk.',
        files: routeFiles.map((f) => f.path),
        importance: 4,
      },
      'web-addresses',
    )
    const byModule = new Map<string, number>()
    for (const f of routeFiles) byModule.set(f.moduleId, (byModule.get(f.moduleId) ?? 0) + f.routes.length)
    const topModule = [...byModule.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (topModule && moduleConcept.get(topModule)) relate(b, id, 'are handled by', moduleConcept.get(topModule) as string)
    else relate(b, projectId, 'answers', id)
    if (actorId) relate(b, actorId, 'visits', id)
  }

  // 8. Examples — for toolboxes they're often the best way in.
  const exampleModule = analysis.modules.find((m) => zonesOf(`${m.path}/x`).includes('example'))
  if (exampleModule && (kind.id === 'library' || kind.id === 'plugin' || kind.id === 'monorepo' || kind.id === 'unknown')) {
    const exampleNames = [...new Set(exampleModule.files.map((p) => p.split('/')[1]).filter((n): n is string => !!n && !n.includes('.')))]
    const id = add(
      {
        name: 'Examples',
        emoji: '🧪',
        category: 'idea',
        summary: sentence(`Small sample projects that show how to use ${repo}`),
        explanation: [
          `The ${code(exampleModule.path)} folder holds ${count(exampleModule.fileCount, 'file')} of ready-to-run samples. Reading one is often the quickest way to see what ${escapeMd(repo)} is for.`,
          exampleNames.length > 0 ? `Examples include ${listJoin(exampleNames.slice(0, 5).map((n) => `“${escapeMd(humanize(n) || n)}”`))}.` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        analogy: 'Like the sample dishes in a cookbook’s photos — they show what you can make with the recipes.',
        files: exampleModule.keyFiles,
        importance: 3,
      },
      'examples',
    )
    relate(b, id, 'show how to use', projectId)
  }

  // 9. Outside services.
  const clients = files.filter((f) => isCore(f) && f.role === 'client')
  if (clients.length > 0) {
    const id = add(
      {
        name: 'Outside services',
        emoji: '📡',
        category: 'process',
        summary: sentence(`Other servers and services ${repo} talks to over the internet`),
        explanation: `Some jobs are handed to services elsewhere on the internet. The code that makes those calls lives in ${listJoin(clients.slice(0, 3).map((f) => code(basename(f.path))))}.`,
        analogy: 'Like phoning another company to get something done for you.',
        files: clients.map((f) => f.path),
        importance: 2,
      },
      'outside-services',
    )
    const mid = moduleConcept.get(clients[0].moduleId)
    relate(b, mid ?? projectId, 'calls', id)
  }

  // 10. Automatic checks.
  const tests = files
    .filter((f) => f.kind === 'test')
    .sort((a, b) => Number(zonesOf(a.path).includes('example')) - Number(zonesOf(b.path).includes('example')) || Number(b.role === 'test') - Number(a.role === 'test') || (b.lines ?? 0) - (a.lines ?? 0) || a.path.localeCompare(b.path))
  if (tests.length > 0) {
    const id = add(
      {
        name: 'Automatic checks',
        emoji: '✅',
        category: 'process',
        summary: sentence(`${count(tests.length, 'test file')} that ${tests.length === 1 ? 'checks' : 'check'} the code still works after every change`),
        explanation: 'Tests are small programs that use the real code and compare the results with what’s expected. If something breaks, they complain right away — long before a real person runs into the problem.',
        analogy: 'Like a pilot’s pre-flight checklist, run every time before take-off.',
        files: tests.slice(0, 5).map((f) => f.path),
        importance: 2,
      },
      'automatic-checks',
    )
    relate(b, id, 'check', projectId)
  }

  // 11. Build & ship.
  const shipping = files.filter((f) => f.role === 'ci' || f.role === 'container')
  if (shipping.length > 0) {
    const hasCi = shipping.some((f) => f.role === 'ci')
    const hasContainer = shipping.some((f) => f.role === 'container')
    const id = add(
      {
        name: 'Build & delivery',
        emoji: '🏗️',
        category: 'process',
        summary: sentence(hasCi ? 'Automation that checks and ships every change' : 'Instructions for packing the app up to run anywhere'),
        explanation: [
          hasCi ? 'Automation pipelines run by themselves whenever someone changes the code: they run the checks and can publish the result.' : '',
          hasContainer ? 'Container recipes pack the app together with everything it needs, so it runs the same way on any computer.' : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        analogy: 'Like the packing and shipping department of a factory.',
        files: shipping.slice(0, 5).map((f) => f.path),
        importance: 2,
      },
      'build-and-delivery',
    )
    relate(b, id, 'packages and ships', projectId)
  }

  // 12. Fill up small maps with settings and docs so the view has something to show.
  if (b.concepts.length < 6) {
    const root = analysis.modules.find((m) => m.id === ROOT_MODULE_ID)
    if (root) {
      const id = add(
        {
          name: 'Project setup',
          emoji: '🎛️',
          category: 'idea',
          summary: 'The settings files that tell tools how to install, build and run the project.',
          explanation: `These live at the top level: ${listJoin(root.files.slice(0, 4).map((p) => code(p)))}.`,
          analogy: LAYER_ANALOGY.config,
          files: root.keyFiles,
          importance: 2,
        },
        'project-setup',
      )
      relate(b, id, 'configures', projectId)
    }
  }
  if (b.concepts.length < 6) {
    const docs = files.filter((f) => f.kind === 'docs')
    if (docs.length > 0) {
      const id = add(
        {
          name: 'Guides',
          emoji: '📖',
          category: 'idea',
          summary: `${count(docs.length, 'written guide')} explaining how to use and work on ${repo}.`,
          explanation: 'Documentation written for people, not computers: how to install it, use it and contribute.',
          analogy: LAYER_ANALOGY.docs,
          files: docs.slice(0, 5).map((f) => f.path),
          importance: 2,
        },
        'guides',
      )
      relate(b, id, 'explain', projectId)
    }
  }

  const concepts = b.concepts.slice(0, 16)
  const kept = new Set(concepts.map((c) => c.id))
  return { concepts, relations: b.relations.filter((r) => kept.has(r.from) && kept.has(r.to)), source: 'starter' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tours
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PRIORITY: Partial<Record<string, number>> = {
  entry: 9,
  page: 8,
  layout: 7,
  route: 8,
  controller: 8,
  service: 7,
  component: 6,
  state: 6,
  model: 6,
  repository: 6,
  client: 5,
  middleware: 5,
  hook: 4,
  cli: 7,
  library: 5,
  util: 2,
  schema: 3,
}

const SKIP_ROLES = new Set(['types', 'constants', 'style', 'test', 'fixture', 'config', 'asset', 'i18n', 'docs', 'build', 'ci', 'container'])

function stepScore(f: AnalyzedFile): number {
  return (ROLE_PRIORITY[f.role] ?? 3) * 2 + Math.min(f.importedBy.length, 10) + Math.min((f.lines ?? 0) / 150, 3) + (f.fetched ? 2 : 0)
}

function tourStep(file: AnalyzedFile, contents: Record<string, string>, title: string, explanation: string, prefer?: 'start' | 'route'): TourStep {
  return { title, explanation, file: file.path, snippet: snippetFor(file, contents, prefer), moduleId: file.moduleId || null }
}

function conceptStep(title: string, explanation: string, moduleId: string | null = null): TourStep {
  return { title, explanation, file: null, snippet: null, moduleId }
}

function beginTour(analysis: StarterInput, contents: Record<string, string>): Tour | null {
  const start =
    analysis.entryPoints.map((p) => analysis.files[p]).find((f) => isCore(f) && f.fetched) ??
    analysis.entryPoints.map((p) => analysis.files[p]).find((f): f is AnalyzedFile => !!f && f.fetched) ??
    analysis.hubs.map((p) => analysis.files[p]).find((f) => isCore(f) && f.fetched)
  if (!start) return null

  const order: AnalyzedFile[] = [start]
  const parentOf = new Map<string, string>()
  const visited = new Set([start.path])
  const queue = [start]
  const siblingOf = new Set<string>()
  const allFiles = Object.values(analysis.files)
  while (queue.length > 0 && order.length < 7) {
    const cur = queue.shift() as AnalyzedFile
    const usable = (f: AnalyzedFile | undefined): f is AnalyzedFile => !!f && !visited.has(f.path) && !SKIP_ROLES.has(f.role) && isCore(f)
    // Go files in one folder form a single package and share everything without importing each other.
    const siblings =
      familyOf(cur.language) === 'go' && cur === start
        ? allFiles
            .filter((f) => f.dir === cur.dir && f.ext === 'go' && f.fetched && usable(f))
            .sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0) || a.path.localeCompare(b.path))
            .slice(0, 2)
        : []
    for (const sib of siblings) siblingOf.add(sib.path)
    const imported = cur.imports
      .map((p) => analysis.files[p])
      .filter(usable)
      .filter((f) => !siblingOf.has(f.path))
      .sort((a, b) => stepScore(b) - stepScore(a) || a.path.localeCompare(b.path))
      .slice(0, 3)
    const children = [...siblings, ...imported]
    for (const c of children) {
      if (order.length >= 7) break
      visited.add(c.path)
      parentOf.set(c.path, cur.path)
      order.push(c)
      queue.push(c)
    }
  }

  const steps: TourStep[] = []
  const nextNames = order.filter((f) => parentOf.get(f.path) === start.path).slice(0, 3).map((f) => code(shortName(f.path)))
  const genericSummary = /^(The starting point|The front door)/.test(start.summary)
  steps.push(
    tourStep(
      start,
      contents,
      `Start here: ${shortName(start.path)}`,
      [
        escapeMdKeepCode(sentence(start.entryReason ?? start.summary)),
        start.entryReason && start.summary && !genericSummary ? escapeMdKeepCode(start.summary) : '',
        nextNames.length > 0 ? `To do its job it brings in ${listJoin(nextNames)} — that’s where we’ll go next.` : 'It does its work mostly on its own, without handing off to other files in the project.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      'start',
    ),
  )
  order.slice(1).forEach((f, i) => {
    const parent = analysis.files[parentOf.get(f.path) ?? '']
    const next = order.slice(i + 2).find((x) => parentOf.get(x.path) === f.path)
    steps.push(
      tourStep(
        f,
        contents,
        i === 0 ? `Next stop: ${shortName(f.path)}` : shortName(f.path),
        [
          siblingOf.has(f.path) && parent
            ? `${code(shortName(parent.path))} and this file live in the same folder, which Go treats as one package: they share everything without having to import each other.`
            : parent
              ? `${code(shortName(parent.path))} brings this file in.`
              : '',
          escapeMdKeepCode(f.summary),
          roleSentence(f),
          keySymbolsSentence(f),
          next ? `From here, the trail continues to ${code(shortName(next.path))}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    )
  })
  const path = order.map((f) => code(shortName(f.path))).join(' → ')
  steps.push(
    conceptStep(
      'What you’ve seen',
      order.length > 1
        ? `You followed the trail from the starting point through ${count(order.length - 1, 'file')}: ${path}. In short, the starting point sets things up and hands the real work to these pieces. Next, open **${VIEW_INFO.map.label}** to see the rest of the project.`
        : `This project starts in ${code(start.name)} and does most of its work right there. Open **${VIEW_INFO.map.label}** to see the other parts and how they relate.`,
    ),
  )
  return {
    id: 'where-it-begins',
    title: 'Where does it all begin?',
    question: 'What happens when the program starts?',
    emoji: '🚀',
    summary: sentence(order.length > 1 ? `Follow the code from its starting point, ${code(start.path)}, through the ${count(order.length - 1, 'file')} it brings in first` : `See what happens in ${code(start.path)}, where the project starts`),
    steps,
    source: 'starter',
  }
}

function partsTour(analysis: StarterInput, contents: Record<string, string>): Tour | null {
  const ranked = rankModules(analysis)
  if (ranked.length < 2) return null
  const coreIds = new Set(ranked.map((m) => m.id))
  const byId = new Map(analysis.modules.map((m) => [m.id, m]))
  const entry = analysis.entryPoints[0]
  const entryModule = entry ? analysis.files[entry]?.moduleId : undefined
  const first = (entryModule && coreIds.has(entryModule) ? byId.get(entryModule) : undefined) ?? ranked[0]
  const edges = analysis.moduleEdges.filter((e) => coreIds.has(e.source) && coreIds.has(e.target))

  const visited: ModuleInfo[] = [first]
  const via = new Map<string, (typeof edges)[number]>()
  while (visited.length < 6) {
    const seen = new Set(visited.map((m) => m.id))
    const last = visited[visited.length - 1]
    const fromLast = edges.filter((e) => e.source === last.id && !seen.has(e.target)).sort((a, b) => b.weight - a.weight)[0]
    const fromAny = fromLast ?? edges.filter((e) => seen.has(e.source) && !seen.has(e.target)).sort((a, b) => b.weight - a.weight)[0]
    let next: ModuleInfo | undefined
    if (fromAny) {
      next = byId.get(fromAny.target)
      if (next) via.set(next.id, fromAny)
    } else {
      next = ranked.find((m) => !seen.has(m.id))
    }
    if (!next) break
    visited.push(next)
  }
  if (visited.length < 2) return null

  const repo = safeName(analysis.meta.repo || 'This project', 40)
  const intro = readmeIntro(analysis.readme?.content, 220)
  const steps: TourStep[] = [
    conceptStep(
      'The big picture',
      `${intro ? `**${escapeMd(repo)}** — in the authors’ words, “${escapeMd(intro)}” ` : `**${escapeMd(repo)}** is ${article(analysis.projectKind.label)} ${escapeMd(lowerFirst(analysis.projectKind.label))}. `}It’s split into ${count(analysis.modules.length, 'main part')}. Let’s visit the important ones in the order the work flows between them.`,
    ),
  ]
  for (const m of visited) {
    const edge = via.get(m.id)
    const outgoing = edges.filter((e) => e.source === m.id).sort((a, b) => b.weight - a.weight)[0]
    const key = m.keyFiles.map((p) => analysis.files[p]).find((f) => f?.fetched) ?? analysis.files[m.keyFiles[0] ?? '']
    const parts = [
      escapeMdKeepCode(m.description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')),
      edge && edge.examples[0]
        ? (() => {
            const [from, to] = pairNames(edge.examples[0].from, edge.examples[0].to)
            return `We got here because **${escapeMd(byId.get(edge.source)?.name ?? edge.source)}** relies on it — for example ${code(from)} uses ${code(to)}.`
          })()
        : edge
          ? `We got here because **${escapeMd(byId.get(edge.source)?.name ?? edge.source)}** relies on it.`
          : '',
      outgoing && byId.get(outgoing.target)
        ? `It relies on **${escapeMd(byId.get(outgoing.target)?.name ?? '')}** (${count(outgoing.weight, 'link')}).`
        : !edge
          ? 'It works fairly independently of the other main parts.'
          : '',
    ].filter(Boolean)
    steps.push(
      key
        ? { title: safeName(m.name, 40), explanation: parts.join(' '), file: key.path, snippet: snippetFor(key, contents), moduleId: m.id }
        : conceptStep(safeName(m.name, 40), parts.join(' '), m.id),
    )
  }
  const chain = visited.map((m) => `**${escapeMd(m.name)}**`).join(' → ')
  steps.push(conceptStep('How it fits together', `The work flows roughly like this: ${chain}. Each part has its own job and leans on the next one for the rest — like stations on an assembly line.`))
  return {
    id: 'main-parts',
    title: 'How the main parts work together',
    question: 'How do the main parts of the project fit together?',
    emoji: '🧩',
    summary: sentence(`A walk through ${count(visited.length, 'main part')} of ${repo}, following how they rely on each other`),
    steps,
    source: 'starter',
  }
}

const HANDOFF_PRIORITY: Partial<Record<string, number>> = { controller: 6, service: 5, repository: 4, model: 4, client: 3, middleware: 2, library: 2, util: 1 }

function requestTour(analysis: StarterInput, contents: Record<string, string>): Tour | null {
  const files = Object.values(analysis.files).filter((f) => f.routes.length > 0 && f.kind === 'source' && !zonesOf(f.path).includes('test'))
  const core = files.filter((f) => isCore(f))
  const pool = (core.length > 0 ? core : files).sort((a, b) => Number(b.fetched) - Number(a.fetched) || b.routes.length - a.routes.length || a.path.localeCompare(b.path))
  const routeFile = pool[0]
  if (!routeFile) return null
  const fromExample = core.length === 0
  const kind = analysis.projectKind.id
  const isApi = kind === 'api-server'
  const r0 = routeFile.routes[0]
  const addr = `${r0.method === 'ANY' ? '' : `${r0.method} `}${r0.path}`

  const steps: TourStep[] = [
    conceptStep(
      'A request arrives',
      `When someone opens a web address — say ${code(addr)} — their browser${isApi ? ' or app' : ''} sends a **request** to the server, a bit like posting a letter that asks for something. The server’s job is to read it and send back an answer.${fromExample ? ' We’ll follow one of the project’s examples, since that’s where its web addresses are set up.' : ''}`,
    ),
  ]
  const middleware = Object.values(analysis.files).find((f) => isCore(f) && f.role === 'middleware' && f.fetched)
  if (middleware && !fromExample) {
    steps.push(tourStep(middleware, contents, `First, a checkpoint: ${shortName(middleware.path)}`, `${escapeMdKeepCode(middleware.summary)} Requests pass through checks like this before reaching the code that answers them.`))
  }
  const otherAddrs = routeFile.routes.slice(1, 4).map((r) => code(`${r.method === 'ANY' ? '' : `${r.method} `}${r.path}`))
  steps.push(
    tourStep(
      routeFile,
      contents,
      `The address book: ${shortName(routeFile.path)}`,
      `This file decides what happens for ${count(routeFile.routes.length, 'web address', 'web addresses')}, starting with ${code(addr)}${otherAddrs.length > 0 ? ` (others include ${listJoin(otherAddrs)})` : ''}. The highlighted line is where that address is connected to the code that answers it.`,
      'route',
    ),
  )
  const handoffs = routeFile.imports
    .map((p) => analysis.files[p])
    .filter((f): f is AnalyzedFile => !!f && f.kind === 'source' && (HANDOFF_PRIORITY[f.role] ?? 0) > 0)
    .sort((a, b) => (HANDOFF_PRIORITY[b.role] ?? 0) - (HANDOFF_PRIORITY[a.role] ?? 0) || stepScore(b) - stepScore(a))
    .slice(0, 3)
  for (const f of handoffs) {
    steps.push(tourStep(f, contents, shortName(f.path), `${code(shortName(routeFile.path))} hands part of the work to this file. ${escapeMdKeepCode(f.summary)} ${roleSentence(f)}`.trim()))
  }
  const db = analysis.techStack.find((t) => t.category === 'database')
  steps.push(
    conceptStep(
      'The answer goes back',
      `Once the work is done${db ? ` (often after reading or saving information in ${escapeMd(db.name)})` : ''}, the server sends a **response** back: ${isApi ? 'usually data that an app turns into something on screen' : 'a web page, or data the page turns into something you can see'}. That round trip usually takes a fraction of a second.`,
    ),
  )
  const title = isApi ? 'What happens when a request reaches the server?' : kind === 'web-app' || kind === 'website' ? 'What happens when someone visits the app?' : 'What happens when a web request arrives?'
  return {
    id: 'a-request',
    title,
    question: title,
    emoji: '🌐',
    summary: sentence(`Follow one web request — ${code(addr)} — from the moment it arrives to the answer that goes back`),
    steps,
    source: 'starter',
  }
}

function dataTour(analysis: StarterInput, contents: Record<string, string>): Tour | null {
  const files = Object.values(analysis.files)
  const models = files
    .filter((f) => isCore(f) && (f.role === 'model' || f.role === 'schema') && f.fetched && dataShapes(f).length > 0)
    .sort((a, b) => Number(b.role === 'model') - Number(a.role === 'model') || b.importedBy.length - a.importedBy.length || a.path.localeCompare(b.path))
    .slice(0, 4)
  if (models.length === 0) return null
  const repo = safeName(analysis.meta.repo || 'This project', 40)
  const db = analysis.techStack.find((t) => t.category === 'database')
  const steps: TourStep[] = [
    conceptStep(
      'Every app needs a memory',
      `Apps have to remember things — people, orders, messages. Here’s where ${escapeMd(repo)} describes what it remembers${db ? `, which it stores using **${escapeMd(db.name)}**` : ''}. Think of each “model” as a form with the same blanks to fill in for every item.`,
    ),
  ]
  for (const f of models) {
    const shapes = dataShapes(f).slice(0, 3)
    const content = contents[f.path]
    const withFields = content ? shapes.map((s) => ({ s, fields: modelFields(content, s) })).find((x) => x.fields.length > 0) : undefined
    const main = withFields?.s ?? shapes[0]
    const fields = (withFields?.fields ?? []).map((x) => humanize(x) || x)
    const thing = main ? humanize(displayName(main.name)) || main.name : 'item'
    const step = tourStep(
      f,
      contents,
      shapes.length > 0 ? shapes.map((s) => s.name).join(', ') : f.name,
      [
        escapeMdKeepCode(f.summary),
        fields.length > 0 ? `Each ${escapeMd(thing)} has details such as ${listJoin(fields.slice(0, 6).map((x) => `**${escapeMd(x)}**`))}.` : '',
        f.importedBy.length > 0 ? `${count(f.importedBy.length, 'other file')} use${f.importedBy.length === 1 ? 's' : ''} it.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    if (main && content) step.snippet = symbolSnippet(content, main) ?? step.snippet
    steps.push(step)
  }
  const migrations = files.filter((f) => f.role === 'migration').sort((a, b) => b.path.localeCompare(a.path))
  if (migrations.length > 0) {
    const latest = migrations[0]
    steps.push(
      tourStep(
        latest,
        contents,
        'The history of changes',
        `The database’s structure changes over time, and each change is saved as a numbered step — there are ${count(migrations.length, 'step')} here. This is the latest one. ${escapeMdKeepCode(latest.summary)}`,
      ),
    )
  }
  return {
    id: 'the-data',
    title: 'Where is information kept?',
    question: 'What information does the project keep track of, and how?',
    emoji: '🗄️',
    summary: sentence(
      `Meet the kinds of information ${repo} remembers, such as ${listJoin([...new Set(models.flatMap((f) => dataShapes(f).map((s) => displayName(s.name))))].slice(0, 3).map(code)) || 'its data models'}`,
    ),
    steps,
    source: 'starter',
  }
}

const TEST_LINE = /\b(?:it|test|describe|context)\s*\(\s*['"`]|^\s*def\s+test_|^\s*func\s+Test\w*\s*\(|@Test\b|\[Fact\]|^\s*it\s+['"]/

function testsTour(analysis: StarterInput, contents: Record<string, string>): Tour | null {
  const files = Object.values(analysis.files)
  const tests = files.filter((f) => f.kind === 'test' && f.role === 'test' && f.fetched && contents[f.path])
  if (tests.length === 0) return null
  const sample = [...tests].sort((a, b) => {
    const aCore = a.imports.some((p) => isCore(analysis.files[p]))
    const bCore = b.imports.some((p) => isCore(analysis.files[p]))
    return Number(bCore) - Number(aCore) || (b.lines ?? 0) - (a.lines ?? 0) || a.path.localeCompare(b.path)
  })[0]
  const content = contents[sample.path]
  const testLine = findLine(content, TEST_LINE)
  const steps: TourStep[] = [
    conceptStep(
      'Why tests exist',
      `Tests are small programs that use the real code and check the results — like a checklist a pilot runs before take-off. This project has ${count(files.filter((f) => f.kind === 'test').length, 'test file')}.`,
    ),
    {
      title: `A real test: ${shortName(sample.path)}`,
      explanation: `${escapeMdKeepCode(sample.summary)} The highlighted line starts one check: it describes, in plain words, what should happen — and then the code checks that it really does.`,
      file: sample.path,
      snippet: testLine?.text ?? firstMeaningfulLine(content)?.text ?? null,
      moduleId: sample.moduleId || null,
    },
  ]
  const testStem = sample.name.replace(/\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|\.[a-z]+$/i, '').replace(/^test_/, '').toLowerCase()
  const sameStem = (f: AnalyzedFile | undefined) => !!f && f.name.replace(/\.[^.]+$/, '').toLowerCase() === testStem
  const target =
    Object.values(analysis.files).find((f) => isCore(f) && f.dir === sample.dir && sameStem(f) && f.kind === 'source') ??
    sample.imports.map((p) => analysis.files[p]).find((f) => isCore(f) && sameStem(f)) ??
    sample.imports.map((p) => analysis.files[p]).find((f) => isCore(f))
  if (target) steps.push(tourStep(target, contents, `What it checks: ${shortName(target.path)}`, `The test above uses this file. ${escapeMdKeepCode(target.summary)} If someone breaks it by accident, the test will notice.`))
  const ci = files.find((f) => f.role === 'ci' && /\.github\/workflows\//.test(f.path) && contents[f.path] && /\b(test|check|ci)\b/i.test(f.path + contents[f.path]))
  if (ci) {
    const run = findLine(contents[ci.path], /\b(run|script):.*\b(test|pytest|jest|vitest|go test|cargo test|rspec|phpunit|tox|nox|mvn|gradle)/i) ?? findLine(contents[ci.path], /^name:/)
    steps.push({
      title: `Automatic, every time: ${ci.name}`,
      explanation: 'This automation pipeline runs the tests by itself whenever someone proposes a change, so problems are caught before they reach anyone using the project.',
      file: ci.path,
      snippet: run?.text ?? null,
      moduleId: ci.moduleId || null,
    })
  }
  return {
    id: 'the-tests',
    title: 'How does it check itself?',
    question: 'How does the project make sure it keeps working?',
    emoji: '✅',
    summary: sentence(
      `See how ${count(files.filter((f) => f.kind === 'test').length, 'automatic test')} ${files.filter((f) => f.kind === 'test').length === 1 ? 'keeps' : 'keep'} the project working, starting with ${code(shortName(sample.path))}`,
    ),
    steps,
    source: 'starter',
  }
}

/**
 * Heuristic tours (source: 'starter'):
 *  1. "Where does it all begin?" — from the main entry point, follow imports breadth-first through the most important files (4–8 steps).
 *  2. "How the main parts work together" — walk the module graph from the entry module along the heaviest edges.
 *  3. (if routes exist) "What happens when someone visits the app/API?" — route files → what they call.
 * Plus, when the repo has them, "Where is information kept?" (data models) and "How does it check itself?" (tests).
 * Each step explains in plain English using file summaries, roles and symbols; `snippet` is a real line from the file when available.
 */
export function buildStarterTours(analysis: StarterInput, contents: Record<string, string>): Tour[] {
  const tours: Tour[] = []
  for (const make of [beginTour, partsTour, requestTour, dataTour, testsTour]) {
    try {
      const t = make(analysis, contents ?? {})
      if (t && t.steps.length >= 2) tours.push(t)
    } catch (err) {
      // One odd file shouldn't cost the reader every tour.
      console.warn('[starter] could not build a tour', err)
    }
  }
  for (const t of tours) {
    for (const s of t.steps) {
      if (s.snippet && s.file && !(contents?.[s.file] ?? '').includes(s.snippet)) s.snippet = null
      if (s.moduleId && !analysis.modules.some((m) => m.id === s.moduleId)) s.moduleId = null
    }
  }
  return tours
}
