import { basename, dirname, extname, joinPath } from '@/core/paths'
import type { DependencyRef, Ecosystem, ManifestInfo } from '../types'
import { dict } from '@/core/dict'

/** Everything a single manifest parser needs. */
export interface ParseContext {
  /** Repo path of the manifest, e.g. "apps/web/package.json". */
  path: string
  /** Folder the manifest lives in ('' for the repo root). */
  dir: string
  text: string
  /** Whether a repo path exists (from the full tree). */
  exists: (path: string) => boolean
  /** Every repo path (for suffix searches such as Java main classes). */
  paths: readonly string[]
  out: ManifestCollector
}

/** Accumulates manifest facts with de-duplication. */
export class ManifestCollector {
  readonly dependencies: DependencyRef[] = []
  readonly scripts: { name: string; command: string; source: string }[] = []
  readonly entryHints: { path: string; reason: string }[] = []
  readonly workspaces: string[] = []
  readonly psr4: Record<string, string> = dict<string>()
  readonly projectNames: string[] = []
  readonly descriptions: string[] = []
  goModulePath: string | undefined

  private readonly depKeys = new Set<string>()
  private readonly scriptKeys = new Set<string>()
  private readonly entryKeys = new Set<string>()
  private readonly workspaceKeys = new Set<string>()

  addDep(ecosystem: Ecosystem, rawName: string, opts: { dev: boolean; source: string; section?: string; version?: unknown }): void {
    const name = rawName.trim()
    if (!name || name.length > 214 || /\s/.test(name)) return
    const key = `${ecosystem}\u0000${name.toLowerCase()}\u0000${opts.source}\u0000${opts.dev ? 1 : 0}`
    if (this.depKeys.has(key)) return
    this.depKeys.add(key)
    const dep: DependencyRef = { ecosystem, name, dev: opts.dev, source: opts.source }
    const version = typeof opts.version === 'string' ? opts.version.trim() : typeof opts.version === 'number' ? String(opts.version) : ''
    if (version) dep.version = version.slice(0, 80)
    if (opts.section) dep.section = opts.section
    this.dependencies.push(dep)
  }

  addScript(name: string, command: string, source: string): void {
    const n = name.trim()
    const c = command.trim()
    if (!n || !c) return
    const key = `${source}\u0000${n}`
    if (this.scriptKeys.has(key)) return
    this.scriptKeys.add(key)
    this.scripts.push({ name: n, command: c.slice(0, 500), source })
  }

  /** Adds an entry hint for an existing repo path (first reason wins). */
  addEntry(path: string | null | undefined, reason: string): void {
    if (!path || this.entryKeys.has(path)) return
    this.entryKeys.add(path)
    this.entryHints.push({ path, reason })
  }

