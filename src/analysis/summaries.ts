import type { AnalyzedFile, CodeSymbol, RepoAnalysis, RouteInfo } from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { LAYER_INFO, ROLE_INFO, VIEW_INFO } from '@/core/labels'
import { formatCompact, formatNumber, formatPercent } from '@/core/format'
import { basename } from '@/core/paths'
import { isPeripheral, zonesOf } from './structure/zones'
import { relianceOf, relianceText } from './graph'
import { article, code, count, escapeMd, escapeMdKeepCode, firstSentence, humanize, identifierWords, listJoin, lowerFirst, pick, readmeIntro, sentence, truncateChars, wordCount } from './structure/text'

const MAX_WORDS = 30

// ─────────────────────────────────────────────────────────────────────────────
// Well-known files
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_FILES: Record<string, string> = {
  'package.json': 'The project’s ID card: its name, the outside packages it relies on, and handy commands to run.',
  'tsconfig.json': 'Settings for TypeScript, the tool that checks the code for mistakes before it runs.',
  'jsconfig.json': 'Settings that help code editors understand how this JavaScript project fits together.',
  '.gitignore': 'Tells Git (the change-tracking tool) which files to leave out — like a “do not pack” list.',
  '.gitattributes': 'Tells Git how to treat certain kinds of files, such as line endings.',
  '.gitmodules': 'Lists other repositories that are plugged into this one.',
  '.editorconfig': 'Keeps formatting, like spaces and line endings, consistent across code editors.',
  '.npmrc': 'Settings for npm, the tool that downloads JavaScript packages.',
  '.nvmrc': 'Says which version of Node.js (the engine that runs JavaScript) the project expects.',
  '.node-version': 'Says which version of Node.js (the engine that runs JavaScript) the project expects.',
  '.python-version': 'Says which version of Python the project expects.',
  '.dockerignore': 'Lists files to leave out when packing the app into a container.',
  dockerfile: 'The recipe for a container — a ready-to-run box holding the app and everything it needs.',
  'docker-compose.yml': 'Starts several containers together — for example the app and its database — with one command.',
  'docker-compose.yaml': 'Starts several containers together — for example the app and its database — with one command.',
  'compose.yml': 'Starts several containers together — for example the app and its database — with one command.',
  'compose.yaml': 'Starts several containers together — for example the app and its database — with one command.',
  makefile: 'A menu of shortcut commands for building, testing and running the project.',
  justfile: 'A menu of shortcut commands for building, testing and running the project.',
  license: 'The legal terms for using, changing and sharing this code.',
  licence: 'The legal terms for using, changing and sharing this code.',
  copying: 'The legal terms for using, changing and sharing this code.',
  codeowners: 'Says who should review changes to each part of the project.',
  'pyproject.toml': 'The Python project’s ID card: its name, the packages it needs and how to build it.',
  'setup.py': 'Instructions for packaging this Python project so other people can install it.',
  'setup.cfg': 'Packaging and tool settings for this Python project.',
  pipfile: 'The list of outside Python packages this project needs.',
  'environment.yml': 'The list of tools and Python packages needed to recreate this project’s setup.',
  'go.mod': 'The Go project’s ID card: its name and the outside packages it uses.',
  'go.sum': 'Fingerprints of every outside package, so downloads can be checked for tampering.',
  'cargo.toml': 'The Rust project’s ID card: its name and the outside packages (crates) it uses.',
  gemfile: 'The list of outside Ruby packages (gems) this project needs.',
  'composer.json': 'The PHP project’s ID card: its name and the outside packages it needs.',
  'pom.xml': 'The Java project’s ID card for Maven: its name, the packages it needs and how to build it.',
  'build.gradle': 'Build instructions for Gradle: how to compile the project and which packages it needs.',
  'build.gradle.kts': 'Build instructions for Gradle: how to compile the project and which packages it needs.',
  'settings.gradle': 'Tells Gradle which parts make up this project.',
  'settings.gradle.kts': 'Tells Gradle which parts make up this project.',
  'pubspec.yaml': 'The Dart/Flutter project’s ID card: its name and the packages it needs.',
  'package.swift': 'The Swift project’s ID card: its name and the packages it needs.',
  'manifest.json': 'Describes the app or extension: its name, icons and what it’s allowed to do.',
  'index.html': 'The web page the browser loads first — the app is placed inside it.',
  'robots.txt': 'Tells search engines which pages they may visit.',
  procfile: 'Tells the hosting service which command starts the app.',
  'vercel.json': 'Settings for Vercel, the hosting service that puts the site online.',
  'netlify.toml': 'Settings for Netlify, the hosting service that puts the site online.',
  'fly.toml': 'Settings for Fly.io, the hosting service that runs the app.',
  'favicon.ico': 'The little icon shown in the browser tab.',
  cname: 'The custom web address this site is published at.',
  'dependabot.yml': 'Tells Dependabot to watch for outdated packages and suggest updates automatically.',
  'conftest.py': 'Shared setup for the Python tests: sample data and helpers they can all use.',
  'manage.py': 'Django’s control panel: commands like “start the server” are run through this file.',
  'wsgi.py': 'Lets a web server start the app and hand it incoming requests.',
  'asgi.py': 'Lets a web server start the app and hand it incoming requests.',
  'requirements.txt': 'The list of outside Python packages this project needs.',
  '.pre-commit-config.yaml': 'Checks that run automatically before each change is saved to the project’s history.',
  'renovate.json': 'Tells Renovate to watch for outdated packages and suggest updates automatically.',
  '.prettierrc': 'Settings for Prettier, a tool that tidies the code’s formatting automatically.',
  '.eslintrc': 'Rules for ESLint, a tool that spots likely mistakes and messy code.',
  '.babelrc': 'Settings for Babel, which translates modern code so older browsers understand it.',
  '.readthedocs.yaml': 'Settings for Read the Docs, the service that publishes the documentation website.',
  '.readthedocs.yml': 'Settings for Read the Docs, the service that publishes the documentation website.',
  '.golangci.yml': 'Rules for the tool that checks the Go code for likely mistakes and messy style.',
  '.goreleaser.yaml': 'Instructions for packaging and publishing each new version automatically.',
}

