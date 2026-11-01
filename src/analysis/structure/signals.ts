/**
 * Light, regex-based content signals shared by classification, entry-point detection, project-kind scoring and
 * tours. Every function is cheap (a handful of regex scans) and safe on any input.
 */
import type { Family } from './family'
import { stripComments } from '../strip'

/** JSX markup such as `</div>`, `<Button />` or `return (<div …`. */
const JSX_RE = /<\/[A-Za-z][\w.:-]*\s*>|<[A-Z][\w.]*(?:\s[^<>]*?)?\/>|\breturn\s*\(\s*<[A-Za-z>]|=>\s*\(?\s*<[A-Za-z][\w.]*[\s>]/
const REACTISH_IMPORT = /from\s+['"](?:react|preact|solid-js|react-native)(?:\/[\w-]+)?['"]|require\(\s*['"]react['"]\s*\)|\bReact\.createElement\b/
const REACTISH_TECH = ['react', 'preact', 'solid', 'solidjs', 'solid-js', 'react-native', 'next', 'nextjs', 'remix', 'gatsby', 'expo']

/** Whether a JavaScript-family file contains JSX markup (i.e. it draws part of a screen). */
export function hasJsx(content: string, ext: string, techIds?: Set<string>): boolean {
  if (!content) return false
  if (ext === 'tsx' || ext === 'jsx') return JSX_RE.test(content)
  if (ext === 'js' || ext === 'mjs') {
    if (!JSX_RE.test(content)) return false
    if (REACTISH_IMPORT.test(content)) return true
    return techIds ? REACTISH_TECH.some((t) => techIds.has(t)) : false
  }
  return false
}

const ORM_PATTERNS: RegExp[] = [
  /\bmodels\.Model\b/, // Django
  /\bclass\s+\w+\s*\(\s*(?:db\.)?Model\s*\)\s*:/, // Flask-SQLAlchemy, peewee
  /\bclass\s+\w+\s*\(\s*(?:Base|DeclarativeBase|SQLModel)\b[^)]*\)\s*:/, // SQLAlchemy / SQLModel
  /@Entity\b/, // JPA, TypeORM
  /@Table\s*\(/,
  /\bmongoose\.(?:Schema|model)\b|\bnew\s+Schema\s*\(/, // Mongoose
  /^\s*model\s+[A-Z]\w*\s*\{/m, // Prisma
  /\b(?:ActiveRecord::Base|ApplicationRecord)\b/, // Rails
  /\bextends\s+Model\b/, // Laravel Eloquent, Sequelize
  /\bsequelize\.define\s*\(|\bDataTypes\.[A-Z]+\b/, // Sequelize
  /\bgorm\.Model\b/, // GORM
  /#\[derive\([^)]*\b(?:Queryable|Insertable|FromRow|DeriveEntityModel)\b/, // Diesel, sqlx, SeaORM
  /\b(?:pgTable|mysqlTable|sqliteTable)\s*\(/, // Drizzle
  /@(?:Document|Collection)\s*\(/, // Mongo ODMs
  /\bEcto\.Schema\b/, // Elixir
]

/** Whether the file declares database models (ORM classes, Prisma models, Mongoose schemas …). */
export function isOrmModel(content: string): boolean {
  if (!content) return false
  return ORM_PATTERNS.some((re) => re.test(content))
}

const VALIDATION_RE = /\bz\.object\s*\(|\byup\.object\s*\(|\bJoi\.object\s*\(|\bclass\s+\w+\s*\(\s*(?:pydantic\.)?BaseModel\s*\)\s*:|\bt\.(?:type|interface)\s*\(|\bv\.object\s*\(|\bType\.Object\s*\(/

/** Whether the file mostly declares data-validation rules (zod, yup, Joi, pydantic …). */
export function isValidationSchema(content: string): boolean {
  return !!content && VALIDATION_RE.test(content)
}

/** Whether the file's contents look like automated tests, whatever it is called. */
export function looksLikeTest(content: string, family: Family): boolean {
  if (!content) return false
  switch (family) {
    case 'js':
      return /\b(?:describe|it|test)\s*\(\s*['"`]/.test(content) && /\bexpect\s*\(|\bassert\b|\bt\.(?:is|deepEqual|true)\s*\(/.test(content)
    case 'python':
      return /^\s*def\s+test_\w+\s*\(/m.test(content) && /\b(?:pytest|unittest)\b/.test(content)
    case 'go':
      return /^func\s+(?:Test|Benchmark)\w*\s*\(\s*\w+\s+\*testing\.[TB]\s*\)/m.test(content)
    case 'jvm':
      return /@Test\b/.test(content) && /\b(?:org\.junit|kotlin\.test|org\.testng)\b/.test(content)
    case 'csharp':
      return /\[(?:Fact|Test|TestMethod|Theory)\]/.test(content)
    case 'ruby':
      return /^\s*(?:RSpec\.)?describe\b[\s\S]*\bit\s+['"]/m.test(content) || /<\s*(?:Minitest::Test|ActiveSupport::TestCase)\b/.test(content)
    case 'php':
      return /\bextends\s+(?:\\?PHPUnit\\Framework\\)?TestCase\b/.test(content)
    default:
      return false
  }
}

const CLI_RE =
  /\bargparse\.ArgumentParser\b|@click\.(?:command|group)\b|\btyper\.Typer\s*\(|&?cobra\.Command\s*\{|#\[derive\([^)]*\bParser\b|\bclap::(?:Parser|Command|App)\b|\bnew\s+Command\s*\(\s*['"]?|\bprogram\s*\.\s*(?:command|option)\s*\(|\byargs\s*(?:\(|\.)|\bflag\.Parse\s*\(\s*\)|\bOptionParser\.new\b|<\s*Thor\b|\burfave\/cli\b|\bcli\.App\s*\{/

/** Whether the file defines command-line commands or options. */
export function looksLikeCli(content: string): boolean {
  return !!content && CLI_RE.test(content)
}

const CLIENT_RE = /\bfetch\s*\(|\baxios(?:\.[a-z]+)?\s*\(|\baxios\.create\b|\bnew\s+XMLHttpRequest\b|\brequests\.(?:get|post|put|patch|delete|Session)\b|\bhttpx\.(?:get|post|AsyncClient|Client)\b|\bhttp\.(?:Get|Post|NewRequest)\s*\(|\bHttpClient\b|\bky\s*\(|\bgot\s*\(|\bURLSession\b|\bRetrofit\b|\bdio\.(?:get|post)\b|\breqwest::/

/** Whether the file calls out to other servers over the internet. */
export function looksLikeClient(content: string): boolean {
  return !!content && CLIENT_RE.test(content)
}

export type StartKind = 'ui' | 'server' | 'desktop' | 'bot' | 'cli' | 'main'

export interface StartSignal {
  kind: StartKind
  /** 1-based line where the signal was found. */
  line: number
}

/** A line that starts with a comment marker (or a Python doctest prompt) is not running code. */
const COMMENT_LINE = String.raw`[ \t]*(?:\/\/|\/\*|\*|#(?![[!])|>>>|\.\.\.\s|--)`

/** Only match `core` when it appears on a line that isn't commented out. */
function onCodeLine(core: RegExp): RegExp {
  return new RegExp(String.raw`^(?!${COMMENT_LINE})[^\n]*?(?:${core.source})`, 'm')
}

const NOT_PYTHON: Family[] = ['js', 'go', 'rust', 'jvm', 'csharp', 'c', 'ruby', 'php', 'swift', 'dart', 'elixir', 'lua', 'r', 'shell', 'other']

const START_RULES: { kind: StartKind; re: RegExp; families?: Family[] }[] = [
  { kind: 'desktop', re: onCodeLine(/\bnew\s+BrowserWindow\s*\(|\btauri::Builder\b|\bwails\.Run\s*\(/) },
  {
    kind: 'bot',
    re: onCodeLine(
      /\bclient\.login\s*\(|\b(?:bot|client)\.run\s*\(\s*(?:TOKEN|token|os\.|config|settings|process\.env)|\bbot\.(?:launch|start_polling|infinity_polling|run_polling|polling)\s*\(|\bapplication\.run_polling\s*\(|\bnew\s+App\s*\(\s*\{[\s\S]{0,300}signingSecret/,
    ),
  },
  {
    kind: 'ui',
    re: onCodeLine(
      /\b(?:createRoot|hydrateRoot)\s*\(|\bReactDOM\.(?:render|hydrate)\s*\(|\bcreateApp\s*\([\s\S]{0,300}?\.mount\s*\(|\bnew\s+Vue\s*\(|\bbootstrapApplication\s*\(|\bplatformBrowserDynamic\s*\(|\bAppRegistry\.registerComponent\s*\(|\bregisterRootComponent\s*\(|\brunApp\s*\(|\bmount\s*\(\s*App\b|\bnew\s+App\s*\(\s*\{\s*target\b|\bcreateInertiaApp\s*\(/,
    ),
    families: ['js', 'dart'],
  },
  {
    kind: 'server',
    re: onCodeLine(
      /\b(?:app|server|api|application|srv|httpServer|fastify|instance)\.listen\s*\(|\.listen\s*\(\s*(?:PORT|port|process\.env\.PORT|config\.port|\d{2,5})\b|\bcreateServer\s*\([\s\S]{0,400}?\.listen\s*\(|\bhttp\.ListenAndServe(?:TLS)?\s*\(|\b(?:r|router|app|e|engine|server|srv|g|api|host)\.Run\s*\(\s*(?:["'`:]|\))|\b(?:e|app|server|srv)\.Start\s*\(\s*["':]|\baxum::serve\b|\bHttpServer::new\b|\brocket::build\s*\(|\bBun\.serve\s*\(|\bDeno\.serve\s*\(|\bserve\s*\(\s*\{\s*fetch\b|\bSpringApplication\.run\s*\(|\bWebApplication\.CreateBuilder\b|\bapp\.run\s*\(/,
    ),
    families: NOT_PYTHON,
  },
  {
    // Python: only at the top level or one indent deep, so docstring examples deep inside classes don't count.
    kind: 'server',
    re: /^(?: {0,4}|\t?)(?:[\w.]+\s*=\s*)?(?:app|application|socketio|uvicorn|waitress|web|server|httpd|demo)\.(?:run|run_app|serve|serve_forever|launch)\s*\(/m,
    families: ['python'],
  },
  {
    kind: 'cli',
    re: onCodeLine(/\bcobra\.Command\b[\s\S]*\.Execute\s*\(|\bprogram\.parse(?:Async)?\s*\(|\byargs\b[\s\S]*\.argv\b|\.parse_args\s*\(|\bclap::Parser\b|\bfire\.Fire\s*\(/),
  },
  { kind: 'main', re: /^package\s+main\b[\s\S]*^func\s+main\s*\(\s*\)/m, families: ['go'] },
  { kind: 'main', re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+main\s*\(/m, families: ['rust'] },
  { kind: 'main', re: /^if\s+__name__\s*==\s*['"]__main__['"]\s*:/m, families: ['python'] },
  { kind: 'main', re: onCodeLine(/\bstatic\s+(?:async\s+)?(?:void|int|Task(?:<int>)?)\s+Main\s*\(/), families: ['csharp'] },
  { kind: 'main', re: onCodeLine(/\bpublic\s+static\s+void\s+main\s*\(|^\s*(?:suspend\s+)?fun\s+main\s*\(|@SpringBootApplication\b/), families: ['jvm'] },
  { kind: 'main', re: /^\s*(?:int|void)\s+main\s*\(/m, families: ['c'] },
  { kind: 'main', re: /^\s*@main\b/m, families: ['swift'] },
  { kind: 'main', re: /^\s*(?:Future<void>|void)\s+main\s*\(/m, families: ['dart'] },
  { kind: 'main', re: onCodeLine(/\buse\s+Application\b/), families: ['elixir'] },
]

/** Line number (1-based) of a character offset. */
export function lineOfOffset(content: string, offset: number): number {
  let line = 1
  for (let i = content.indexOf('\n'); i !== -1 && i < offset; i = content.indexOf('\n', i + 1)) line++
  return line
}

/**
 * What kind of program starts in this file, if anything: a screen being put on the page ('ui'), a server starting to
 * listen ('server'), a desktop window opening, a bot logging in, a command-line parser, or a plain main function.
 */
export function detectStart(content: string, family: Family): StartSignal | null {
  if (!content) return null
  for (const rule of START_RULES) {
    if (rule.families && !rule.families.includes(family)) continue
    const m = rule.re.exec(content)
    if (m) {
      // For multi-line patterns, point at the last line of the match (the line that actually starts things).
      const end = m.index + m[0].length - 1
      const startLine = lineOfOffset(content, m.index)
      const endLine = lineOfOffset(content, end)
      return { kind: rule.kind, line: rule.kind === 'main' && family === 'go' ? endLine : startLine }
    }
  }
  if (/^#!.*\b(?:node|python3?|ruby|bash|sh|zsh|deno|bun|perl|php)\b/.test(content)) return { kind: 'cli', line: 1 }
  return null
}

/** Results of detectStartIn, keyed by file content then by language (the same file is asked about several times). */
const startCache = new Map<string, Map<string, StartSignal | null>>()
const START_CACHE_LIMIT = 2000

/** Forget cached results (call when an analysis finishes so file contents aren't kept alive). */
export function clearSignalCache(): void {
  startCache.clear()
}

/**
 * Like detectStart, but ignores code that only appears inside comments (Go package docs, JSDoc examples …).
 * Line numbers still refer to the original content. Results are cached per content.
 */
export function detectStartIn(content: string, family: Family, language: string | null): StartSignal | null {
  if (!content) return null
  const key = `${family}|${language ?? ''}`
  const hit = startCache.get(content)?.get(key)
  if (hit !== undefined) return hit
  let code = content
  if (language) {
    try {
      const stripped = stripComments(content, language)
      if (typeof stripped === 'string' && stripped.length > 0) code = stripped
    } catch {
      // Fall back to the raw text; the line-level comment guard still applies.
    }
  }
  const result = detectStart(code, family)
  if (startCache.size >= START_CACHE_LIMIT) startCache.clear()
  let byLang = startCache.get(content)
  if (!byLang) {
    byLang = new Map()
    startCache.set(content, byLang)
  }
  byLang.set(key, result)
  return result
}
