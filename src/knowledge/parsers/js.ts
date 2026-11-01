import { parse as parseYaml } from 'yaml'
import type { ParseContext } from './util'
import { entriesFromCommand, isRecord, resolveJsEntry, stringArray } from './util'

const DEP_SECTIONS: { key: string; dev: boolean }[] = [
  { key: 'dependencies', dev: false },
  { key: 'optionalDependencies', dev: false },
  { key: 'devDependencies', dev: true },
  { key: 'peerDependencies', dev: true },
]

/** Scripts whose command usually names the file that starts the program. */
const START_SCRIPTS = ['start', 'dev', 'serve', 'server', 'start:dev', 'start:prod', 'main', 'bot', 'app', 'run']

/** package.json: dependencies, scripts, entry files (main/module/bin/exports/browser), workspaces, name, description. */
export function parsePackageJson(ctx: ParseContext): void {
  const json: unknown = JSON.parse(ctx.text)
  if (!isRecord(json)) return
  const { out, path, dir, exists } = ctx

  out.addName(json.name)
  out.addDescription(json.description)

  for (const { key, dev } of DEP_SECTIONS) {
    const section = json[key]
    if (!isRecord(section)) continue
    for (const [name, version] of Object.entries(section)) out.addDep('npm', name, { dev, source: path, section: key, version })
  }

  const scripts = json.scripts
  if (isRecord(scripts)) {
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== 'string') continue
      out.addScript(name, command, path)
    }
    for (const name of START_SCRIPTS) {
      const command = scripts[name]
      if (typeof command !== 'string') continue
      for (const p of entriesFromCommand(command, dir, exists)) out.addEntry(p, `The "${name}" command in package.json runs this file`)
    }
  }

  const tryEntry = (rel: unknown, reason: string) => {
    if (typeof rel !== 'string') return
    out.addEntry(resolveJsEntry(dir, rel, exists), reason)
  }
  tryEntry(json.main, 'package.json names this as the main file')
  tryEntry(json.module, 'package.json names this as the main file for modern tools ("module")')
  if (typeof json.browser === 'string') tryEntry(json.browser, 'package.json names this as the main file for web browsers')

  const bin = json.bin
  if (typeof bin === 'string') {
    const cmd = typeof json.name === 'string' ? json.name.replace(/^@[^/]+\//, '') : 'the command'
    tryEntry(bin, `Runs when you type "${cmd}" in a terminal (package.json "bin")`)
  } else if (isRecord(bin)) {
    for (const [cmd, rel] of Object.entries(bin)) tryEntry(rel, `Runs when you type "${cmd}" in a terminal (package.json "bin")`)
  }

  for (const rel of exportTargets(json.exports)) tryEntry(rel, 'package.json lists this in "exports" (what other projects can use)')

  const ws = json.workspaces
  const globs = Array.isArray(ws) ? stringArray(ws) : isRecord(ws) ? stringArray(ws.packages) : []
  for (const g of globs) out.addWorkspace(dir, g)
}

/** Collect file paths from a package.json "exports" map (strings at any depth), main entry (".") first, at most 8. */
function exportTargets(exports: unknown): string[] {
  const found: string[] = []
  const visit = (v: unknown, depth: number) => {
    if (found.length >= 8 || depth > 5) return
    if (typeof v === 'string') {
      if (v.startsWith('./') && !v.includes('*') && !/\.(d\.[mc]?ts|json|css)$/.test(v) && !found.includes(v)) found.push(v)
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1)
      return
    }
    if (!isRecord(v)) return
    const keys = Object.keys(v)
    // Prefer the main entry and source-ish conditions first.
    const order = keys.sort((a, b) => rank(a) - rank(b))
    for (const k of order) if (k !== 'types' && k !== 'typings') visit(v[k], depth + 1)
  }
  visit(exports, 0)
  return found
}

function rank(key: string): number {
  if (key === '.') return 0
  if (key === 'source' || key === 'development') return 1
  if (key === 'import' || key === 'default' || key === 'require' || key === 'node') return 2
  return 3
}

/** pnpm-workspace.yaml → workspace globs. */
export function parsePnpmWorkspace(ctx: ParseContext): void {
  const doc: unknown = parseYaml(ctx.text)
  if (!isRecord(doc)) return
  for (const g of stringArray(doc.packages)) ctx.out.addWorkspace(ctx.dir, g)
}

/** lerna.json → workspace globs. */
export function parseLernaJson(ctx: ParseContext): void {
  const json: unknown = JSON.parse(ctx.text)
  if (!isRecord(json)) return
  for (const g of stringArray(json.packages)) ctx.out.addWorkspace(ctx.dir, g)
}

/** deno.json(c) → tasks as scripts, plus npm: imports as dependencies. */
export function parseDenoJson(ctx: ParseContext): void {
  const json: unknown = JSON.parse(stripJsonComments(ctx.text))
  if (!isRecord(json)) return
  if (isRecord(json.tasks)) {
    for (const [name, command] of Object.entries(json.tasks)) {
      const cmd = typeof command === 'string' ? command : isRecord(command) && typeof command.command === 'string' ? command.command : null
      if (cmd) {
        ctx.out.addScript(name, cmd, ctx.path)
        if (name === 'start' || name === 'dev') for (const p of entriesFromCommand(cmd, ctx.dir, ctx.exists)) ctx.out.addEntry(p, `The "${name}" task in deno.json runs this file`)
      }
    }
  }
  if (isRecord(json.imports)) {
    for (const spec of Object.values(json.imports)) {
      if (typeof spec !== 'string' || spec.length > 300) continue
      const m = /^npm:(@?[^@\s]+(?:\/[^@\s]+)?)(?:@(.+))?$/.exec(spec)
      if (m) ctx.out.addDep('npm', m[1], { dev: false, source: ctx.path, section: 'imports', version: m[2] })
    }
  }
  ctx.out.addName(json.name)
  if (Array.isArray(json.workspace)) for (const g of stringArray(json.workspace)) ctx.out.addWorkspace(ctx.dir, g)
}

/** Remove // and /* *\/ comments and trailing commas from JSONC (outside strings). */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i++
      } else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (ch === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else out += ch
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}
