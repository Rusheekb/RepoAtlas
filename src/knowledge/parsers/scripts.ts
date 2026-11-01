import type { ParseContext } from './util'
import { entriesFromCommand, linesOf, shellWords } from './util'

/** Join Dockerfile / Makefile continuation lines ("\" at line end). */
function joinContinuations(text: string): string[] {
  const out: string[] = []
  let buf = ''
  for (const raw of linesOf(text)) {
    if (/\\\s*$/.test(raw)) {
      buf += raw.replace(/\\\s*$/, ' ')
      continue
    }
    out.push(buf + raw)
    buf = ''
  }
  if (buf) out.push(buf)
  return out
}

/** Parse a Dockerfile instruction argument in exec form (["node", "x.js"]) or shell form (node x.js). */
function commandWords(arg: string): string[] {
  const trimmed = arg.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      // Fall through to shell-form parsing.
    }
  }
  return shellWords(trimmed)
}

/** Dockerfile: CMD / ENTRYPOINT (combined, as Docker runs them) → entry hints for repo files they start. */
export function parseDockerfile(ctx: ParseContext): void {
  const workdirs: string[] = []
  let entrypoint: string[] = []
  let cmd: string[] = []
  for (const line of joinContinuations(ctx.text)) {
    const m = /^\s*([A-Za-z]+)\s+(.*)$/.exec(line)
    if (!m) continue
    const instr = m[1].toUpperCase()
    const arg = m[2]
    if (instr === 'FROM') {
      // A new build stage starts: only the final stage's command matters.
      entrypoint = []
      cmd = []
    } else if (instr === 'WORKDIR') {
      const dir = arg.trim().replace(/^["']|["']$/g, '')
      if (dir.startsWith('/')) workdirs.unshift(dir)
    } else if (instr === 'ENTRYPOINT') {
      entrypoint = commandWords(arg.slice(0, 4000))
    } else if (instr === 'CMD') {
      cmd = commandWords(arg.slice(0, 4000))
    }
  }
  const quote = (w: string) => (/\s/.test(w) ? `"${w}"` : w)
  const commands: string[] = []
  // "sh -c '…'" wraps the real command in one argument.
  const unwrap = (words: string[]): string => {
    if (words.length >= 3 && /^(\/bin\/)?(ba)?sh$/.test(words[0]) && words[1] === '-c') return words.slice(2).join(' ')
    return words.map(quote).join(' ')
  }
  if (entrypoint.length > 0) commands.push(unwrap([...entrypoint, ...cmd]))
  if (cmd.length > 0) commands.push(unwrap(cmd))
  for (const command of commands) {
    for (const p of entriesFromCommand(command, ctx.dir, ctx.exists, workdirs)) ctx.out.addEntry(p, 'The Docker container starts by running this file')
  }
}

const SPECIAL_MAKE_TARGETS = /^\.(PHONY|DEFAULT|SUFFIXES|PRECIOUS|INTERMEDIATE|SECONDARY|DELETE_ON_ERROR|IGNORE|SILENT|EXPORT_ALL_VARIABLES|NOTPARALLEL|ONESHELL|POSIX)$/

/** Makefile: named targets (the chores you can run with `make <name>`) → scripts, with their first recipe lines. */
export function parseMakefile(ctx: ParseContext): void {
  const lines = joinContinuations(ctx.text)
  const phony = new Set<string>()
  for (const line of lines) {
    const m = /^\.PHONY\s*:\s*(.*)$/.exec(line)
    if (m) for (const t of m[1].split(/\s+/)) if (t) phony.add(t)
  }
  const targets: { name: string; recipe: string[] }[] = []
  let current: { name: string; recipe: string[] }[] = []
  for (const line of lines) {
    if (line.startsWith('\t')) {
      const step = line.trim().replace(/^[@+-]+/, '').trim()
      if (step && !step.startsWith('#')) for (const t of current) if (t.recipe.length < 3) t.recipe.push(step)
      continue
    }
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = /^([A-Za-z0-9_][\w./-]*(?:\s+[A-Za-z0-9_][\w./-]*)*)\s*::?(?!=)\s*(.*)$/.exec(line)
    if (!m) {
      current = []
      continue
    }
    const names = m[1].split(/\s+/).filter((n) => !SPECIAL_MAKE_TARGETS.test(n))
    const semi = m[2].indexOf(';')
    const inlineRecipe = semi === -1 ? '' : m[2].slice(semi + 1).trim()
    current = []
    for (const name of names) {
      // Without a .PHONY list, file-like targets ("main.o", "build/app") are build products, not chores.
      if (phony.size > 0 ? !phony.has(name) && /[./]/.test(name) : /[./]/.test(name)) continue
      if (targets.some((t) => t.name === name)) continue
      const t = { name, recipe: inlineRecipe ? [inlineRecipe] : ([] as string[]) }
      targets.push(t)
      current.push(t)
    }
  }
  for (const t of targets.slice(0, 60)) ctx.out.addScript(t.name, t.recipe.length > 0 ? t.recipe.join(' && ') : `make ${t.name}`, ctx.path)
}

/** Procfile: "web: gunicorn app:app" process types → scripts, plus entry hints for the files they run. */
export function parseProcfile(ctx: ParseContext): void {
  for (const raw of linesOf(ctx.text)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(raw.trim())
    if (!m) continue
    ctx.out.addScript(m[1], m[2], ctx.path)
    for (const p of entriesFromCommand(m[2], ctx.dir, ctx.exists)) ctx.out.addEntry(p, `The Procfile starts the "${m[1]}" process with this file`)
  }
}