const KNOWN_PATTERNS: [RegExp, string][] = [
  [/^readme(\.[a-z]+)?$/, ''],
  [/^(changelog|changes|history|news)(\.[a-z]+)?$/, 'A running diary of what changed in each version.'],
  [/^contributing(\.[a-z]+)?$/, 'Guidance for people who want to help improve the project.'],
  [/^code[_-]of[_-]conduct(\.[a-z]+)?$/, 'The community’s ground rules for treating each other kindly.'],
  [/^security(\.[a-z]+)?$/, 'How to report security problems privately.'],
  [/^(authors|contributors|maintainers)(\.[a-z]+)?$/, 'The people who made and look after this project.'],
  [/^(license|licence|copying)([._-].*)?$/, 'The legal terms for using, changing and sharing this code.'],
  [/^vite\.config\./, 'Settings for Vite, the tool that bundles the code and runs a live preview while you work.'],
  [/^webpack(\.[\w-]+)*\.(js|ts|cjs|mjs)$/, 'Settings for webpack, the tool that bundles the code into files a browser can load.'],
  [/^rollup\.config\./, 'Settings for Rollup, the tool that bundles the code into files others can use.'],
  [/^next\.config\./, 'Settings for Next.js, the framework the site is built with.'],
  [/^nuxt\.config\./, 'Settings for Nuxt, the framework the site is built with.'],
  [/^svelte\.config\./, 'Settings for Svelte, the toolkit the app is built with.'],
  [/^astro\.config\./, 'Settings for Astro, the tool that builds the website.'],
  [/^tailwind\.config\./, 'Settings for Tailwind, the styling toolkit: colors, fonts and sizes.'],
  [/^postcss\.config\./, 'Settings for PostCSS, a tool that processes the styling files.'],
  [/^(\.eslintrc|eslint\.config)/, 'Rules for ESLint, a tool that spots likely mistakes and messy code.'],
  [/^(\.prettierrc|prettier\.config)/, 'Settings for Prettier, a tool that tidies the code’s formatting automatically.'],
  [/^(jest|vitest)\.config\./, 'Settings for the tool that runs the automatic tests.'],
  [/^(playwright|cypress)\.config\./, 'Settings for the tool that tests the app in a real browser, like a robot user.'],
  [/^(babel\.config|\.babelrc)/, 'Settings for Babel, which translates modern code so older browsers understand it.'],
  [/^tsconfig\..+\.json$/, 'Extra TypeScript settings for one part of the project.'],
  [/^\.env(\..+)?$|\.env$/, 'Private settings (like passwords and web addresses) the app reads when it starts.'],
  [/^requirements[\w.-]*\.(txt|in)$/, 'A list of outside Python packages this project needs.'],
  [/^(dockerfile|containerfile)[._-]|\.dockerfile$/, 'A recipe for a container — a ready-to-run box holding the app and everything it needs.'],
  [/^(docker-)?compose[._-].*\.ya?ml$/, 'Starts several containers together — for example the app and its database.'],
  [/(-lock\.json|\.lock|-lock\.yaml)$/, 'An exact list of every package version installed, written automatically so everyone gets the same ones.'],
]

