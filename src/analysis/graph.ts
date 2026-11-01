import type { AnalyzedFile } from '@/core/types'
import type { ManifestInfo } from '@/knowledge'
import { basename, depthOf, dirname } from '@/core/paths'
import { familyOf } from './structure/family'
import { detectStartIn, type StartKind } from './structure/signals'
import { code, sentence } from './structure/text'
import { zonesOf } from './structure/zones'

export interface EntryPointOptions {
  /** Project names (repo name, package names) — files named after the project are often its front door. */
  projectNames?: string[]
}

interface Candidate {
  path: string
  score: number
  reason: string
  reasonScore: number
  /** Only the import-graph hint supports it (nothing in its name, contents or settings says "start here"). */
  weak: boolean
}

export interface EntryPoint {
  path: string
  reason: string
  /** True when the guess rests only on how files connect, not on a clear start-up signal. */
  weak?: boolean
}

const GRAPH_SCORE_BASE = 20

const MAX_ENTRIES = 8
const MIN_SCORE = 25

const START_REASONS: Record<Exclude<StartKind, 'main'>, string> = {
  ui: 'The app’s screens start here — this file puts the first screen on the page.',
  server: 'The server starts here — it begins listening for web requests.',
  desktop: 'The desktop app starts here — it opens the main window.',
  bot: 'The bot starts here — it logs in and starts listening for messages.',
  cli: 'The command-line program starts here — it reads the commands you type.',
}

const START_SCORES: Record<StartKind, number> = { ui: 70, server: 70, desktop: 75, bot: 70, cli: 55, main: 65 }

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/\.(js|ts|py|go|rs|rb)$/, '')
    .replace(/[^a-z0-9]/g, '')
}

function stem(name: string): string {
  const i = name.indexOf('.')
  return i <= 0 ? name : name.slice(0, i)
}

function isCodeFile(f: AnalyzedFile): boolean {
  return f.kind === 'source' || f.kind === 'script' || f.role === 'entry' || f.role === 'cli'
}

function mainReason(f: AnalyzedFile, family: ReturnType<typeof familyOf>): string {
  const parts = f.path.split('/')
  const cmdIdx = parts.lastIndexOf('cmd')
  if (cmdIdx !== -1 && cmdIdx < parts.length - 2) return `The ${code(parts[cmdIdx + 1])} command starts here (it has a main function).`
  const binIdx = parts.lastIndexOf('bin')
  if (binIdx !== -1 && binIdx === parts.length - 2 && family === 'rust') return `The ${code(stem(f.name))} command starts here (it has a main function).`
  if (family === 'python') return 'The program starts here when you run this file (it has a “main” section that kicks things off).'
  if (family === 'elixir') return 'The app starts here — it launches the app’s background workers.'
  return 'The program starts here (it has a main function).'
}

