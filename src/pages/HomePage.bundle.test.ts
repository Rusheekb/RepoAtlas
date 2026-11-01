// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The landing page must paint fast, even on a slow phone. So the code it loads up front (App → HomePage, the site
 * header and the Settings dialog) must not statically import Claude's code, the analysis engine, the knowledge base or
 * the markdown renderer: those are only needed once a project is open, and come in with the lazily loaded views.
 * Type-only imports are fine (they vanish at build time), and so are dynamic `import()`s.
 */

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolveFile(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(src, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext
    if (existsSync(p) && /\.(ts|tsx)$/.test(p)) return p
  }
  return null
}

function reachable(entry: string): { files: string[]; packages: Set<string> } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const local = resolveFile(file, spec)
      if (local) queue.push(local)
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec)
    }
  }
  return { files: [...files].map((f) => relative(src, f)), packages }
}

describe('landing page bundle', () => {
  const { files, packages } = reachable(join(src, 'App.tsx'))

  it('reaches the home page and settings (the scanner works)', () => {
    expect(files).toContain('pages/HomePage.tsx')
    expect(files).toContain('components/SettingsDialog.tsx')
    expect(packages.has('react-router')).toBe(true)
  })

  it('never loads Claude’s code, the analysis engine or the knowledge base up front', () => {
    expect(files.filter((f) => /^(ai|analysis|knowledge)\//.test(f))).toEqual([])
    expect(files).not.toContain('state/repo.ts')
    expect(files).not.toContain('components/shell/hooks.ts')
  })

  it('never loads the markdown renderer (or the kit barrel that re-exports it) up front', () => {
    expect(files).not.toContain('components/ui/index.ts')
    expect(files).not.toContain('components/ui/Markdown.tsx')
    expect([...packages].filter((p) => /^(react-markdown|remark-|@anthropic-ai\/|zod|shiki|yaml|@xyflow\/)/.test(p))).toEqual([])
  })
})
