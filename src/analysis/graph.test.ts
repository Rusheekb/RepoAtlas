import { describe, expect, it } from 'vitest'
import type { ManifestInfo } from '@/knowledge'
import { findEntryPoints, findHubs, relianceOf, relianceText } from './graph'
import { makeFile } from './structure/testkit'

function manifests(overrides: Partial<ManifestInfo> = {}): ManifestInfo {
  return { dependencies: [], scripts: [], entryHints: [], workspaces: [], psr4: {}, projectNames: [], descriptions: [], ...overrides }
}

describe('findEntryPoints', () => {
  it('trusts manifest hints first, with their plain-English reason', () => {
    const files = [makeFile('src/server.ts'), makeFile('src/cli.ts'), makeFile('src/lib.ts')]
    const eps = findEntryPoints(files, manifests({ entryHints: [{ path: 'src/cli.ts', reason: 'package.json says this is the main file' }] }), {})
    expect(eps[0]).toEqual({ path: 'src/cli.ts', reason: 'Package.json says this is the main file.' })
  })

  it('maps hints that point at built output back to the source file', () => {
    const files = [makeFile('src/index.ts'), makeFile('src/other.ts')]
    const eps = findEntryPoints(files, manifests({ entryHints: [{ path: 'dist/index.js', reason: 'package.json says this is the main file.' }] }), {})
    expect(eps[0].path).toBe('src/index.ts')
    expect(eps[0].reason).toMatch(/built from this file/)
  })

  it('finds programs by what their code does', () => {
    const files = [
      makeFile('cmd/api/main.go', { language: 'Go' }),
      makeFile('web/src/index.tsx', { language: 'TSX' }),
      makeFile('server/start.js', { language: 'JavaScript' }),
      makeFile('tools/run.py', { language: 'Python' }),
      makeFile('pkg/util.go', { language: 'Go' }),
    ]
    const contents = {
      'cmd/api/main.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("hi")\n}\n',
      'web/src/index.tsx': "import { createRoot } from 'react-dom/client'\ncreateRoot(document.getElementById('root')!).render(<App />)\n",
      'server/start.js': "const app = require('./app')\napp.listen(3000)\n",
      'tools/run.py': 'def go():\n    pass\n\nif __name__ == "__main__":\n    go()\n',
      'pkg/util.go': 'package util\n\nfunc Helper() {}\n',
    }
    const eps = findEntryPoints(files, manifests(), contents)
    const byPath = Object.fromEntries(eps.map((e) => [e.path, e.reason]))
    expect(byPath['cmd/api/main.go']).toBe('The `api` command starts here (it has a main function).')
    expect(byPath['web/src/index.tsx']).toMatch(/puts the first screen on the page/)
    expect(byPath['server/start.js']).toMatch(/server starts here/)
    expect(byPath['pkg/util.go']).toBeUndefined()
  })

  it('prefers the real program over examples and ignores tests', () => {
    const files = [
      makeFile('index.js'),
      makeFile('examples/hello/index.js'),
      makeFile('test/app.test.js', { kind: 'test', role: 'test', layer: 'test' }),
    ]
    const contents = {
      'index.js': "module.exports = require('./lib/express')\n",
      'examples/hello/index.js': "var app = express()\napp.listen(3000)\n",
      'test/app.test.js': 'app.listen(3000)\n',
    }
    const eps = findEntryPoints(files, manifests(), contents)
    expect(eps[0].path).toBe('index.js')
    expect(eps.some((e) => e.path.startsWith('test/'))).toBe(false)
  })

  it('recognises files named after the project (libraries without a main program)', () => {
    const files = [
      makeFile('gin.go', { language: 'Go' }),
      makeFile('context.go', { language: 'Go' }),
      makeFile('src/flask/__init__.py', { language: 'Python' }),
    ]
    const eps = findEntryPoints(files, manifests(), {}, { projectNames: ['gin', 'flask'] })
    expect(eps.map((e) => e.path)).toEqual(expect.arrayContaining(['gin.go', 'src/flask/__init__.py']))
    expect(eps.find((e) => e.path === 'src/flask/__init__.py')!.reason).toMatch(/front door of the `flask` package/)
  })

  it('uses Python and Django conventions', () => {
    const files = [makeFile('manage.py', { language: 'Python' }), makeFile('src/pkg/__main__.py', { language: 'Python' })]
    const eps = findEntryPoints(files, manifests(), {})
    expect(eps.map((e) => e.path)).toEqual(['src/pkg/__main__.py', 'manage.py'])
  })

  it('falls back to a central file when nothing else stands out', () => {
    const files = [makeFile('lib/a.ts', { imports: ['lib/b.ts'], importedBy: ['lib/c.ts'] }), makeFile('lib/b.ts'), makeFile('lib/c.ts')]
    const eps = findEntryPoints(files, manifests(), {})
    expect(eps).toEqual([{ path: 'lib/a.ts', reason: 'A central file near the top of the project — a good place to start reading.', weak: true }])
  })

  it('marks guesses that rest only on the import graph as weak', () => {
    const files = [makeFile('src/glue.ts', { imports: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'] }), makeFile('src/a.ts'), makeFile('src/b.ts'), makeFile('src/c.ts'), makeFile('src/d.ts')]
    const eps = findEntryPoints(files, manifests(), {})
    expect(eps[0]).toMatchObject({ path: 'src/glue.ts', weak: true })
    const strong = findEntryPoints([...files, makeFile('src/main.ts', { imports: ['src/a.ts', 'src/b.ts', 'src/c.ts'] })], manifests(), {})
    expect(strong.find((e) => e.path === 'src/main.ts')?.weak).toBeUndefined()
  })

  it('returns at most 8 and never throws on an empty repo', () => {
    expect(findEntryPoints([], manifests(), {})).toEqual([])
    const many = Array.from({ length: 20 }, (_, i) => makeFile(`cmd/tool${i}/main.go`, { language: 'Go' }))
    expect(findEntryPoints(many, manifests(), {}).length).toBeLessThanOrEqual(8)
  })
})

describe('findHubs', () => {
  it('ranks files by how many non-test files use them', () => {
    const files = [
      makeFile('src/a.ts', { importedBy: ['src/x.ts', 'src/y.ts', 'src/z.ts'] }),
      makeFile('src/b.ts', { importedBy: ['src/x.ts', 'src/y.ts', 'test/1.test.ts', 'test/2.test.ts'] }),
      makeFile('src/c.ts', { importedBy: ['src/x.ts'] }),
      makeFile('test/helpers.ts', { kind: 'test', layer: 'test', importedBy: ['test/1.test.ts', 'test/2.test.ts', 'test/3.test.ts'] }),
      makeFile('src/x.ts'),
      makeFile('src/y.ts'),
      makeFile('src/z.ts'),
      makeFile('test/1.test.ts', { kind: 'test' }),
      makeFile('test/2.test.ts', { kind: 'test' }),
    ]
    expect(findHubs(files)).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('findEntryPoints: false starts', () => {
  it('never offers the Maven or Gradle wrapper as the place a Java program starts', () => {
    const app = 'package com.example.demo;\n\n@SpringBootApplication\npublic class DemoApplication {\n  public static void main(String[] args) { SpringApplication.run(DemoApplication.class, args); }\n}\n'
    const files = [
      makeFile('mvnw', { kind: 'script', role: 'script', layer: 'infra', language: null }),
      makeFile('gradlew', { kind: 'script', role: 'script', layer: 'infra', language: null }),
      makeFile('src/main/java/com/example/demo/DemoApplication.java', { language: 'Java', role: 'entry', layer: 'api' }),
    ]
    const eps = findEntryPoints(files, manifests(), { mvnw: '#!/bin/sh\necho maven\n', gradlew: '#!/bin/sh\necho gradle\n', 'src/main/java/com/example/demo/DemoApplication.java': app })
    expect(eps.map((e) => e.path)).toEqual(['src/main/java/com/example/demo/DemoApplication.java'])
    expect(eps[0].reason).toMatch(/server starts here/)
  })

  it('only falls back to scripts that merely start with "#!" when nothing better exists', () => {
    const files = [
      makeFile('main.go', { language: 'Go' }),
      makeFile('install', { kind: 'script', role: 'script', layer: 'infra', language: null }),
      makeFile('bin/fzf-tmux', { kind: 'script', role: 'cli', layer: 'api', language: 'Shell' }),
    ]
    const contents = { 'main.go': 'package main\n\nfunc main() {\n}\n', install: '#!/usr/bin/env bash\necho installing\n', 'bin/fzf-tmux': '#!/usr/bin/env bash\necho tmux\n' }
    const eps = findEntryPoints(files, manifests(), contents).map((e) => e.path)
    expect(eps).toContain('main.go')
    expect(eps).toContain('bin/fzf-tmux')
    expect(eps).not.toContain('install')

    const onlyScripts = findEntryPoints([files[1]], manifests(), contents)
    expect(onlyScripts.map((e) => e.path)).toEqual(['install'])
  })

  it('ignores server code that only sits inside a string (a test fixture)', () => {
    const files = [makeFile('src/main.tsx', { language: 'TSX' }), makeFile('src/views/visual/sampleData.ts', { language: 'TypeScript' })]
    const contents = {
      'src/main.tsx': "createRoot(document.getElementById('root')!).render(<App />)\n",
      'src/views/visual/sampleData.ts': "export const files = { 'server.js': 'const app = express()\\napp.listen(3000)' }\n",
    }
    expect(findEntryPoints(files, manifests(), contents).map((e) => e.path)).toEqual(['src/main.tsx'])
  })
})

describe('relianceOf', () => {
  it('counts every importer and says how many are tests', () => {
    const hub = makeFile('src/globals.py', { importedBy: ['src/a.py', 'src/b.py', 'tests/test_a.py'] })
    const files = Object.fromEntries(
      [hub, makeFile('src/a.py'), makeFile('src/b.py'), makeFile('tests/test_a.py', { kind: 'test', role: 'test', layer: 'test' })].map((f) => [f.path, f]),
    )
    const r = relianceOf(hub, files)
    expect(r).toEqual({ total: 3, tests: 1 })
    expect(relianceText(r)).toBe('3 other files (1 of them is a test)')
    expect(relianceText({ total: 7, tests: 5 })).toBe('7 other files (5 of them are tests)')
    expect(relianceText({ total: 2, tests: 0 })).toBe('2 other files')
  })
})