function knownSummary(f: AnalyzedFile): string | null {
  const lower = f.name.toLowerCase()
  if (/^readme(\.[a-z]+)?$/.test(lower)) {
    return f.dir ? `A guide to the ${quote(basename(f.dir))} folder: what’s inside and how to use it.` : 'The project’s welcome note: what it is, why it exists and how to use it.'
  }
  if (f.kind === 'test') return null
  const exact = KNOWN_FILES[lower]
  if (exact) return exact
  for (const [re, text] of KNOWN_PATTERNS) if (text && re.test(lower)) return text
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_SUFFIX_WORDS = new Set([
  'controller', 'controllers', 'service', 'services', 'model', 'models', 'route', 'routes', 'router', 'routers', 'handler',
  'handlers', 'repository', 'repo', 'store', 'slice', 'reducer', 'schema', 'schemas', 'dto', 'entity', 'resolver',
  'middleware', 'client', 'api', 'util', 'utils', 'helper', 'helpers', 'types', 'type', 'test', 'tests', 'spec', 'page',
  'screen', 'view', 'views', 'component', 'module', 'config', 'context', 'provider', 'hook', 'index', 'main', 'stories',
  'story', 'constants', 'migration', 'd',
])

/** The example a file belongs to: "examples/route-separation/user.js" → "route separation". */
function exampleName(path: string): string {
  const parts = path.split('/')
  const i = parts.findIndex((p) => /^(examples?|demos?|samples?|playgrounds?|tutorials?|sandbox)$/i.test(p))
  const name = i !== -1 && i < parts.length - 2 ? parts[i + 1] : ''
  return name ? humanize(name) : ''
}

/** The "subject" of a file from its name: "user_controller.rb" → "user", "useCart.ts" → "cart". */
function subjectOf(f: AnalyzedFile): string {
  let words = identifierWords(f.name.replace(/\.[^.]+$/, ''))
  if (words[0] === 'use' && words.length > 1) words = words.slice(1)
  if (words[0] === 'test' && words.length > 1) words = words.slice(1)
  const kept = words.filter((w) => !ROLE_SUFFIX_WORDS.has(w))
  const minimal = words.filter((w) => !/^(test|tests|spec|specs|d|stories|story)$/.test(w))
  const out = (kept.length > 0 ? kept : minimal.length > 0 ? minimal : words).join(' ')
  if (out && !/^(index|main|mod|init|__init__)$/.test(out)) return out
  const folder = basename(f.dir)
  return folder ? humanize(folder) : ''
}

/** Light clean-up for names shown inside a sentence (no code ticks, tags or line breaks). */
function clean(s: string): string {
  return s
    .replace(/<(?:[\w]+:)?([\w.-]+)>/g, '{$1}') // Flask-style placeholders: /users/<int:id> → /users/{id}
    .replace(/[`<>\r\n]/g, '')
    .trim()
}

function quote(s: string): string {
  return `“${clean(s)}”`
}

const NAMED_KINDS = new Set<CodeSymbol['kind']>(['class', 'component', 'function', 'hook', 'interface', 'type', 'enum', 'struct', 'trait', 'constant', 'module', 'variable'])

function topSymbols(f: AnalyzedFile): CodeSymbol[] {
  const top = f.symbols.filter((s) => NAMED_KINDS.has(s.kind) && s.name && s.name.length <= 60 && !/^__\w+__$/.test(s.name))
  const exported = top.filter((s) => s.exported)
  return exported.length > 0 ? exported : top
}

/** Only the names a file shares with the rest of the code (its private helpers say little about it). */
function sharedSymbols(f: AnalyzedFile): CodeSymbol[] {
  return topSymbols(f).filter((s) => s.exported)
}

/** The symbol a file is "about": the one named like the file, else the first exported class/component/function. */
function mainSymbol(f: AnalyzedFile, kinds?: CodeSymbol['kind'][]): CodeSymbol | null {
  const pool = topSymbols(f).filter((s) => !kinds || kinds.includes(s.kind))
  if (pool.length === 0) return null
  const stem = f.name.replace(/\..*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const named = pool.find((s) => s.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === stem)
  if (named) return named
  const rank: Partial<Record<CodeSymbol['kind'], number>> = { component: 0, class: 1, struct: 1, hook: 2, function: 3, interface: 4, type: 4, trait: 4, enum: 5 }
  return [...pool].sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.line - b.line)[0]
}

/** Names of error types ("NoAppException", "ParseSizeError"): never a good example of what a file does. */
const ERROR_NAME = /(?:Error|Exception|Err|Warning)$/

/** A function that looks like a terminal command: run_command, shell_command, cmd_init, main … */
function commandSymbol(f: AnalyzedFile): CodeSymbol | null {
  const fns = topSymbols(f).filter((s) => s.kind === 'function' && !s.name.startsWith('_') && !ERROR_NAME.test(s.name))
  return fns.find((s) => /command|^cmd[A-Z_]|[a-z_]cmd$|^cli[A-Z_]?|^main$|^run[A-Z_]?$/i.test(s.name)) ?? null
}

function namesList(symbols: CodeSymbol[], max = 3): string {
  const names = [...new Set(symbols.map((s) => s.name))]
  const shown = names.slice(0, max).map(code)
  return names.length > max ? `${shown.join(', ')} and ${names.length - max} more` : listJoin(shown)
}

function usedBy(f: AnalyzedFile): string {
  const n = f.importedBy.length
  return n > 0 ? `, used by ${count(n, 'other file')}` : ''
}

function routesPhrase(routes: RouteInfo[]): string {
  const byPath = new Map<string, Set<string>>()
  for (const r of routes) {
    if (!r.path) continue
    const set = byPath.get(r.path) ?? new Set<string>()
    if (r.method && r.method !== 'ANY') set.add(r.method.toUpperCase())
    byPath.set(r.path, set)
  }
  const entries = [...byPath.entries()]
  const fmt = ([p, methods]: [string, Set<string>]) => `${clean(truncateChars(p, 40))}${methods.size > 0 ? ` (${[...methods].slice(0, 4).join(', ')})` : ''}`
  if (entries.length === 0) return ''
  if (entries.length <= 2) return `Answers web requests to ${listJoin(entries.map(fmt))}.`
  return `Answers web requests to ${entries.length} addresses, such as ${listJoin(entries.slice(0, 2).map(fmt))}.`
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian',
  ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ar: 'Arabic', he: 'Hebrew', hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
  sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', nb: 'Norwegian', cs: 'Czech', uk: 'Ukrainian',
  el: 'Greek', hu: 'Hungarian', ro: 'Romanian', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', fa: 'Persian',
  bn: 'Bengali', ca: 'Catalan', ms: 'Malay', sk: 'Slovak', bg: 'Bulgarian', hr: 'Croatian', sr: 'Serbian', lt: 'Lithuanian',
}

function localeName(f: AnalyzedFile): string | null {
  const candidates = [f.name.replace(/\..*$/, ''), basename(f.dir), basename(f.dir.replace(/\/LC_MESSAGES$/i, ''))]
  for (const c of candidates) {
    const m = /^([a-z]{2,3})(?:[-_]([a-z]{2,4}))?$/i.exec(c)
    if (m && LANGUAGE_NAMES[m[1].toLowerCase()]) return LANGUAGE_NAMES[m[1].toLowerCase()]
  }
  return null
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'psd'])
const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot', 'ttc'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'])
const ARCHIVE_EXT = new Set(['zip', 'gz', 'tgz', 'tar', 'bz2', 'xz', '7z', 'rar', 'jar'])

function assetSummary(f: AnalyzedFile): string {
  const what = quote(humanize(f.name) || f.name)
  if (f.ext === 'ico' || /favicon/i.test(f.name)) return 'A little icon, like the one shown in the browser tab.'
  if (IMAGE_EXT.has(f.ext)) return `An image used by the project (${what}).`
  if (FONT_EXT.has(f.ext)) return 'A font file — the lettering style used in the app.'
  if (AUDIO_EXT.has(f.ext)) return `A sound file used by the project (${what}).`
  if (VIDEO_EXT.has(f.ext)) return `A video file used by the project (${what}).`
  if (f.ext === 'pdf') return `A PDF document (${what}).`
  if (ARCHIVE_EXT.has(f.ext)) return 'A compressed bundle of files.'
  return 'A media or binary file used by the project.'
}

function dataSummary(f: AnalyzedFile): string {
  const what = quote(humanize(f.name) || f.name)
  switch (f.ext) {
    case 'csv':
    case 'tsv':
    case 'xlsx':
    case 'xls':
      return `A table of data — rows and columns — called ${what}.`
    case 'json':
    case 'jsonl':
    case 'ndjson':
      return `Stored information in JSON, a common text format for data (${what}).`
    case 'yaml':
    case 'yml':
      return `Stored information or settings in YAML, a tidy text format (${what}).`
    case 'xml':
      return `Stored information in XML, a structured text format (${what}).`
    case 'sql':
      return `Sample information to load into the database (${what}).`
    default:
      return `A data file the project reads (${what}).`
  }
}

/** Ensure the sentence is short enough and ends properly. */
function finish(primary: string, extras: string[] = []): string {
  let out = sentence(primary)
  for (const e of extras) {
    if (!e) continue
    const next = `${out} ${sentence(e)}`
    if (wordCount(next) <= MAX_WORDS) out = next
  }
  if (wordCount(out) > MAX_WORDS) {
    const words = out.split(/\s+/)
    out = `${words.slice(0, MAX_WORDS).join(' ').replace(/[,;:—–-]+$/, '')}…`
  }
  return out
}

type StartFlavor = 'ui' | 'server' | 'cli' | 'desktop' | 'bot' | 'door' | 'generic'

function startFlavor(f: AnalyzedFile): StartFlavor {
  const r = (f.entryReason ?? '').toLowerCase()
  if (/front door|named after|package —|library/.test(r) || f.name === '__init__.py' || f.name === 'lib.rs') return 'door'
  if (/screen|web page the browser/.test(r)) return 'ui'
  if (/server|web requests|web servers/.test(r)) return 'server'
  if (/command|terminal/.test(r)) return 'cli'
  if (/window/.test(r)) return 'desktop'
  if (/bot/.test(r)) return 'bot'
  if (f.layer === 'ui') return 'ui'
  if (f.layer === 'api' || f.routes.length > 0) return 'server'
  if (/^index\./.test(f.name)) return 'door'
  return 'generic'
}

const START_SENTENCES: Record<StartFlavor, string> = {
  ui: 'The starting point of the app — it sets things up and launches the first screen.',
  server: 'The starting point of the server — it sets things up and starts listening for web requests.',
  cli: 'The starting point of the command-line tool — it reads what you typed and runs the right command.',
  desktop: 'The starting point of the desktop app — it sets things up and opens the main window.',
  bot: 'The starting point of the bot — it connects to the chat service and waits for messages.',
  door: 'The front door of the code: it gathers what the project offers so others can use it from one place.',
  generic: 'The starting point of the program — it sets things up and gets everything running.',
}

/** Next.js / Nuxt / SvelteKit-style address for a page file ("app/blog/[slug]/page.tsx" → "/blog/[slug]"). */
function pageAddress(path: string): string | null {
  const parts = path.split('/')
  const i = Math.max(parts.lastIndexOf('app'), parts.lastIndexOf('pages'), parts.lastIndexOf('routes'))
  if (i === -1) return null
  const rest = parts.slice(i + 1)
  const file = rest.pop() ?? ''
  const stem = file.replace(/\.[^.]+$/, '')
  const segs = rest.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
  if (!/^(\+?page|index)$/i.test(stem)) segs.push(stem.replace(/^\+/, ''))
  const addr = `/${segs.join('/')}`
  return addr.length <= 50 ? addr : null
}

// ─────────────────────────────────────────────────────────────────────────────
// summarizeFile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One plain-English sentence describing a file from its role, symbols, routes and connections, e.g.
 * "A UI building block called `LoginForm`. 4 other files use it." or
 * "Answers web requests to /api/users (GET, POST)." Avoid jargon; never more than ~30 words.
 */
export function summarizeFile(file: AnalyzedFile): string {
  try {
    return summarize(file)
  } catch {
    return sentence(ROLE_INFO[file.role]?.description ?? 'A file in the project')
  }
}

function summarize(f: AnalyzedFile): string {
  if (f.kind === 'generated') {
    if (f.role === 'config') return finish('An exact list of every package version installed, written automatically so everyone gets the same ones.')
    return finish('Made automatically by a tool, so people don’t edit it by hand.')
  }
  const known = knownSummary(f)
  if (known) return finish(known)
  if (f.layer === 'other' && f.role === 'library') return finish('A copy of someone else’s code, kept here so the project can use it.')

  const subject = subjectOf(f)
  const subj = subject ? quote(subject) : ''
  const main = mainSymbol(f)
  const imports = f.imports.length
  const pulls = f.importedBy.length === 0 && imports >= 3 ? `It brings together ${count(imports, 'other file')}` : ''

  // Code we never downloaded: describe it by its name and folder only.
  const codeLike = f.kind === 'source' || f.kind === 'test' || f.kind === 'script'
  if (!f.fetched && codeLike && f.role !== 'entry') {
    const label = lowerFirst(ROLE_INFO[f.role].label)
    const noun = f.role === 'library' ? `part of the ${LAYER_INFO[f.layer].label.toLowerCase()} code` : `${article(label)} ${label}`
    return finish(`Probably ${noun}${subj && f.role !== 'library' ? ` for ${subj}` : ''}, judging by its name and folder.`)
  }

  switch (f.role) {
    case 'entry': {
      const flavor = startFlavor(f)
      const extra = f.routes.length > 0 ? routesPhrase(f.routes).replace(/^Answers/, 'It also answers') : pulls
      return finish(START_SENTENCES[flavor], [extra])
    }
    case 'page': {
      const name = mainSymbol(f, ['component', 'function', 'class'])
      const addr = pageAddress(f.path)
      if (addr && /(^|\/)(app|pages|routes)\//.test(f.path)) return finish(`The page people see at the web address ${clean(addr)}${name ? ` (${code(name.name)})` : ''}.`)
      if (name) return finish(pick(f.path, [`The ${code(name.name)} screen — one of the pages people can visit in the app.`, `A whole screen called ${code(name.name)} that people can open in the app.`]))
      return finish(`A screen people can visit${subj ? `: ${subj}` : ''}.`)
    }
    case 'component': {
      const comps = topSymbols(f).filter((s) => s.kind === 'component' || s.kind === 'class' || s.kind === 'function')
      const name = mainSymbol(f, ['component', 'class', 'function'])
      if (name && /^app$/i.test(name.name)) return finish(`The top-level screen piece — everything you see in the app is arranged inside ${code(name.name)}.`)
      if (comps.filter((s) => s.kind === 'component').length >= 3) return finish(`Holds ${comps.filter((s) => s.kind === 'component').length} UI building blocks, including ${namesList(comps.filter((s) => s.kind === 'component'), 2)}${usedBy(f)}.`)
      if (name) return finish(pick(f.path, [`A UI building block called ${code(name.name)}${usedBy(f)}.`, `${code(name.name)}: a reusable piece of the screen${usedBy(f)}.`]))
      return finish(`A UI building block${subj ? ` for ${subj}` : ''}${usedBy(f)}.`)
    }
    case 'layout': {
      const name = mainSymbol(f, ['component', 'function', 'class'])
      return finish(`The frame around the pages${name ? ` — ${code(name.name)} places` : ', placing'} the shared header, menus and content area.`)
    }
    case 'hook': {
      const hooks = topSymbols(f).filter((s) => s.kind === 'hook')
      if (hooks.length >= 2) return finish(`Reusable behaviors (${namesList(hooks, 2)}) that screens can plug in${usedBy(f)}.`)
      const name = hooks[0] ?? main
      return finish(`Reusable behavior${name ? ` called ${code(name.name)}` : ''} that screens can plug in${usedBy(f)}.`)
    }
    case 'state':
      return finish(`Keeps track of the app’s ${subject ? `${subject} ` : ''}information while it runs${main ? ` (${code(main.name)})` : ''}${usedBy(f)}.`)
    case 'route':
    case 'controller': {
      const routes = routesPhrase(f.routes)
      if (routes) return finish(routes, [f.role === 'controller' && main ? `${code(main.name)} works out each response` : ''])
      if (f.role === 'route') return finish(`Decides what happens when someone visits the ${subj ? `${subj} ` : ''}web addresses.`)
      return finish(main ? `${code(main.name)} handles incoming requests${subject ? ` about ${subject}` : ''} and works out what to send back.` : `Handles incoming requests${subject ? ` about ${subject}` : ''} and works out what to send back.`)
    }
    case 'middleware':
      return finish(`A checkpoint that requests pass through${main ? ` (${code(main.name)})` : ''}, like a security guard checking tickets at the door.`)
    case 'service': {
      const doer = /(er|or)$/.test(subject) && !/(order|user|folder|header|footer|filter|member|customer|letter|paper|layer|player|owner|partner|computer|server)$/.test(subject)
      const task = !subject ? 'one specific job' : doer ? `the ${subject}` : subject
      return finish(`${doer ? 'Runs' : 'Handles'} ${task} for the rest of the app${main ? `, through ${code(main.name)}` : ''}${usedBy(f)}.`)
    }
    case 'client':
      return finish(`Talks to outside servers over the internet${main ? ` (${code(main.name)})` : subj ? ` for ${subj}` : ''}${usedBy(f)}.`)
    case 'model': {
      const shapes = topSymbols(f).filter((s) => ['class', 'struct', 'interface', 'type', 'variable', 'constant'].includes(s.kind))
      if (shapes.length === 1) {
        const n = shapes[0].name
        return finish(`Defines the ${code(n)} data model — what information the app keeps about each ${humanize(n) || 'item'}.`)
      }
      if (shapes.length > 1) return finish(`Defines the data models ${namesList(shapes, 3)} — what information the app keeps.`)
      return finish(`Describes the ${subject ? `${subject} ` : ''}information the app stores.`)
    }
    case 'schema': {
      if (['graphql', 'gql', 'graphqls', 'proto', 'thrift', 'avsc'].includes(f.ext) || /^(openapi|swagger)/i.test(f.name)) {
        return finish('Describes the requests and data the system accepts — a contract that both sides agree to follow.')
      }
      const shapes = topSymbols(f)
      if (shapes.length > 0) return finish(`Sets the rules for what valid information looks like, for ${namesList(shapes, 2)}.`)
      return finish(`Sets the rules for what valid ${subject ? `${subject} ` : ''}information looks like.`)
    }
    case 'migration': {
      const step = humanize(f.name.replace(/\.[^.]+$/, '').replace(/^v?\d[\d_.-]*[_-]?/, ''))
      return finish(step ? `A step in the database’s history: ${quote(step)}.` : 'A recorded change to the database structure, applied in order with the others.')
    }
    case 'repository': {
      const genericSubject = /^(db|database|data|storage|store|repo|repository|persistence|queries)$/.test(subject)
      const thing = main && /^[A-Z]/.test(main.name) ? code(main.name.replace(/(Repository|Repo|Dao|DAO|Store)$/, '') || main.name) : genericSubject ? '' : subject
      return finish(`Reads and saves ${thing ? `${thing} ` : ''}information in storage${usedBy(f)}.`)
    }
    case 'util': {
      const fns = topSymbols(f)
      if (f.kind === 'test') return finish(`Shared helpers for the automatic tests${fns.length > 0 ? `, such as ${namesList(fns, 2)}` : ''}${usedBy(f)}.`)
      if (fns.length >= 2) return finish(`Handy helpers — ${namesList(fns, 2)}${usedBy(f)}.`)
      if (fns.length === 1) return finish(`A handy helper called ${code(fns[0].name)}${usedBy(f)}.`)
      return finish(`A grab bag of handy helpers${usedBy(f)}.`)
    }
    case 'types': {
      const shapes = topSymbols(f).filter((s) => s.kind !== 'function')
      return finish(`Describes the shape of data${shapes.length ? `, like ${namesList(shapes, 2)},` : ''} so mistakes are caught early.`)
    }
    case 'constants': {
      const vals = topSymbols(f)
      return finish(`Fixed values used across the code${vals.length ? `, such as ${namesList(vals, 2)}` : ''}.`)
    }
    case 'config': {
      if (f.kind === 'source' || f.kind === 'config') {
        const tool = /^(.+?)[.-]config\./i.exec(f.name)?.[1]
        if (tool && !/^(app|site)$/i.test(tool)) return finish(`Settings for ${code(tool)} — they tell that tool how to behave.`)
        if (/\.module\.(ts|js)$|Module\.(kt|java|ts)$/.test(f.name)) return finish(`Wires together the ${subject ? `${subject} ` : ''}part of the app — it lists which pieces belong to it.`)
        if (f.name === 'admin.py') return finish('Sets up the built-in admin screens where staff can view and edit stored information.')
        if (f.layer === 'docs') return finish('Settings for building the documentation website.')
        const vals = topSymbols(f)
        if (f.kind === 'source') return finish(`The app’s settings in one place${vals.length ? `, such as ${namesList(vals, 2)}` : ''}${usedBy(f)}.`)
      }
      if (f.dir.startsWith('.vscode') || f.dir.startsWith('.idea')) return finish('Settings for the code editor the authors use.')
      if (/ISSUE_TEMPLATE/i.test(f.dir)) return finish('Settings for the forms people fill in when they report a problem on GitHub.')
      const plainSubject = subj && !/^(config|configuration|settings|conf|options|index|default)$/i.test(subject)
      return finish(`Settings${plainSubject ? ` for ${subj}` : ''} that tell a tool or the app how to behave.`)
    }
    case 'test': {
      if (f.kind === 'test' && /bench/i.test(f.path)) return finish(`Speed tests${subj ? ` for ${subj}` : ''} that measure how fast the code runs.`)
      const target = f.imports.find((p) => subject && basename(p).toLowerCase().startsWith(subject.split(' ')[0]))
      if (target) return finish(`Automatic checks that make sure ${code(basename(target))} keeps working after changes.`)
      return finish(`Automatic checks${subj ? ` for ${subj}` : ''} — they make sure it keeps working after changes.`)
    }
    case 'fixture':
      return finish(`Sample data${subj ? ` (${subj})` : ''} used by the automatic tests.`)
    case 'style': {
      if (/^(index|global|globals|main|app|styles?|base|reset|theme|variables|tokens)\.[a-z.]+$/i.test(f.name)) return finish('Styling rules — colors, fonts and spacing — used across the whole app.')
      return finish(`Styling rules — colors, fonts and spacing${subj ? ` — for ${subj}` : ''}.`)
    }
    case 'docs': {
      if (/\.(stories|story)\./.test(f.name)) {
        return finish(`A showcase of the ${code(f.name.replace(/\.(stories|story)\..*$/, ''))} building block, so it can be viewed and checked on its own.`)
      }
      if (/ISSUE_TEMPLATE/i.test(f.dir)) return finish(`A ready-made form people fill in to open ${article(humanize(f.name.replace(/\.[^.]+$/, '')) || 'issue')} ${quote(humanize(f.name.replace(/\.[^.]+$/, '')) || 'issue')} on GitHub.`)
      if (/^pull_request_template\./i.test(f.name)) return finish('A checklist people fill in when they propose a change on GitHub.')
      const title = humanize(f.name.replace(/\.[^.]+$/, ''))
      if (/^(index|readme|intro|introduction|overview)$/.test(title) && f.dir) return finish(`The first page of the ${quote(humanize(basename(f.dir)))} guides.`)
      return finish(title ? `A written guide about ${quote(title)}.` : 'A written guide for people.')
    }
    case 'script': {
      if (f.ext === 'ipynb') return finish(`A notebook — a mix of notes, code and charts — about ${subj || 'the data'}.`)
      return finish(`A small program that automates a chore${subj ? `: ${subj}` : ''}.`)
    }
    case 'build':
      if (f.layer === 'docs' || /^docs?\//.test(f.path)) return finish('Shortcut commands for building the documentation.')
      return finish(`Build instructions${subj ? ` (${subj})` : ''} — how to turn the code into something that runs.`)
    case 'ci':
      if (/\.github\/workflows\//.test(f.path)) return finish(`An automation pipeline that runs the ${subj ? `${subj} ` : ''}steps on GitHub whenever the code changes.`)
      return finish('Settings for an automation service that checks or ships every change.')
    case 'container':
      return finish('Instructions for running the app inside containers — ready-to-run boxes with everything it needs.')
    case 'asset':
      return finish(assetSummary(f))
    case 'i18n': {
      const lang = localeName(f)
      return finish(`Translations: the app’s text in ${lang ?? 'another language'}.`)
    }
    case 'cli': {
      // Only a command-like function makes a good example ("like `run_command`"); an error class such as NoAppException doesn't.
      const command = commandSymbol(f)
      if (command) return finish(`Handles commands typed into the terminal, like ${code(command.name)}${usedBy(f)}.`)
      const shown = main && !ERROR_NAME.test(main.name) ? main : null
      return finish(`Handles commands typed into the terminal${shown ? `; it defines ${code(shown.name)}` : ''}${usedBy(f)}.`)
    }
    case 'library':
      return finish(libraryCodeSummary(f, main, subject), [pulls])
    case 'other':
    default:
      if (f.kind === 'data') return finish(dataSummary(f))
      if (f.kind === 'asset') return finish(assetSummary(f))
      return finish(f.language ? `${article(f.language)} ${escapeMd(f.language)} file used by the project.` : 'A supporting file in the project.')
  }
}

function libraryCodeSummary(f: AnalyzedFile, mainSymbol: CodeSymbol | null, subject: string): string {
  let main = mainSymbol
  const folder = basename(f.dir)
  const zones = zonesOf(f.path)
  if (zones.includes('example')) {
    const example = exampleName(f.path)
    return `Part of the ${example ? `${quote(example)} ` : ''}example${main ? `: it defines ${code(main.name)}` : ''}${usedBy(f)}.`
  }
  if (zones.includes('docs')) return `Code used by the documentation${main ? `, defining ${code(main.name)}` : ''}${usedBy(f)}.`
  if (f.name === '__init__.py') return `Marks ${folder ? quote(folder) : 'this folder'} as a Python package and decides what it shares with the rest of the code.`
  if (/^(index|mod)\.[a-z]+$/.test(f.name) && f.symbols.length <= 1 && f.imports.length >= 1) {
    return `The front door of the ${folder ? quote(folder) : 'top'} folder — it gathers its pieces so others can use them from one place.`
  }
  const syms = sharedSymbols(f)
  const n = f.importedBy.length
  main = main && main.exported ? main : (syms[0] ?? null)
  if (main && n >= 5) {
    return pick(f.path, [
      `A central file: ${code(main.name)} lives here, and ${formatNumber(n)} other files rely on it.`,
      `Home of ${code(main.name)}, which ${formatNumber(n)} other files rely on.`,
      `Defines ${code(main.name)}${syms.length > 1 ? ` and ${count(syms.length - 1, 'other piece')}` : ''} — ${formatNumber(n)} other files use this code.`,
    ])
  }
  if (syms.length >= 3) return `Defines ${namesList(syms, 2)}${usedBy(f)}.`
  if (main) return pick(f.path, [`Home of ${code(main.name)}${usedBy(f)}.`, `Defines ${code(main.name)}${usedBy(f)}.`])
  const area = LAYER_INFO[f.layer].label.toLowerCase()
  return `Part of the ${area}${subject ? ` — the ${quote(subject)} code` : ''}${usedBy(f)}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// writeOverview
// ─────────────────────────────────────────────────────────────────────────────

type OverviewInput = Omit<RepoAnalysis, 'overview' | 'learningPath' | 'starterConcepts' | 'starterTours'>

export interface OverviewOptions {
  /**
   * What to call the project when the repository's name says little ("cli" for HTTPie): usually the package name.
   * Defaults to the repository's name.
   */
  name?: string
}

/** Folder-like repository names that say what the repo holds rather than what the project is called. */
const GENERIC_REPO_NAMES = new Set([
  'cli', 'core', 'app', 'api', 'server', 'client', 'web', 'lib', 'sdk', 'main', 'src', 'code', 'project', 'backend', 'frontend',
  'website', 'site', 'docs', 'mobile', 'desktop', 'engine', 'tool', 'tools', 'plugin', 'extension', 'source', 'monorepo',
])

/**
 * The name to use for the project in prose: the repository's name, or the package name it declares when the
 * repository is called something generic ("httpie" for httpie/cli). Scoped npm names lose their scope.
 */
export function projectDisplayName(repo: string, declaredNames: readonly string[] = []): string {
  const r = (repo ?? '').trim()
  if (r && !GENERIC_REPO_NAMES.has(r.toLowerCase())) return r
  const declared = declaredNames
    .map((n) => (typeof n === 'string' ? n.trim().replace(/^@[^/]+\//, '') : ''))
    .find((n) => n.length >= 2 && n.length <= 40 && /^[\w.-]+$/.test(n) && !GENERIC_REPO_NAMES.has(n.toLowerCase()))
  return declared ?? r
}

/** Whether most meaningful words of a module's role already appear in its name or description ("examples — examples:"). */
function roleIsRedundant(role: string, name: string, description: string): boolean {
  const stem = (w: string) => w.toLowerCase().replace(/[’']s$/, '').replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '')
  const words = (t: string) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem)
  const filler = new Set(['and', 'the', 'of', 'a', 'an', 'for', 'to', 'in', 'file', 'part', 'code'])
  const roleWords = words(role).filter((w) => !filler.has(w))
  if (roleWords.length === 0) return true
  const seen = new Set([...words(name), ...words(description)])
  return roleWords.filter((w) => seen.has(w)).length * 2 >= roleWords.length
}

/**
 * Heuristic plain-English overview of the whole project in Markdown (no AI). Sections:
 * "## What is this?", "## What it’s built with", "## How it’s organized", "## Where it starts", "## Good to know".
 * Plain text only: no emoji (module emoji stay in the data, never in the prose), no exclamation marks.
 * Uses projectKind, techStack (with descriptions), modules (top ~6 with roles), entry points, stats, README first paragraph.
 * Friendly, concrete, 200–400 words.
 */
export function writeOverview(analysis: OverviewInput, options: OverviewOptions = {}): string {
  const { meta, projectKind: kind, stats } = analysis
  const name = escapeMd(options.name?.trim() || meta.repo || meta.fullName || 'This project')
  const out: string[] = []

  // What is this?
  out.push('## What is this?')
  const label = kind.id === 'unknown' ? 'software project' : lowerFirst(kind.label)
  const hedge = kind.id !== 'unknown' && kind.confidence < 0.5 ? ' (that’s our best guess from its files)' : ''
  out.push(`**${name}** is ${article(label)} **${escapeMd(label)}**${hedge}: ${lowerFirst(kind.description).replace(/\.$/, '')}.`)
  const intro = readmeIntro(analysis.readme?.content)
  const desc = meta.description?.trim()
  if (intro) out.push(`In the authors’ own words: “${escapeMd(intro)}”`)
  else if (desc) out.push(`Its GitHub description says: “${escapeMd(truncateChars(desc, 240))}”`)
  if (kind.id !== 'unknown' && kind.reasons.length > 0) {
    out.push(`Why we think so:\n${kind.reasons.slice(0, 3).map((r) => `- ${escapeMd(r)}`).join('\n')}`)
  }

  // What it’s built with
  out.push('## What it’s built with')
  const langs = analysis.languages.filter((l) => l.percent >= 3).slice(0, 4)
  if (langs.length > 0) {
    const [first, ...rest] = langs
    const restText = rest.length > 0 ? `, with some ${listJoin(rest.map((l) => `**${escapeMd(l.name)}** (${formatPercent(l.percent)})`))}` : ''
    out.push(`It’s written mostly in **${escapeMd(first.name)}** (${formatPercent(first.percent)} of the code)${restText}.`)
  }
  const techs = analysis.techStack.filter((t) => t.category !== 'language' && t.importance !== 'tooling').slice(0, 5)
  const tooling = analysis.techStack.filter((t) => t.category !== 'language' && t.importance === 'tooling')
  if (techs.length > 0) {
    out.push(`The main tools it relies on:\n${techs.map((t) => `- **${escapeMd(t.name)}** — ${escapeMd(firstSentence(t.description || 'a tool the project uses'))}`).join('\n')}`)
  } else if (langs.length > 0) {
    const small = corePackages(analysis)
    if (small.length >= 3) {
      out.push(
        `It doesn’t build on one big, well-known framework. Instead it leans on many small ready-made packages written by others, such as ${listJoin(small.slice(0, 3).map(code))}.`,
      )
    } else {
      out.push('We didn’t spot any well-known frameworks — it’s mostly the authors’ own code.')
    }
  }
  if (tooling.length > 0) out.push(`Behind the scenes it also uses helper tools like ${listJoin(tooling.slice(0, 4).map((t) => escapeMd(t.name)))}.`)
  if (langs.length === 0 && techs.length === 0) out.push('We didn’t find program code we recognise — it may be mostly documents, settings or data.')

  // How it’s organized
  out.push('## How it’s organized')
  const mods = analysis.modules.filter((m) => m.id !== ROOT_MODULE_ID || m.role === 'Main code (top level)')
  const top = mods.slice(0, 6)
  if (top.length > 0) {
    out.push(
      `The project is split into ${count(analysis.modules.length, 'main part')}. ${top.length < analysis.modules.length ? 'The most important ones:' : 'Here they are:'}\n` +
        top
          .map((m) => {
            const what = firstSentence(m.description)
            // "examples — examples: …" and "core — core logic: the central rules …" say the same thing twice.
            const role = roleIsRedundant(m.role, m.name, what) ? '' : `${escapeMd(lowerFirst(m.role))}: `
            return `- **${escapeMd(m.name)}** — ${role}${escapeMdKeepCode(lowerFirst(what))}`
          })
          .join('\n'),
    )
    out.push(`Open **${VIEW_INFO.map.label}** to see which parts rely on which.`)
  } else {
    out.push('Everything sits together in one place, so there’s no bigger structure to map.')
  }

  // Where it starts
  out.push('## Where it starts')
  const entries = analysis.entryPoints.slice(0, 3)
  if (entries.length > 0) {
    out.push(entries.map((p) => `- ${code(p)} — ${escapeMdKeepCode(sentence(analysis.files[p]?.entryReason ?? 'A likely starting point.'))}`).join('\n'))
    if (analysis.entryPoints.length > 3) out.push(`There are ${analysis.entryPoints.length - 3} more possible starting points — see **${VIEW_INFO.explore.label}**.`)
  } else {
    out.push('There’s no single obvious starting point. That’s normal for libraries and collections: other projects use their pieces directly.')
  }

  // Good to know
  out.push('## Good to know')
  const facts: string[] = []
  if (stats.totalFiles > 0) {
    const read = stats.analyzedFiles < stats.totalFiles ? `; we read ${formatNumber(stats.analyzedFiles)} of them` : ''
    facts.push(`It has ${count(stats.totalFiles, 'file')}${read} (about ${formatCompact(stats.totalLines)} lines).`)
  }
  facts.push(
    stats.testFiles > 0
      ? `${count(stats.testFiles, 'test file')} automatically check${stats.testFiles === 1 ? 's' : ''} that the code keeps working — a sign of care.`
      : 'We didn’t spot any automated tests.',
  )
  const hub = analysis.hubs[0]
  if (hub && analysis.files[hub]) {
    // The same count the learning path and the file cards show.
    const reliance = relianceOf(analysis.files[hub], analysis.files)
    if (reliance.total > 0) facts.push(`The most relied-on file is ${code(hub)}, used by ${relianceText(reliance)}.`)
  }
  if (stats.externalPackages > 0) facts.push(`It uses ${count(stats.externalPackages, 'outside package')} — ready-made code written by others.`)
  if (meta.license) facts.push(`It’s shared under the ${escapeMd(meta.license)} license.`)
  if (meta.stars >= 100) facts.push(`About ${formatCompact(meta.stars)} people have starred it on GitHub.`)
  if (meta.archived) facts.push('It’s archived: the authors no longer update it.')
  out.push(facts.map((f) => `- ${f}`).join('\n'))

  return out.join('\n\n')
}

/** Outside packages the project's own code imports (not its tests or examples), most used first. */
function corePackages(analysis: Pick<OverviewInput, 'files'>): string[] {
  const by = new Map<string, number>()
  for (const f of Object.values(analysis.files)) {
    if (f.kind === 'test' || f.layer === 'test' || isPeripheral(f.path)) continue
    for (const p of f.externalImports) by.set(p, (by.get(p) ?? 0) + 1)
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p)
}