  addWorkspace(dir: string, glob: unknown): void {
    if (typeof glob !== 'string') return
    let g = glob.trim()
    if (!g || g.startsWith('!') || g.startsWith('#')) return
    g = g.replace(/^\.\//, '').replace(/\/+$/, '')
    const full = dir ? joinGlob(dir, g) : g
    if (!full || full === '.' || this.workspaceKeys.has(full)) return
    this.workspaceKeys.add(full)
    this.workspaces.push(full)
  }

  addName(name: unknown): void {
    if (typeof name !== 'string') return
    const n = name.trim()
    if (n && n.length <= 120 && !this.projectNames.includes(n)) this.projectNames.push(n)
  }

  addDescription(desc: unknown): void {
    if (typeof desc !== 'string') return
    const d = desc.replace(/\s+/g, ' ').trim()
    if (d && !this.descriptions.includes(d)) this.descriptions.push(d.slice(0, 600))
  }

  toInfo(): ManifestInfo {
    const info: ManifestInfo = {
      dependencies: this.dependencies,
      scripts: this.scripts,
      entryHints: this.entryHints,
      workspaces: this.workspaces,
      psr4: this.psr4,
      projectNames: this.projectNames,
      descriptions: this.descriptions,
    }
    if (this.goModulePath) info.goModulePath = this.goModulePath
    return info
  }
}

/** Join a folder and a (possibly globbed) relative path, keeping "*" segments and resolving "..". */
function joinGlob(dir: string, glob: string): string {
  return joinPath(dir, glob)
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function stringArray(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/** Real manifest lines are short; longer ones are skipped so no line-based pattern can get slow on hostile input. */
const MAX_LINE = 2000

/** Lines of a text file, with Windows line endings normalized (over-long lines become empty). */
export function linesOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => (l.length > MAX_LINE ? '' : l))
}

/** Collapse every run of whitespace to one space, so patterns like `\s*\(?\s*` stay linear-time. */
export function collapseSpace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** Remove block comments (/* … *\/, <!-- … -->) in linear time; an unclosed comment runs to the end. */
export function stripBlockComments(text: string, open = '/*', close = '*/'): string {
  let out = ''
  let pos = 0
  for (;;) {
    const start = text.indexOf(open, pos)
    if (start === -1) return out + text.slice(pos)
    out += text.slice(pos, start)
    const end = text.indexOf(close, start + open.length)
    if (end === -1) return out
    pos = end + close.length
  }
}

/** Remove `// …` line comments, leaving "https://" alone. */
export function stripLineComments(text: string): string {
  return text.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** The inner text of each `<tag …>…</tag>` element, found in linear time. Unclosed elements are ignored. */
export function xmlElements(xml: string, tag: string): string[] {
  const out: string[] = []
  const closeTag = `</${tag}>`
  const opener = new RegExp(`<${tag}(?=[\\s>/])[^>]{0,1000}>`, 'g')
  let m: RegExpExecArray | null
  while ((m = opener.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    const end = xml.indexOf(closeTag, opener.lastIndex)
    if (end === -1) break // No closing tag anywhere further on, so no later element can close either.
    out.push(xml.slice(opener.lastIndex, end))
    opener.lastIndex = end + closeTag.length
  }
  return out
}

/** Remove every `<tag …>…</tag>` element (linear time). */
export function removeXmlElements(xml: string, tag: string): string {
  const closeTag = `</${tag}>`
  const opener = new RegExp(`<${tag}(?=[\\s>/])[^>]{0,1000}>`, 'g')
  let out = ''
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = opener.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    const end = xml.indexOf(closeTag, opener.lastIndex)
    if (end === -1) break
    out += xml.slice(pos, m.index)
    pos = end + closeTag.length
    opener.lastIndex = pos
  }
  return out + xml.slice(pos)
}

/** Text of the first `<tag>` element (trimmed, entities decoded), or undefined. */
export function xmlText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?=[\\s>])[^>]{0,1000}>([^<]{0,4000})</${tag}>`).exec(xml)
  if (!m) return undefined
  const text = m[1].trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  return text || undefined
}

/** The text between the brackets that follow `key` (e.g. install_requires=[ … ]), found with plain string search. */
export function bracketAfter(text: string, key: RegExp, open: string, close: string): string | null {
  const m = key.exec(text)
  if (!m) return null
  const start = text.indexOf(open, m.index + m[0].length)
  if (start === -1 || start - (m.index + m[0].length) > 20) return null
  const end = text.indexOf(close, start + 1)
  return end === -1 ? null : text.slice(start + 1, end)
}

/** The contents of the balanced `{ … }` block that follows the first match of `key`, or null. */
export function braceBlockAfter(text: string, key: RegExp): string | null {
  const m = key.exec(text)
  if (!m) return null
  const start = text.indexOf('{', m.index + m[0].length)
  if (start === -1 || start - (m.index + m[0].length) > 20) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return text.slice(start + 1, i)
  }
  return null
}

/** Strip a trailing "# comment" from a line (not inside quotes). */
export function stripHashComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '#') {
      return line.slice(0, i)
    }
  }
  return line
}

const JS_CODE_EXTS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx'])
const TRY_EXTS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']
/** Build-output folders whose source usually lives in src/. */
const OUTPUT_DIRS = new Set(['dist', 'build', 'lib', 'out', 'esm', 'cjs', 'es', 'umd', 'types', 'output', 'bundle'])
const FLAVOR_DIRS = new Set(['esm', 'cjs', 'es', 'umd', 'node', 'browser', 'module', 'commonjs', 'src', 'types', 'mjs'])

/** Clean a relative path from a manifest ("./dist/index.js" → "dist/index.js"); null for URLs, absolute or globbed paths. */
export function cleanRelative(rel: string): string | null {
  const r = rel.trim().replace(/^["']|["']$/g, '')
  if (!r || r.includes('://') || r.includes('*') || r.includes('$') || r.startsWith('~')) return null
  return r.replace(/^\.\//, '')
}

/**
 * Resolve a JavaScript/TypeScript entry path from a manifest to a real repo file.
 * Tries the path as-is, then with code extensions and /index files, then .js → .ts swaps,
 * then the src/ equivalent of build-output paths (dist/index.js → src/index.ts).
 */
export function resolveJsEntry(dir: string, rel: string, exists: (p: string) => boolean): string | null {
  const clean = cleanRelative(rel)
  if (clean === null) return null
  const base = joinPath(dir, clean)
  const relFromDir = joinPath(clean)
  for (const c of jsCandidates(base)) if (exists(c)) return c
  // dist/index.js → src/index.ts, dist/esm/index.mjs → src/index.ts
  const segs = relFromDir.split('/')
  if (segs.length >= 1 && OUTPUT_DIRS.has(segs[0].toLowerCase())) {
    const variants: string[][] = [['src', ...segs.slice(1)]]
    if (segs.length >= 3 && FLAVOR_DIRS.has(segs[1].toLowerCase())) variants.push(['src', ...segs.slice(2)])
    variants.push(segs.slice(1))
    for (const v of variants) {
      if (v.length === 0) continue
      for (const c of jsCandidates(joinPath(dir, v.join('/')))) if (exists(c)) return c
    }
  }
  return null
}

function jsCandidates(base: string): string[] {
  if (!base) return []
  const out = [base]
  const ext = extname(base)
  const name = basename(base)
  if (name.endsWith('.d.ts') || name.endsWith('.d.mts') || name.endsWith('.d.cts')) {
    const stem = base.replace(/\.d\.[mc]?ts$/, '')
    for (const e of TRY_EXTS) out.push(stem + e)
    return out
  }
  if (JS_CODE_EXTS.has(ext)) {
    const stem = base.slice(0, -(ext.length + 1))
    for (const e of TRY_EXTS) if (e !== `.${ext}`) out.push(stem + e)
  } else {
    for (const e of TRY_EXTS) out.push(base + e)
    for (const e of TRY_EXTS) out.push(`${base}/index${e}`)
  }
  return out
}

/** Resolve a Python dotted module ("pkg.cli") to a file: pkg/cli.py, pkg/cli/__init__.py, src/pkg/cli.py … */
export function resolvePyModule(dir: string, mod: string, exists: (p: string) => boolean): string | null {
  const m = mod.trim()
  if (!/^[A-Za-z_][\w.]*$/.test(m)) return null
  const rel = m.split('.').filter(Boolean).join('/')
  if (!rel) return null
  for (const root of ['', 'src', 'lib', 'app']) {
    const base = joinPath(dir, root, rel)
    for (const c of [`${base}.py`, `${base}/__main__.py`, `${base}/__init__.py`]) if (exists(c)) return c
  }
  return null
}

/** Resolve a plain file path (any language) relative to a folder, falling back to the repo root. */
export function resolveFile(dir: string, rel: string, exists: (p: string) => boolean): string | null {
  const clean = cleanRelative(rel)
  if (clean === null) return null
  for (const base of dir ? [dir, ''] : ['']) {
    const p = joinPath(base, clean)
    if (p && exists(p)) return p
  }
  return null
}

/** Find a repo file for a fully qualified JVM class name (com.example.App → …/com/example/App.java|kt). */
export function resolveJvmClass(className: string, paths: readonly string[]): string | null {
  const c = className.trim()
  if (!/^[A-Za-z_][\w.$]*$/.test(c)) return null
  const rel = c.replace(/\$.*$/, '').split('.').join('/')
  for (const ext of ['.java', '.kt', '.scala', '.groovy']) {
    const suffix = `/${rel}${ext}`
    const hit = paths.find((p) => p.endsWith(suffix) || p === suffix.slice(1))
    if (hit) return hit
  }
  return null
}

/** Split a shell command into words, honoring simple quotes. */
export function shellWords(command: string): string[] {
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

const RUNNER_PREFIXES = new Set(['exec', 'npx', 'bunx', 'pnpx', 'sudo', 'cross-env', 'dotenv', 'env', 'time', 'nohup', 'poetry', 'pipenv', 'uv', 'pdm', 'hatch', 'rye', 'bundle', 'yarn', 'pnpm'])
const PREFIX_SUBCOMMANDS = new Set(['run', 'exec', 'dlx', '--'])
const JS_RUNNERS = new Set(['node', 'nodemon', 'ts-node', 'ts-node-dev', 'tsx', 'bun', 'deno', 'electron', 'babel-node', 'node-dev', 'esno', 'vite-node', 'jiti', 'pm2', 'forever'])
const PY_RUNNERS = new Set(['python', 'python3', 'python2', 'py', 'pypy', 'pypy3'])
const PY_SERVERS = new Set(['uvicorn', 'gunicorn', 'hypercorn', 'daphne', 'granian', 'waitress-serve'])
const OTHER_RUNNERS = new Set(['ruby', 'php', 'perl', 'bash', 'sh', 'zsh', 'rails', 'streamlit', 'lua', 'Rscript', 'julia', 'dart', 'swift', 'elixir', 'mix'])
/** Options that take a value we must skip (node -r dotenv/config, python -X dev …). */
const OPTION_WITH_VALUE = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-X', '-W', '--env-file', '-c', '--config', '--watch-path', '-w', '--workers', '-b', '--bind', '--host', '--port', '-p', '-k', '--worker-class', '--name'])

/**
 * Find repo files a shell command runs: `node server.js`, `python -m app.main`, `uvicorn app.main:app`,
 * `go run ./cmd/server`, `./scripts/start.sh` … `stripPrefixes` removes container folders (/app/) from absolute paths.
 */
export function entriesFromCommand(command: string, dir: string, exists: (p: string) => boolean, stripPrefixes: string[] = []): string[] {
  const results: string[] = []
  const add = (p: string | null) => {
    if (p && !results.includes(p)) results.push(p)
  }
  const segments = command.slice(0, 4000).split(/&&|\|\||;|\|/)
  for (const segment of segments) {
    let words = shellWords(segment).map((w) => normalizeAbsolute(w, stripPrefixes))
    // Drop env assignments and wrappers (FOO=1 npx cross-env node x.js).
    while (words.length > 0) {
      const w = words[0]
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) words = words.slice(1)
      else if (RUNNER_PREFIXES.has(w)) {
        words = words.slice(1)
        while (words.length > 0 && PREFIX_SUBCOMMANDS.has(words[0])) words = words.slice(1)
      } else break
    }
    if (words.length === 0) continue
    const runner = basename(words[0])
    const args = words.slice(1)
    const firstPositional = (from: string[]): string | undefined => {
      for (let i = 0; i < from.length; i++) {
        const a = from[i]
        if (OPTION_WITH_VALUE.has(a)) {
          i++
          continue
        }
        if (a.startsWith('-')) continue
        return a
      }
      return undefined
    }

    if (JS_RUNNERS.has(runner)) {
      let rest = args
      if ((runner === 'deno' || runner === 'bun' || runner === 'pm2' || runner === 'forever') && (rest[0] === 'run' || rest[0] === 'start')) rest = rest.slice(1)
      const target = firstPositional(rest)
      if (target && looksLikePath(target)) add(resolveJsEntry(dir, target, exists) ?? resolveFile(dir, target, exists))
    } else if (PY_RUNNERS.has(runner)) {
      const mIdx = args.indexOf('-m')
      if (mIdx !== -1 && args[mIdx + 1]) {
        const mod = args[mIdx + 1]
        if (!['flask', 'uvicorn', 'gunicorn', 'pytest', 'pip', 'http.server', 'venv', 'unittest', 'streamlit'].includes(mod)) add(resolvePyModule(dir, mod, exists))
        else if (mod === 'uvicorn' || mod === 'gunicorn') addAppSpec(args.slice(mIdx + 2), dir, exists, add)
        else if (mod === 'streamlit' && args[mIdx + 2] === 'run' && args[mIdx + 3]) add(resolveFile(dir, args[mIdx + 3], exists))
      } else {
        const target = firstPositional(args)
        if (target && looksLikePath(target)) add(resolveFile(dir, target, exists))
      }
    } else if (PY_SERVERS.has(runner)) {
      addAppSpec(args, dir, exists, add)
    } else if (runner === 'flask') {
      const appIdx = args.findIndex((a) => a === '--app' || a.startsWith('--app='))
      if (appIdx !== -1) {
        const spec = args[appIdx].includes('=') ? args[appIdx].split('=')[1] : args[appIdx + 1]
        if (spec) add(resolvePyModule(dir, spec.split(':')[0], exists) ?? resolveFile(dir, spec, exists))
      }
    } else if (runner === 'go' && args[0] === 'run') {
      const target = firstPositional(args.slice(1))
      if (target) {
        if (target.endsWith('.go')) add(resolveFile(dir, target, exists))
        else add(resolveFile(dir, joinPath(target, 'main.go'), exists))
      }
    } else if (runner === 'streamlit' && args[0] === 'run' && args[1]) {
      add(resolveFile(dir, args[1], exists))
    } else if (OTHER_RUNNERS.has(runner)) {
      const target = firstPositional(args)
      if (target && looksLikePath(target)) add(resolveFile(dir, target, exists))
    } else if (looksLikePath(words[0]) && (words[0].includes('/') || extname(words[0]) !== '')) {
      add(resolveFile(dir, words[0], exists) ?? resolveJsEntry(dir, words[0], exists))
    }
  }
  return results
}

function addAppSpec(args: string[], dir: string, exists: (p: string) => boolean, add: (p: string | null) => void): void {
  for (const a of args) {
    const m = /^([A-Za-z_][\w.]*):[A-Za-z_][\w.()]*$/.exec(a)
    if (m) {
      add(resolvePyModule(dir, m[1], exists))
      return
    }
  }
}

function looksLikePath(word: string): boolean {
  if (!word || word.startsWith('-') || word.includes('://') || word.includes('$') || word.includes('*')) return false
  if (/^[\w@.~/-][\w@.~/+-]*$/.test(word) === false) return false
  return word.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(word)
}

function normalizeAbsolute(word: string, stripPrefixes: string[]): string {
  if (!word.startsWith('/')) return word
  const prefixes = [...stripPrefixes, '/app', '/usr/src/app', '/usr/app', '/code', '/srv/app', '/srv', '/opt/app', '/home/app', '/workspace', '/src']
  for (const raw of prefixes) {
    const p = raw.replace(/\/+$/, '')
    if (p && (word === p || word.startsWith(`${p}/`))) return word.slice(p.length + 1) || '.'
  }
  return word
}

/**
 * Whether a manifest sits in a folder that isn't the project itself (examples, fixtures, vendored code …).
 * Folders below a JVM source root (src/main/java/com/example/…) are package names, so they never count.
 */
export function isPeripheralPath(path: string): boolean {
  const segs = path.toLowerCase().split('/').slice(0, -1)
  let end = segs.length
  for (let i = 2; i < segs.length; i++) {
    if (JVM_SOURCE_LANGS.has(segs[i]) && segs[i - 2] === 'src') {
      end = i + 1
      break
    }
  }
  for (let i = 0; i < end; i++) if (PERIPHERAL_DIRS.has(segs[i])) return true
  return false
}

const JVM_SOURCE_LANGS = new Set(['java', 'kotlin', 'scala', 'groovy'])

/** Top-level folders that usually hold a documentation website rather than the product itself. */
const DOCS_SITE_DIRS = new Set(['docs', 'doc', 'documentation', 'site', 'website', 'docs-site', 'docsite', 'web-docs'])
/** Files that show a folder is built by a documentation-site generator (VitePress, Docusaurus, MkDocs …). */
const DOCS_SITE_MARKER = /^(?:\.vitepress|\.vuepress|docusaurus\.config\.[cm]?[jt]s|mkdocs\.ya?ml|book\.toml|conf\.py|theme\.config\.[jt]sx?|_config\.ya?ml|astro\.config\.[cm]?[jt]s|sidebars\.[cm]?[jt]s)$/i

/**
 * Top-level folders holding a documentation website: docs/, doc/ and documentation/ always; site/ and website/
 * only when a docs-site generator's files sit in them (so a repository whose product *is* a website keeps it).
 * Their manifests list what the docs site needs, not what the project itself is built with.
 */
export function docsSiteRoots(paths: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const p of paths) {
    if (typeof p !== 'string') continue
    const slash = p.indexOf('/')
    if (slash <= 0) continue
    const top = p.slice(0, slash)
    const lowerTop = top.toLowerCase()
    if (!DOCS_SITE_DIRS.has(lowerTop) || out.has(top)) continue
    if (lowerTop === 'docs' || lowerTop === 'doc' || lowerTop === 'documentation') {
      out.add(top)
      continue
    }
    const rest = p.slice(slash + 1)
    const next = rest.split('/')[0]
    if (DOCS_SITE_MARKER.test(next)) out.add(top)
  }
  return out
}

/** Whether a path sits inside one of the documentation-site folders found by docsSiteRoots. */
export function inDocsSite(path: string, roots: ReadonlySet<string>): boolean {
  if (roots.size === 0) return false
  const slash = path.indexOf('/')
  return slash > 0 && roots.has(path.slice(0, slash))
}

const PERIPHERAL_DIRS = new Set([
  'node_modules',
  'vendor',
  'vendors',
  'third_party',
  'third-party',
  'thirdparty',
  'bower_components',
  'fixtures',
  '__fixtures__',
  'fixture',
  'testdata',
  'test-data',
  'test_data',
  'test-fixtures',
  'examples',
  'example',
  'samples',
  'sample',
  'demos',
  'demo',
  'templates',
  'template',
  'starters',
  'boilerplates',
  '.yarn',
  '.git',
])

/** The folder part of a manifest path. */
export function dirOf(path: string): string {
  return dirname(path)
}
