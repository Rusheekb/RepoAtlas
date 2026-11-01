import { parse as parseToml } from 'smol-toml'
import { joinPath } from '@/core/paths'
import type { ParseContext } from './util'
import { collapseSpace, isRecord, linesOf, resolveFile, stringArray, stripHashComment } from './util'

// ── Go ──────────────────────────────────────────────────────────────────────

/** go.mod: module path and direct requirements (indirect ones are skipped: they are dependencies of dependencies). */
export function parseGoMod(ctx: ParseContext): void {
  let inRequire = false
  for (const raw of linesOf(ctx.text)) {
    const indirect = /\/\/\s*indirect\b/.test(raw)
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (!line) continue
    const mod = /^module\s+("?)([^\s"]+)\1/.exec(line)
    if (mod) {
      // Manifests are visited root-first, so the top-level module wins.
      if (!ctx.out.goModulePath) ctx.out.goModulePath = mod[2]
      const last = mod[2].split('/').filter(Boolean).pop()
      if (last && !/^v\d+$/.test(last)) ctx.out.addName(last)
      continue
    }
    if (/^require\s*\($/.test(line)) {
      inRequire = true
      continue
    }
    if (inRequire && line === ')') {
      inRequire = false
      continue
    }
    const single = /^require\s+(\S+)\s+(\S+)/.exec(line)
    const spec = single ? [single[1], single[2]] : inRequire ? line.split(/\s+/) : null
    if (!spec || spec.length < 2 || indirect) continue
    ctx.out.addDep('go', spec[0].replace(/^"|"$/g, ''), { dev: false, source: ctx.path, section: 'require', version: spec[1] })
  }
}

/** go.work: `use` folders become workspaces. */
export function parseGoWork(ctx: ParseContext): void {
  let inUse = false
  for (const raw of linesOf(ctx.text)) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (!line) continue
    if (/^use\s*\($/.test(line)) {
      inUse = true
      continue
    }
    if (inUse && line === ')') {
      inUse = false
      continue
    }
    const single = /^use\s+(\S+)/.exec(line)
    const dir = single ? single[1] : inUse ? line : null
    if (dir) ctx.out.addWorkspace(ctx.dir, dir.replace(/^"|"$/g, ''))
  }
}

// ── Rust ────────────────────────────────────────────────────────────────────

function addCargoDeps(ctx: ParseContext, table: unknown, dev: boolean, section: string): void {
  if (!isRecord(table)) return
  for (const [key, value] of Object.entries(table)) {
    const name = isRecord(value) && typeof value.package === 'string' ? value.package : key
    const version = typeof value === 'string' ? value : isRecord(value) && typeof value.version === 'string' ? value.version : undefined
    ctx.out.addDep('cargo', name, { dev, source: ctx.path, section, version })
  }
}

/** Cargo.toml: package info, (dev-/build-/target-specific/workspace) dependencies, [[bin]] and [lib] entry files, workspace members. */
export function parseCargoToml(ctx: ParseContext): void {
  const doc = parseToml(ctx.text) as unknown
  if (!isRecord(doc)) return
  const { out, dir, exists } = ctx
  const pkg = isRecord(doc.package) ? doc.package : null
  if (pkg) {
    out.addName(pkg.name)
    out.addDescription(pkg.description)
  }
  addCargoDeps(ctx, doc.dependencies, false, 'dependencies')
  addCargoDeps(ctx, doc['dev-dependencies'], true, 'dev-dependencies')
  addCargoDeps(ctx, doc['build-dependencies'], true, 'build-dependencies')
  if (isRecord(doc.target)) {
    for (const target of Object.values(doc.target)) {
      if (!isRecord(target)) continue
      addCargoDeps(ctx, target.dependencies, false, 'target dependencies')
      addCargoDeps(ctx, target['dev-dependencies'], true, 'target dev-dependencies')
    }
  }
  const workspace = isRecord(doc.workspace) ? doc.workspace : null
  if (workspace) {
    for (const m of stringArray(workspace.members)) out.addWorkspace(dir, m)
    addCargoDeps(ctx, workspace.dependencies, false, 'workspace.dependencies')
  }

  let declaredBin = false
  if (Array.isArray(doc.bin)) {
    for (const bin of doc.bin) {
      if (!isRecord(bin)) continue
      declaredBin = true
      const name = typeof bin.name === 'string' ? bin.name : null
      const path = typeof bin.path === 'string' ? resolveFile(dir, bin.path, exists) : null
      const fallback = name ? [joinPath(dir, 'src/bin', `${name}.rs`), joinPath(dir, 'src/bin', name, 'main.rs')].find(exists) ?? null : null
      out.addEntry(path ?? fallback, name ? `Cargo.toml declares the "${name}" program starting here` : 'Cargo.toml declares a program starting here')
    }
  }
  if (pkg) {
    const main = joinPath(dir, 'src/main.rs')
    if (!declaredBin && exists(main)) out.addEntry(main, 'The standard starting file of a Rust program')
    const lib = isRecord(doc.lib) && typeof doc.lib.path === 'string' ? resolveFile(dir, doc.lib.path, exists) : null
    const defaultLib = joinPath(dir, 'src/lib.rs')
    if (lib) out.addEntry(lib, 'Cargo.toml names this as the main file of the library')
    else if (exists(defaultLib)) out.addEntry(defaultLib, 'The standard main file of a Rust library')
  }
}

