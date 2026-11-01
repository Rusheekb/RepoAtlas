/**
 * Light, regex-based content signals shared by classification, entry-point detection, project-kind scoring and
 * tours. Every function is cheap (a handful of regex scans) and safe on any input.
 */
import type { Family } from './family'
import { maskSource } from '../strip'

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
  /^[ \t]*model[ \t]+[A-Z]\w*\s*\{/m, // Prisma
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
      return /^[ \t]*(?:async[ \t]+)?def[ \t]+test_\w+[ \t]*\(/m.test(content) && /\b(?:pytest|unittest|django\.test)\b/.test(content)
    case 'go':
      return /^func\s+(?:Test|Benchmark)\w*\s*\(\s*\w+\s+\*testing\.[TB]\s*\)/m.test(content)
    case 'jvm':
      return /@Test\b/.test(content) && /\b(?:org\.junit|kotlin\.test|org\.testng)\b/.test(content)
    case 'csharp':
      return /\[(?:Fact|Test|TestMethod|Theory)\]/.test(content)
    case 'ruby':
      return (/^[ \t]*(?:RSpec\.)?describe\b/m.test(content) && /^[ \t]*it[ \t]+['"]/m.test(content)) || /<\s*(?:Minitest::Test|ActiveSupport::TestCase)\b/.test(content)
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
  /**
   * Only the first line ("#!/bin/sh") says it can be run: true of every shell script, build wrapper (mvnw) and
   * installer, so it's a weak hint that should only count when nothing better is found.
   */
  weak?: boolean
}

/** A line that starts with a comment marker (or a Python doctest prompt) is not running code. */
const COMMENT_LINE = String.raw`[ \t]*(?:\/\/|\/\*|\*|#(?![[!])|>>>|\.\.\.\s|--)`

/** Only match `core` when it appears on a line that isn't commented out. */
function onCodeLine(core: RegExp): RegExp {
  return new RegExp(String.raw`^(?!${COMMENT_LINE})[^\n]*?(?:${core.source})`, 'm')
}

const NOT_PYTHON: Family[] = ['js', 'go', 'rust', 'jvm', 'csharp', 'c', 'ruby', 'php', 'swift', 'dart', 'elixir', 'lua', 'r', 'shell', 'other']

/** Chat libraries a bot logs in with; `client.login(` alone is also how Django tests and web apps sign people in. */
const CHAT_LIBRARY = /\b(?:discord(?:\.js)?|telegraf|telegram|aiogram|slack[-_/]?bolt|slack_sdk|matrix-(?:js-)?sdk|tmi\.js|mineflayer|whatsapp-web\.js|oceanic\.js|hikari|nextcord|disnake|pycord)\b/i

interface StartRule {
  kind: StartKind
  re: RegExp
  families?: Family[]
  /** Match against the text with string contents kept (for rules that read a string's value). */
  strings?: boolean
  /** Also required somewhere in the file, strings kept (an import of a chat library …). */
  requires?: RegExp
  /** Also required somewhere in the code, after the match (cobra.Command … .Execute()). */
  then?: RegExp
}

const START_RULES: StartRule[] = [
  { kind: 'desktop', re: onCodeLine(/\bnew\s+BrowserWindow\s*\(|\btauri::Builder\b|\bwails\.Run\s*\(/) },
  // A bot logs in with its token: client.login(TOKEN) / client.login(process.env.…), or any login once a chat library is in use.
  { kind: 'bot', re: onCodeLine(/\bclient\.login\s*\(\s*(?:TOKEN|token|BOT_TOKEN|DISCORD_TOKEN|process\.env|os\.|config\.|settings\.|env\.)/) },
  { kind: 'bot', re: onCodeLine(/\bclient\.login\s*\(/), strings: true, requires: CHAT_LIBRARY },
  {
    kind: 'bot',
    re: onCodeLine(
      /\b(?:bot|client)\.run\s*\(\s*(?:TOKEN|token|os\.|config|settings|process\.env)|\bbot\.(?:launch|start_polling|infinity_polling|run_polling|polling)\s*\(|\bapplication\.run_polling\s*\(|\bnew\s+App\s*\(\s*\{[\s\S]{0,300}signingSecret/,
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
  // "A then B" checks run as two plain searches: a [\s\S]* gap after every mention would rescan the rest of the file each time.
  { kind: 'cli', re: onCodeLine(/\bcobra\.Command\b/), then: /\.Execute\s*\(/ },
  { kind: 'cli', re: onCodeLine(/\byargs\b/), then: /\.argv\b/ },
  { kind: 'cli', re: onCodeLine(/\bprogram\.parse(?:Async)?\s*\(|\.parse_args\s*\(|\bclap::Parser\b|\bfire\.Fire\s*\(/) },
  { kind: 'main', re: /^package[ \t]+main\b/m, then: /^func[ \t]+main[ \t]*\([ \t]*\)/m, families: ['go'] },
  { kind: 'main', re: /^[ \t]*(?:pub[ \t]+)?(?:async[ \t]+)?fn[ \t]+main[ \t]*\(/m, families: ['rust'] },
  { kind: 'main', re: /^if[ \t]+__name__[ \t]*==[ \t]*['"]__main__['"][ \t]*:/m, families: ['python'], strings: true },
  { kind: 'main', re: onCodeLine(/\bstatic\s+(?:async\s+)?(?:void|int|Task(?:<int>)?)\s+Main\s*\(/), families: ['csharp'] },
  { kind: 'main', re: onCodeLine(/\bpublic\s+static\s+void\s+main\s*\(|^[ \t]*(?:suspend[ \t]+)?fun[ \t]+main[ \t]*\(|@SpringBootApplication\b/), families: ['jvm'] },
  { kind: 'main', re: /^[ \t]*(?:int|void)[ \t]+main[ \t]*\(/m, families: ['c'] },
  { kind: 'main', re: /^[ \t]*@main\b/m, families: ['swift'] },
  { kind: 'main', re: /^[ \t]*(?:Future<void>|void)[ \t]+main[ \t]*\(/m, families: ['dart'] },
  { kind: 'main', re: onCodeLine(/\buse\s+Application\b/), families: ['elixir'] },
]

/** Lines longer than this are minified bundles or data: no start-up call hides in them, and regexes get slow. */
const MAX_SCAN_LINE = 5000
/** "#!/usr/bin/env node", "#!/bin/sh" … on the first line. */
const SHEBANG = /^#![^\n]{0,200}?\b(?:node|python3?|ruby|bash|sh|zsh|deno|bun|perl|php)\b/

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
  const scan = blankLongLines(content)
  return startIn(scan, scan, family) ?? shebangStart(content)
}

/** Blank out over-long lines (keeping every offset and line break where it was). */
function blankLongLines(text: string): string {
  if (text.length <= MAX_SCAN_LINE) return text
  let long = false
  for (let pos = 0; pos < text.length; ) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl
    if (end - pos > MAX_SCAN_LINE) {
      long = true
      break
    }
    pos = end + 1
  }
  if (!long) return text
  const parts: string[] = []
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl
    parts.push(end - pos > MAX_SCAN_LINE ? ' '.repeat(end - pos) : text.slice(pos, end))
    if (nl === -1) break
    pos = nl + 1
  }
  return parts.join('\n')
}

/**
 * Run the start rules over `code` (comments and string contents blanked) — or over `text` (comments blanked, strings
 * kept) for the few rules that need a string's value. Both views have identical offsets.
 */
function startIn(code: string, text: string, family: Family): StartSignal | null {
  for (const rule of START_RULES) {
    if (rule.families && !rule.families.includes(family)) continue
    if (rule.requires && !rule.requires.test(text)) continue
    const target = rule.strings ? text : code
    const m = rule.re.exec(target)
    let end = m ? m.index + m[0].length - 1 : -1
    if (m && rule.then) {
      const after = new RegExp(rule.then.source, `${rule.then.flags.replace('g', '')}g`)
      after.lastIndex = m.index + m[0].length
      const t = after.exec(target)
      if (!t) continue
      end = t.index + t[0].length - 1
    }
    if (m) {
      // For multi-line patterns, point at the last line of the match (the line that actually starts things).
      const startLine = lineOfOffset(target, m.index)
      const endLine = lineOfOffset(target, end)
      return { kind: rule.kind, line: rule.kind === 'main' && family === 'go' ? endLine : startLine }
    }
  }
  return null
}

function shebangStart(content: string): StartSignal | null {
  return SHEBANG.test(content) ? { kind: 'cli', line: 1, weak: true } : null
}

/** Results of detectStartIn, keyed by file content then by language (the same file is asked about several times). */
const startCache = new Map<string, Map<string, StartSignal | null>>()
const START_CACHE_LIMIT = 2000

/** Forget cached results (call when an analysis finishes so file contents aren't kept alive). */
export function clearSignalCache(): void {
  startCache.clear()
}

/**
 * Like detectStart, but ignores code that only appears inside comments (Go package docs, JSDoc examples …) or inside
 * string literals (a test fixture holding 'app.listen(3000)' as text). Line numbers still refer to the original
 * content. Results are cached per content.
 */
export function detectStartIn(content: string, family: Family, language: string | null): StartSignal | null {
  if (!content) return null
  const key = `${family}|${language ?? ''}`
  const hit = startCache.get(content)?.get(key)
  if (hit !== undefined) return hit
  let code = content
  let text = content
  if (language) {
    try {
      const masked = maskSource(content, language)
      if (masked.code.length === content.length && masked.text.length === content.length) {
        code = masked.code
        text = masked.text
      }
    } catch {
      // Fall back to the raw text; the line-level comment guard still applies.
    }
  }
  const result = startIn(blankLongLines(code), blankLongLines(text), family) ?? shebangStart(content)
  if (startCache.size >= START_CACHE_LIMIT) startCache.clear()
  let byLang = startCache.get(content)
  if (!byLang) {
    byLang = new Map()
    startCache.set(content, byLang)
  }
  byLang.set(key, result)
  return result
}
