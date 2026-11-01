import { describe, expect, it } from 'vitest'
import type { AnalyzedFile, TechItem } from '@/core/types'
import type { DependencyRef, ManifestInfo } from '@/knowledge'
import { detectProjectKind, type ProjectKindInput } from './projectKind'
import { makeFile } from './structure/testkit'

function manifests(overrides: Partial<ManifestInfo> = {}): ManifestInfo {
  return { dependencies: [], scripts: [], entryHints: [], workspaces: [], psr4: {}, projectNames: [], descriptions: [], ...overrides }
}

function deps(ecosystem: DependencyRef['ecosystem'], names: string[], dev = false): DependencyRef[] {
  return names.map((name) => ({ ecosystem, name, dev, source: 'package.json' }))
}

function tech(id: string, name = id): TechItem {
  return { id, name, category: 'frontend', description: '', evidence: [], importance: 'core' }
}

function run(partial: Partial<ProjectKindInput> & { files: AnalyzedFile[] }) {
  return detectProjectKind({ techStack: [], manifests: manifests(), readme: null, topics: [], description: null, ...partial })
}

describe('detectProjectKind', () => {
  it('recognises a React web app', () => {
    const files = [
      makeFile('index.html', { kind: 'markup', role: 'page', layer: 'ui' }),
      makeFile('src/main.tsx', { role: 'entry', layer: 'ui', isEntry: true }),
      ...['A', 'B', 'C', 'D', 'E'].map((n) => makeFile(`src/components/${n}.tsx`, { role: 'component', layer: 'ui' })),
    ]
    const k = run({ files, manifests: manifests({ dependencies: [...deps('npm', ['react', 'react-dom']), ...deps('npm', ['vite'], true)] }) })
    expect(k.id).toBe('web-app')
    expect(k.label).toBe('Web application')
    expect(k.emoji).toBe('🌐')
    expect(k.reasons[0]).toMatch(/^Uses React, /)
    expect(k.confidence).toBeGreaterThan(0.5)
    expect(k.confidence).toBeLessThanOrEqual(1)
  })

  it('recognises an Express API server by its framework and routes', () => {
    const files = [
      makeFile('src/server.ts', { role: 'entry', layer: 'api', isEntry: true }),
      makeFile('src/routes/users.ts', { role: 'route', layer: 'api', routes: [{ method: 'GET', path: '/users', line: 3 }, { method: 'POST', path: '/users', line: 9 }] }),
    ]
    const k = run({ files, manifests: manifests({ dependencies: deps('npm', ['express', 'pg']) }) })
    expect(k.id).toBe('api-server')
    expect(k.reasons.join(' ')).toMatch(/Express/)
    expect(k.reasons.join(' ')).toMatch(/2 different web addresses \(for example GET \/users\)/)
  })

  it('calls a Django project with page templates a web app', () => {
    const files = [
      makeFile('manage.py', { language: 'Python', role: 'cli' }),
      makeFile('shop/views.py', { language: 'Python', role: 'controller', layer: 'api' }),
      makeFile('shop/templates/shop/list.html', { kind: 'markup', role: 'page', layer: 'ui' }),
      makeFile('shop/templates/base.html', { kind: 'markup', role: 'layout', layer: 'ui' }),
    ]
    const k = run({ files, manifests: manifests({ dependencies: deps('pypi', ['django']) }) })
    expect(k.id).toBe('web-app')
  })

  it('recognises a library from its package.json', () => {
    const files = [makeFile('src/index.ts'), makeFile('src/parse.ts')]
    const k = run({ files, contents: { 'package.json': JSON.stringify({ name: 'tiny-parse', main: 'dist/index.js', types: 'dist/index.d.ts' }) } })
    expect(k.id).toBe('library')
  })

  it('recognises a command-line tool', () => {
    const files = [makeFile('src/cli.ts', { role: 'cli', layer: 'api' })]
    const k = run({
      files,
      manifests: manifests({ dependencies: deps('npm', ['commander']) }),
      contents: { 'package.json': JSON.stringify({ name: 'mytool', bin: { mytool: 'dist/cli.js' } }) },
    })
    expect(k.id).toBe('cli-tool')
  })

  it('recognises a browser extension from its manifest', () => {
    const files = [makeFile('manifest.json', { kind: 'config', role: 'config', layer: 'config' }), makeFile('src/popup.ts')]
    const k = run({ files, contents: { 'manifest.json': JSON.stringify({ manifest_version: 3, name: 'Tab tidy' }) } })
    expect(k.id).toBe('browser-extension')
  })

  it('recognises mobile apps, bots, games and desktop apps', () => {
    expect(run({ files: [makeFile('lib/main.dart')], manifests: manifests({ dependencies: deps('pub', ['flutter']) }) }).id).toBe('mobile-app')
    expect(run({ files: [makeFile('index.js')], manifests: manifests({ dependencies: deps('npm', ['discord.js']) }) }).id).toBe('bot')
    expect(run({ files: [makeFile('project.godot', { kind: 'config' }), makeFile('player.gd')] }).id).toBe('game')
    expect(run({ files: [makeFile('main.js')], manifests: manifests({ dependencies: deps('npm', ['electron'], true) }) }).id).toBe('desktop-app')
  })

  it('tells data analysis apart from machine learning', () => {
    const notebooks = [makeFile('analysis.ipynb'), makeFile('cleaning.ipynb'), makeFile('charts.ipynb')]
    expect(run({ files: notebooks, manifests: manifests({ dependencies: deps('pypi', ['pandas', 'matplotlib']) }) }).id).toBe('data-science')
    const ml = [makeFile('train.py', { language: 'Python' }), makeFile('model.py', { language: 'Python' })]
    expect(run({ files: ml, manifests: manifests({ dependencies: deps('pypi', ['torch', 'numpy']) }) }).id).toBe('ml-model')
  })

  it('recognises infrastructure, documentation and monorepos', () => {
    const tf = ['main.tf', 'variables.tf', 'outputs.tf'].map((p) => makeFile(p, { kind: 'config', role: 'config', layer: 'infra' }))
    expect(run({ files: tf }).id).toBe('infrastructure')

    const docs = Array.from({ length: 12 }, (_, i) => makeFile(`chapter-${i}.md`, { kind: 'docs', role: 'docs', layer: 'docs' }))
    expect(run({ files: docs }).id).toBe('documentation')

    const mono = ['a', 'b', 'c'].map((n) => makeFile(`packages/${n}/package.json`, { kind: 'config', role: 'config', layer: 'config' }))
    expect(run({ files: mono, manifests: manifests({ workspaces: ['packages/*'] }) }).id).toBe('monorepo')
  })

  it('prefers a website when a static-site generator is used', () => {
    const files = [makeFile('src/pages/index.astro', { role: 'page', layer: 'ui' })]
    const k = run({ files, manifests: manifests({ dependencies: deps('npm', ['astro', 'react']) }) })
    expect(k.id).toBe('website')
    expect(k.reasons[0]).toMatch(/Astro/)
  })

  it('tells Go libraries apart from Go command-line tools', () => {
    const lib = run({
      files: [makeFile('go.mod', { kind: 'config' }), makeFile('gin.go', { language: 'Go' })],
      contents: { 'gin.go': 'package gin\n' },
    })
    expect(lib.id).toBe('library')
    const cli = run({
      files: [makeFile('go.mod', { kind: 'config' }), makeFile('cmd/tool/main.go', { language: 'Go' })],
      contents: { 'cmd/tool/main.go': 'package main\nfunc main() {}\n' },
    })
    expect(cli.id).toBe('cli-tool')
  })

  it('treats a framework’s own repository as a library, not an app that uses it', () => {
    const files = [
      makeFile('lib/express.js'),
      makeFile('lib/router.js'),
      makeFile('examples/hello/index.js', { role: 'route', layer: 'docs', routes: [{ method: 'GET', path: '/', line: 1 }] }),
    ]
    const k = run({
      files,
      repoName: 'express',
      description: 'Fast, unopinionated, minimalist web framework for node.',
      techStack: [tech('express', 'Express')],
      manifests: manifests({ projectNames: ['express'] }),
    })
    expect(k.id).toBe('library')
    expect(k.reasons.join(' ')).toMatch(/framework/)
  })

  it('uses the technology list even when dependency names are unusual', () => {
    const k = run({ files: [makeFile('src/App.vue', { role: 'component', layer: 'ui' })], techStack: [tech('vue', 'Vue')] })
    expect(k.id).toBe('web-app')
  })

  it('falls back to a general description when there is no evidence', () => {
    const k = run({ files: [makeFile('notes.txt', { kind: 'docs' }), makeFile('a.bin', { kind: 'other' })] })
    expect(k.id).toBe('unknown')
    expect(k.label).toBe('Software project')
    expect(k.reasons).toHaveLength(1)
  })

  it('never throws on malformed manifests', () => {
    expect(() => run({ files: [], contents: { 'package.json': '{oops', 'manifest.json': 'null' } })).not.toThrow()
  })
})