/** Try to map a manifest hint that points at built output (dist/index.js) back to its source file (src/index.ts). */
function mapBuiltPath(hint: string, byPath: Map<string, AnalyzedFile>): string | null {
  const clean = hint.replace(/^\.\//, '').replace(/^\/+/, '')
  if (byPath.has(clean)) return clean
  const noExt = clean.replace(/\.(m|c)?jsx?$|\.d\.ts$/, '')
  const bases = new Set([noExt, noExt.replace(/^(dist|build|lib|out|es|esm|cjs|umd)\//, 'src/'), noExt.replace(/^(dist|build|out|es|esm|cjs|umd)\//, '')])
  for (const b of bases) {
    for (const ext of ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']) {
      if (byPath.has(b + ext)) return b + ext
    }
    for (const idx of ['/index.ts', '/index.tsx', '/index.js']) {
      if (byPath.has(b + idx)) return b + idx
    }
  }
  return null
}

/**
 * Likely starting points, best first, each with a plain-English reason.
 * Signals: manifest entryHints (package.json main/bin, pyproject scripts, Dockerfile CMD), conventional names at shallow
 * depth (main.*, index.* at root/src, app.*, server.*, cli.*, __main__.py, manage.py, cmd/<x>/main.go, src/main.rs,
 * src/bin/*.rs, Program.cs, Main.java with `public static void main`), content signals (`if __name__ == "__main__"`,
 * `func main()`, `fn main()`, `createRoot(`/`ReactDOM.render(`, `app.listen(`, `uvicorn.run(`), files imported by no one
 * but importing many. Return at most ~8.
 */
export function findEntryPoints(
  files: AnalyzedFile[],
  manifests: ManifestInfo,
  contents: Record<string, string>,
  options: EntryPointOptions = {},
): EntryPoint[] {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const cands = new Map<string, Candidate>()
  const projectNames = new Set((options.projectNames ?? []).map(normalizeName).filter((n) => n.length >= 2))

  const eligible = (f: AnalyzedFile): boolean => {
    if (f.kind === 'test' || f.kind === 'generated' || f.kind === 'docs' || f.kind === 'asset') return false
    const zones = zonesOf(f.path)
    return !zones.includes('test') && !zones.includes('vendor') && !zones.includes('generated')
  }
  const penalty = (f: AnalyzedFile): number => {
    const zones = zonesOf(f.path)
    let p = depthOf(f.path) * 2
    if (zones.includes('example') || zones.includes('docs')) p += 45
    if (zones.includes('scripts') || zones.includes('infra')) p += 30
    return p
  }
  const add = (f: AnalyzedFile, score: number, reason: string, graphOnly = false) => {
    if (!eligible(f)) return
    const existing = cands.get(f.path)
    if (!existing) {
      cands.set(f.path, { path: f.path, score: score - penalty(f), reason, reasonScore: score, weak: graphOnly })
      return
    }
    if (!graphOnly) existing.weak = false
    // Several independent signals make a file more convincing; the strongest one explains it.
    existing.score += Math.min(score, 40) * 0.3
    if (score > existing.reasonScore) {
      existing.reason = reason
      existing.reasonScore = score
    }
  }

  // 1. What the project's own settings files say.
  for (const hint of manifests.entryHints ?? []) {
    if (!hint?.path) continue
    const direct = byPath.get(hint.path)
    const mapped = direct ? hint.path : mapBuiltPath(hint.path, byPath)
    const f = mapped ? byPath.get(mapped) : undefined
    if (!f) continue
    const base = sentence(hint.reason?.trim() ? capitalizeFirst(hint.reason.trim()) : 'A project settings file points to this as the starting point')
    add(f, 100, mapped === hint.path ? base : `${base} The finished program is built from this file.`)
  }

  // 2. What the code itself does, and 3. what the files are called.
  for (const f of files) {
    if (!eligible(f)) continue
    const family = familyOf(f.language)
    const content = contents[f.path]
    const depth = depthOf(f.path)
    const name = f.name
    const lower = name.toLowerCase()
    const codeFile = isCodeFile(f)

    if (content && codeFile) {
      const start = detectStartIn(content, family, f.language)
      if (start) add(f, START_SCORES[start.kind], start.kind === 'main' ? mainReason(f, family) : START_REASONS[start.kind])
    }
    if (!codeFile && !(lower === 'index.html')) continue

    if (lower === '__main__.py') add(f, 60, 'Python runs this file when the package is started as a program.')
    else if (lower === 'manage.py' && depth <= 1) add(f, 55, 'Django’s control panel: commands such as “start the server” are run through this file.')
    else if ((lower === 'wsgi.py' || lower === 'asgi.py') && depth <= 2) add(f, 40, 'Web servers use this file to start the app.')
    else if (lower === 'program.cs') add(f, 55, 'C# programs start in a file called Program.cs.')
    else if (lower === 'index.html' && (depth === 0 || (depth === 1 && ['public', 'src', 'static', 'www'].includes(dirname(f.path).toLowerCase())))) {
      add(f, 35, 'The web page the browser loads first.')
    } else if (/^main\.[a-z]+$/.test(lower)) add(f, depth <= 2 ? 45 : 35, 'It’s called “main”, the usual name for the place a program starts.')
    else if (/^lib\.rs$/.test(lower) && dirname(f.path).endsWith('src') && depth <= 2) add(f, 50, 'The front door of this Rust library — everything it offers is listed from here.')
    else if (/^(index)\.(js|ts|mjs|cjs|tsx|jsx)$/.test(lower) && (depth === 0 || (depth === 1 && ['src', 'lib', 'server', 'app'].includes(f.dir.toLowerCase())))) {
      add(f, 35, 'The front door of the code — other files are reached from here.')
    } else if (/^(app|server)\.[a-z]+$/.test(lower) && depth <= 1) add(f, 40, 'Its name suggests the app is set up and started here.')
    else if (/^cli\.[a-z]+$/.test(lower) && depth <= 2) add(f, 40, 'Commands typed into the terminal arrive here first.')

    // Named after the project itself: gin.go, lib/express.js, src/flask/__init__.py …
    if (projectNames.size > 0 && depth <= 2) {
      if (lower === '__init__.py' && projectNames.has(normalizeName(basename(f.dir)))) {
        add(f, 50, `The front door of the ${code(basename(f.dir))} package — this is what people get when they use it.`)
      } else if (projectNames.has(normalizeName(stem(name))) && !/^(index|main)$/i.test(stem(name))) {
        add(f, 45, `It’s named after the project itself, so it’s most likely the main file of ${code(stem(name))}.`)
      }
    }

    // 4. Pulls lots in, but nothing uses it.
    if (f.kind === 'source' && f.importedBy.length === 0 && f.imports.length >= 3 && f.role !== 'types' && f.role !== 'test') {
      add(f, GRAPH_SCORE_BASE + Math.min(f.imports.length, 10), `Nothing else uses this file, but it pulls in ${f.imports.length} others — a sign that things start here.`, true)
    }
  }

  let ranked = [...cands.values()].sort((a, b) => b.score - a.score || depthOf(a.path) - depthOf(b.path) || a.path.localeCompare(b.path))
  const strong = ranked.filter((c) => c.score >= MIN_SCORE)
  ranked = strong.length > 0 ? strong : ranked.filter((c) => c.score > 0).slice(0, 3)

  if (ranked.length === 0) {
    // Fall back to the most connected file near the top of the project.
    const central = files
      .filter((f) => eligible(f) && f.kind === 'source' && zonesOf(f.path).length === 0)
      .sort(
        (a, b) =>
          b.imports.length + b.importedBy.length - (a.imports.length + a.importedBy.length) ||
          depthOf(a.path) - depthOf(b.path) ||
          (b.lines ?? 0) - (a.lines ?? 0) ||
          a.path.localeCompare(b.path),
      )[0]
    return central ? [{ path: central.path, reason: 'A central file near the top of the project — a good place to start reading.', weak: true }] : []
  }
  return ranked.slice(0, MAX_ENTRIES).map((c) => (c.weak ? { path: c.path, reason: c.reason, weak: true } : { path: c.path, reason: c.reason }))
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * Files many others depend on (by importedBy count, excluding tests), most depended-on first. At most ~10.
 * Only the project's own code counts — files used mostly by examples or docs are not central to the project —
 * unless the project has nothing else (an examples-only repository).
 */
export function findHubs(files: AnalyzedFile[]): string[] {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const isOwnCode = (p: string) => {
    const f = byPath.get(p)
    if (!f || f.kind === 'test' || f.layer === 'test') return false
    const zones = zonesOf(p)
    return !zones.includes('test') && !zones.includes('example') && !zones.includes('docs')
  }
  const rank = (strict: boolean): string[] => {
    const scored: { f: AnalyzedFile; n: number }[] = []
    for (const f of files) {
      if (f.kind === 'test' || f.layer === 'test' || f.kind === 'generated') continue
      if (strict && !isOwnCode(f.path)) continue
      let n = 0
      for (const p of f.importedBy) {
        const importer = byPath.get(p)
        if (!importer || importer.kind === 'test' || importer.layer === 'test') continue
        if (strict && !isOwnCode(p)) continue
        n++
      }
      if (n >= 2) scored.push({ f, n })
    }
    return scored
      .sort((a, b) => b.n - a.n || (b.f.lines ?? 0) - (a.f.lines ?? 0) || a.f.path.localeCompare(b.f.path))
      .slice(0, 10)
      .map((x) => x.f.path)
  }
  const strict = rank(true)
  return strict.length > 0 ? strict : rank(false)
}
