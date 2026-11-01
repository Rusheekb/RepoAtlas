// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The Anthropic SDK and zod are big, and most readers never add a key: they must only be downloaded when Claude is
 * actually called. So nothing the UI imports from src/ai may import ./client, ./schemas, the SDK or zod statically
 * (type-only imports are fine, they disappear at build time; dynamic `import()` is the way in).
 */

const here = dirname(fileURLToPath(import.meta.url))
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function staticImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(STATIC_IMPORT)].map((m) => m[1])
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext
  return null
}

function reachable(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const spec of staticImports(file)) {
      const local = resolveLocal(file, spec)
      if (local) {
        if (local.startsWith(here)) queue.push(local)
      } else if (!spec.startsWith('@/')) {
        packages.add(spec)
      }
    }
  }
  return { files, packages }
}

describe('AI code splitting', () => {
  it.each(['index.ts', 'useAi.ts', 'tasks.ts', 'cache.ts'])('%s never pulls in the SDK or zod statically', (entry) => {
    const { files, packages } = reachable(join(here, entry))
    const names = [...files].map((f) => f.slice(here.length + 1))
    expect(names).not.toContain('client.ts')
    expect(names).not.toContain('schemas.ts')
    expect([...packages].filter((p) => p.startsWith('@anthropic-ai/') || p === 'zod' || p.startsWith('zod/'))).toEqual([])
  })

  it('the import scanner sees real static imports', () => {
    expect(staticImports(join(here, 'client.ts'))).toContain('@anthropic-ai/sdk')
    expect(staticImports(join(here, 'schemas.ts'))).toContain('zod')
  })
})
