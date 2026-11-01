import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { basename } from '@/core/paths'
import type { ParseContext } from './util'
import { bracketAfter, collapseSpace, isRecord, linesOf, resolvePyModule, stringArray, stripHashComment } from './util'

/** A parsed PEP 508 requirement ("requests[socks]>=2.0; python_version>'3'" → requests, ">=2.0"). */
export function parsePep508(spec: string): { name: string; version?: string } | null {
  const s = spec.trim()
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(\[[^\]]*\])?\s*([^;@]*)/.exec(s)
  if (!m) return null
  const version = m[3].trim().replace(/\s+/g, '')
  return version ? { name: m[1], version } : { name: m[1] }
}

/** Requirement files whose packages are only for development (tests, linting, docs …). */
export function isDevRequirementsPath(path: string): boolean {
  const file = basename(path.toLowerCase())
  return /(^|[._-])(dev|develop|development|test|tests|testing|lint|linting|docs?|ci|tox|typing|types|bench|benchmarks?|style|qa|local)([._-]|$)/.test(file)
}

/** requirements*.txt / requirements/*.txt / *.in: one requirement per line; options (-r, -e, --index-url …) are skipped. */
export function parseRequirementsTxt(ctx: ParseContext): void {
  const dev = isDevRequirementsPath(ctx.path)
  for (const raw of linesOf(ctx.text)) {
    const line = stripHashComment(raw).trim()
    if (!line || line.startsWith('-')) continue
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) || /^(\.|\/|~)/.test(line) || /\.(whl|tar\.gz|zip)$/i.test(line)) continue
    const req = parsePep508(line)
    if (req) ctx.out.addDep('pypi', req.name, { dev, source: ctx.path, version: req.version })
  }
}

function addPep508List(ctx: ParseContext, list: unknown, dev: boolean, section: string): void {
  for (const spec of stringArray(list)) {
    const req = parsePep508(spec)
    if (req) ctx.out.addDep('pypi', req.name, { dev, source: ctx.path, section, version: req.version })
  }
}

function addScriptEntry(ctx: ParseContext, name: string, target: unknown, source: string): void {
  if (typeof target !== 'string') return
  ctx.out.addScript(name, target, ctx.path)
  const mod = target.split(':')[0].trim()
  ctx.out.addEntry(resolvePyModule(ctx.dir, mod, ctx.exists), `Runs when you type "${name}" in a terminal (${source})`)
}

/** Poetry / Pipfile style tables: { requests = "^2", foo = { version = "1" } }. */
function addDependencyTable(ctx: ParseContext, table: unknown, dev: boolean, section: string): void {
  if (!isRecord(table)) return
  for (const [name, value] of Object.entries(table)) {
    if (name.toLowerCase() === 'python') continue
    const version = typeof value === 'string' ? value : isRecord(value) && typeof value.version === 'string' ? value.version : undefined
    ctx.out.addDep('pypi', name, { dev, source: ctx.path, section, version: version === '*' ? undefined : version })
  }
}