// ── Ruby ────────────────────────────────────────────────────────────────────

const RUBY_DEV_GROUPS = /:(development|test|dev|ci|lint|rubocop|tools)\b/

/** Gemfile: gem lines; `group :development, :test do … end` blocks and `group: :test` options mark dev gems. */
export function parseGemfile(ctx: ParseContext): void {
  const stack: boolean[] = []
  for (const raw of linesOf(ctx.text)) {
    const line = collapseSpace(stripHashComment(raw)).trim()
    if (!line) continue
    const opensDo = (/(^| )do$/.test(line) || /(^| )do ?\|[^|]*\|$/.test(line)) && !/(^| )end$/.test(line)
    if (opensDo && line.startsWith('group ')) {
      const groups = line.slice(6, line.lastIndexOf(' do'))
      stack.push(RUBY_DEV_GROUPS.test(groups) && !/:(default|production)\b/.test(groups))
      continue
    }
    if (opensDo || /^(if|unless|case|begin|while|until|def)\b/.test(line)) {
      stack.push(stack.length > 0 ? stack[stack.length - 1] : false)
      continue
    }
    if (/^end\b/.test(line)) {
      stack.pop()
      continue
    }
    const gem = /^gem ?\(? ?['"]([^'"]+)['"](.*)$/.exec(line)
    if (!gem) continue
    const rest = gem[2]
    const inDevBlock = stack.some(Boolean)
    const inlineGroup = /\bgroups? ?(?::|=>) ?(\[[^\]]*\]|:\w+)/.exec(rest)
    const dev = inDevBlock || (inlineGroup !== null && RUBY_DEV_GROUPS.test(inlineGroup[1]))
    const version = /^ ?, ?['"]([^'"]+)['"]/.exec(rest)
    ctx.out.addDep('gem', gem[1], { dev, source: ctx.path, section: dev ? 'development/test group' : 'gems', version: version?.[1] })
  }
}

/** *.gemspec: runtime and development dependencies, name, summary. */
export function parseGemspec(ctx: ParseContext): void {
  const text = collapseSpace(ctx.text)
  const name = /\.name ?= ?['"]([^'"]+)['"]/.exec(text)
  if (name) ctx.out.addName(name[1])
  const summary = /\.(?:summary|description) ?= ?['"]([^'"]+)['"]/.exec(text)
  if (summary) ctx.out.addDescription(summary[1])
  for (const m of text.matchAll(/\.add_(runtime_|development_)?dependency ?\(? ?['"]([^'"]+)['"](?: ?, ?['"]([^'"]+)['"])?/g)) {
    const dev = m[1] === 'development_'
    ctx.out.addDep('gem', m[2], { dev, source: ctx.path, section: dev ? 'development dependencies' : 'dependencies', version: m[3] })
  }
}

// ── PHP ─────────────────────────────────────────────────────────────────────

const PLATFORM_PACKAGE = /^(php|hhvm|composer|composer-plugin-api|composer-runtime-api|ext-.+|lib-.+)$/i

/** composer.json: require / require-dev, PSR-4 autoload map, bin entries, scripts, name, description. */
export function parseComposerJson(ctx: ParseContext): void {
  const json: unknown = JSON.parse(ctx.text)
  if (!isRecord(json)) return
  const { out, dir, path, exists } = ctx
  out.addName(json.name)
  out.addDescription(json.description)
  for (const [key, dev] of [
    ['require', false],
    ['require-dev', true],
  ] as const) {
    const section = json[key]
    if (!isRecord(section)) continue
    for (const [name, version] of Object.entries(section)) {
      if (PLATFORM_PACKAGE.test(name)) continue
      out.addDep('composer', name, { dev, source: path, section: key, version })
    }
  }
  for (const key of ['autoload', 'autoload-dev']) {
    const auto = json[key]
    if (!isRecord(auto) || !isRecord(auto['psr-4'])) continue
    for (const [prefix, target] of Object.entries(auto['psr-4'])) {
      const first = stringArray(target)[0]
      if (first === undefined || prefix in out.psr4) continue
      out.psr4[prefix] = joinPath(dir, first)
    }
  }
  for (const bin of stringArray(json.bin)) out.addEntry(resolveFile(dir, bin, exists), 'composer.json lists this as a command-line program ("bin")')
  if (isRecord(json.scripts)) {
    for (const [name, cmd] of Object.entries(json.scripts)) {
      const command = typeof cmd === 'string' ? cmd : stringArray(cmd).join(' && ')
      if (command) out.addScript(name, command, path)
    }
  }
}