/** pyproject.toml: PEP 621 [project], PEP 735 [dependency-groups], Poetry, uv and PDM dev dependencies, console scripts. */
export function parsePyproject(ctx: ParseContext): void {
  const doc = parseToml(ctx.text) as unknown
  if (!isRecord(doc)) return
  const project = doc.project
  if (isRecord(project)) {
    ctx.out.addName(project.name)
    ctx.out.addDescription(project.description)
    addPep508List(ctx, project.dependencies, false, 'dependencies')
    if (isRecord(project['optional-dependencies'])) {
      for (const [group, list] of Object.entries(project['optional-dependencies'])) addPep508List(ctx, list, true, `optional-dependencies (${group})`)
    }
    for (const key of ['scripts', 'gui-scripts']) {
      const scripts = project[key]
      if (isRecord(scripts)) for (const [name, target] of Object.entries(scripts)) addScriptEntry(ctx, name, target, 'pyproject.toml')
    }
  }
  if (isRecord(doc['dependency-groups'])) {
    for (const [group, list] of Object.entries(doc['dependency-groups'])) addPep508List(ctx, list, true, `dependency-groups (${group})`)
  }
  const tool = doc.tool
  if (!isRecord(tool)) return
  const poetry = tool.poetry
  if (isRecord(poetry)) {
    ctx.out.addName(poetry.name)
    ctx.out.addDescription(poetry.description)
    addDependencyTable(ctx, poetry.dependencies, false, 'tool.poetry.dependencies')
    addDependencyTable(ctx, poetry['dev-dependencies'], true, 'tool.poetry.dev-dependencies')
    if (isRecord(poetry.group)) {
      for (const [group, def] of Object.entries(poetry.group)) {
        if (isRecord(def)) addDependencyTable(ctx, def.dependencies, group !== 'main', `tool.poetry.group.${group}`)
      }
    }
    if (isRecord(poetry.scripts)) {
      for (const [name, target] of Object.entries(poetry.scripts)) {
        const t = typeof target === 'string' ? target : isRecord(target) && typeof target.reference === 'string' ? target.reference : undefined
        addScriptEntry(ctx, name, t, 'pyproject.toml')
      }
    }
  }
  if (isRecord(tool.uv)) addPep508List(ctx, tool.uv['dev-dependencies'], true, 'tool.uv.dev-dependencies')
  if (isRecord(tool.pdm) && isRecord(tool.pdm['dev-dependencies'])) {
    for (const [group, list] of Object.entries(tool.pdm['dev-dependencies'])) addPep508List(ctx, list, true, `tool.pdm.dev-dependencies (${group})`)
  }
  if (isRecord(tool.poe) && isRecord(tool.poe.tasks)) {
    for (const [name, task] of Object.entries(tool.poe.tasks)) {
      const cmd = typeof task === 'string' ? task : isRecord(task) && typeof task.cmd === 'string' ? task.cmd : null
      if (cmd) ctx.out.addScript(name, cmd, ctx.path)
    }
  }
}

/** Pipfile (TOML): [packages], [dev-packages], [scripts]. */
export function parsePipfile(ctx: ParseContext): void {
  const doc = parseToml(ctx.text) as unknown
  if (!isRecord(doc)) return
  addDependencyTable(ctx, doc.packages, false, 'packages')
  addDependencyTable(ctx, doc['dev-packages'], true, 'dev-packages')
  if (isRecord(doc.scripts)) for (const [name, cmd] of Object.entries(doc.scripts)) if (typeof cmd === 'string') ctx.out.addScript(name, cmd, ctx.path)
}

/** setup.py, best effort: name, description, install_requires, tests_require / extras_require, console_scripts. */
export function parseSetupPy(ctx: ParseContext): void {
  const text = collapseSpace(ctx.text)
  const name = /\bname ?= ?['"]([^'"]+)['"]/.exec(text)
  if (name) ctx.out.addName(name[1])
  const desc = /\bdescription ?= ?['"]([^'"]+)['"]/.exec(text)
  if (desc) ctx.out.addDescription(desc[1])
  const quoted = (s: string | null): string[] => (s === null ? [] : [...s.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]))
  addPep508List(ctx, quoted(bracketAfter(text, /\binstall_requires ?= ?/, '[', ']')), false, 'install_requires')
  addPep508List(ctx, quoted(bracketAfter(text, /\btests_require ?= ?/, '[', ']')), true, 'tests_require')
  const extras = bracketAfter(text, /\bextras_require ?= ?/, '{', '}')
  if (extras !== null) {
    const specs = [...extras.matchAll(/\[([^\]]{0,5000})\]/g)].flatMap((m) => quoted(m[1]))
    addPep508List(ctx, specs, true, 'extras_require')
  }
  const scripts = bracketAfter(text, /console_scripts['"]? ?[:=] ?/, '[', ']')
  if (scripts !== null) {
    for (const m of scripts.matchAll(/['"] ?([\w.-]+) ?= ?([\w.]+) ?: ?[\w.]+ ?['"]/g)) addScriptEntry(ctx, m[1], `${m[2]}:main`, 'setup.py')
  }
}

/** Names that must never be used as plain-object keys (prototype pollution). */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Minimal INI reader: section → key → value (multi-line values joined with "\n").
 * Uses prototype-less objects and skips `__proto__`/`constructor`/`prototype` names, because section and key
 * names come from untrusted repository files.
 */
export function parseIni(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = Object.create(null)
  let section = ''
  let key: string | null = null
  let skipSection = false
  const sectionObj = (name: string): Record<string, string> => (out[name] ??= Object.create(null) as Record<string, string>)
  for (const raw of linesOf(text)) {
    if (/^\s*[#;]/.test(raw)) continue
    const sec = /^\s*\[([^\]]+)\]\s*$/.exec(raw)
    if (sec) {
      section = sec[1].trim()
      skipSection = UNSAFE_KEYS.has(section)
      if (!skipSection) sectionObj(section)
      key = null
      continue
    }
    if (skipSection) continue
    if (/^\s+\S/.test(raw) && key !== null) {
      sectionObj(section)[key] += `\n${raw.trim()}`
      continue
    }
    const kv = /^([^=:\s][^=:]*)[=:](.*)$/.exec(raw)
    if (kv) {
      const k = kv[1].trim()
      if (UNSAFE_KEYS.has(k)) {
        key = null
        continue
      }
      key = k
      sectionObj(section)[key] = kv[2].trim()
    } else if (!raw.trim()) {
      key = null
    }
  }
  return out
}

/** setup.cfg: [metadata] name/description, [options] install_requires, extras, console scripts. */
export function parseSetupCfg(ctx: ParseContext): void {
  const ini = parseIni(ctx.text)
  const meta = ini.metadata ?? {}
  ctx.out.addName(meta.name)
  ctx.out.addDescription(meta.description)
  const lines = (v: string | undefined) => (v ?? '').split(/\n|;(?=\s*[A-Za-z])/).map((s) => s.trim()).filter(Boolean)
  addPep508List(ctx, lines(ini.options?.install_requires), false, 'install_requires')
  for (const [group, value] of Object.entries(ini['options.extras_require'] ?? {})) addPep508List(ctx, lines(value), true, `extras_require (${group})`)
  for (const line of lines(ini['options.entry_points']?.console_scripts)) {
    const m = /^([\w.-]+)\s*=\s*([\w.]+)\s*:/.exec(line)
    if (m) addScriptEntry(ctx, m[1], `${m[2]}:main`, 'setup.cfg')
  }
}

/** environment.yml (conda): conda packages plus a nested pip: list. */
export function parseCondaEnvironment(ctx: ParseContext): void {
  const doc: unknown = parseYaml(ctx.text)
  if (!isRecord(doc)) return
  ctx.out.addName(doc.name)
  const deps = doc.dependencies
  if (!Array.isArray(deps)) return
  for (const item of deps) {
    if (typeof item === 'string') {
      const spec = item.replace(/^[\w.-]+::/, '').trim()
      const m = /^([A-Za-z0-9][\w.-]*)\s*([=<>!~].*)?$/.exec(spec)
      if (!m) continue
      const name = m[1]
      if (['python', 'pip', 'setuptools', 'wheel'].includes(name.toLowerCase())) continue
      ctx.out.addDep('conda', name, { dev: false, source: ctx.path, section: 'dependencies', version: m[2]?.replace(/^=+/, '') })
    } else if (isRecord(item) && Array.isArray(item.pip)) {
      addPep508List(ctx, item.pip, false, 'dependencies (pip)')
    }
  }
}
