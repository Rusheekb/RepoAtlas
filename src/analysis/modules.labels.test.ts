/**
 * Module labels must agree with what the folders really contain (uses the real folder knowledge base).
 */
import { describe, expect, it } from 'vitest'
import type { AnalyzedFile } from '@/core/types'
import { buildModules } from './modules'
import { makeFile } from './structure/testkit'

function mod(files: AnalyzedFile[], id: string, options: Parameters<typeof buildModules>[1] = {}) {
  const m = buildModules(files, options).modules.find((x) => x.id === id)
  if (!m) throw new Error(`no module ${id}`)
  return m
}

const code = (path: string, lines = 120, extra: Partial<AnalyzedFile> = {}) => makeFile(path, { lines, ...extra })
const doc = (path: string, lines: number) => makeFile(path, { kind: 'docs', role: 'docs', layer: 'docs', lines })

describe('folder names are checked against their contents', () => {
  // Enough top-level parts that the map isn't opened up further.
  const app = [
    code('README.md', 20, { kind: 'docs', role: 'docs', layer: 'docs' }),
    ...['app', 'core', 'api', 'models', 'services', 'ui'].flatMap((d) => [code(`${d}/main.py`, 400), code(`${d}/extra.py`, 300)]),
  ]

  it('doesn’t call hand-written formatters "build output" (httpie/output)', () => {
    const files = [...app, ...['colors', 'streams', 'writer', 'processing'].map((n) => code(`output/${n}.py`, 150))]
    const m = mod(files, 'output')
    expect(m.role).not.toBe('Build output')
    expect(m.layer).toBe('logic')
    expect(m.description).not.toMatch(/produced automatically/)
  })

  it('still calls real build output "build output"', () => {
    const files = [...app, ...['a', 'b', 'c'].map((n) => makeFile(`dist/${n}.js`, { kind: 'generated', role: 'other', layer: 'other', lines: 400 }))]
    expect(mod(files, 'dist').role).toBe('Build output')
  })

  it('needs a Chart.yaml for "Helm charts" and a game engine for "Game scenes"', () => {
    const files = [...app, ...['bar', 'line', 'radar'].map((n) => code(`charts/charts.${n}.ts`, 150)), ...['Scene', 'Renderer'].map((n) => code(`scene/${n}.ts`, 150))]
    expect(mod(files, 'charts').role).not.toBe('Helm charts')
    expect(mod(files, 'scene').role).not.toBe('Game scenes')

    const helm = [...app, makeFile('charts/Chart.yaml', { kind: 'config', role: 'config', layer: 'infra', lines: 10 }), makeFile('charts/templates/deploy.yaml', { kind: 'config', role: 'container', layer: 'infra', lines: 40 })]
    expect(mod(helm, 'charts').role).toBe('Helm charts')
    const game = [...app, ...['Level1', 'Level2'].map((n) => code(`scenes/${n}.gd`, 80))]
    expect(mod(game, 'scenes', { techIds: new Set(['godot']) }).role).toBe('Game scenes')
  })

  it('only calls renderer/ an app window in desktop apps', () => {
    const files = [...app, ...['canvas', 'shapes'].map((n) => code(`renderer/${n}.ts`, 150, { layer: 'ui' }))]
    expect(mod(files, 'renderer').role).not.toBe('App window')
    expect(mod(files, 'renderer', { techIds: ['electron'] }).role).toBe('App window')
  })

  it('only uses Go’s pkg/ meaning for Go code', () => {
    const files = [...app, makeFile('pkg/brew/formula.rb', { lines: 23 }), makeFile('pkg/windows/Manifest.xml', { kind: 'data', role: 'other', layer: 'data', lines: 28 })]
    expect(mod(files, 'pkg').role).not.toBe('Reusable packages')
  })
})

describe('Django apps', () => {
  const djangoApp = (name: string) => [
    makeFile(`${name}/__init__.py`, { lines: 0 }),
    makeFile(`${name}/apps.py`, { role: 'config', layer: 'config', lines: 6 }),
    makeFile(`${name}/admin.py`, { role: 'config', layer: 'ui', lines: 100 }),
    makeFile(`${name}/models.py`, { role: 'model', layer: 'data', lines: 170 }),
    makeFile(`${name}/views.py`, { role: 'controller', layer: 'api', lines: 420 }),
    makeFile(`${name}/urls.py`, { role: 'route', layer: 'api', lines: 16 }),
    makeFile(`${name}/forms.py`, { role: 'schema', layer: 'ui', lines: 190 }),
    makeFile(`${name}/migrations/0001_initial.py`, { role: 'migration', layer: 'data', lines: 188 }),
    makeFile(`${name}/migrations/0002_more.py`, { role: 'migration', layer: 'data', lines: 17 }),
    makeFile(`${name}/migrations/0003_fix.py`, { role: 'migration', layer: 'data', lines: 12 }),
    makeFile(`${name}/migrations/__init__.py`, { role: 'migration', layer: 'data', lines: 0 }),
    makeFile(`${name}/tests/test_views.py`, { kind: 'test', role: 'test', layer: 'test', lines: 600 }),
    makeFile(`${name}/fixtures/sample.json`, { kind: 'test', role: 'fixture', layer: 'test', lines: 50_000 }),
  ]

  it('are described as features of the site, not as "database change steps" or tests', () => {
    const files = [code('manage.py', 20, { role: 'entry' }), ...djangoApp('fundraising'), ...djangoApp('members'), ...djangoApp('dashboard')]
    const m = mod(files, 'fundraising')
    expect(m.role).not.toBe('Database change steps')
    expect(m.role).toBe('Website feature')
    expect(m.description).toMatch(/self-contained feature of the website, with its own stored information, pages, forms, web addresses and admin screens/)
    // One huge test fixture must not turn the app into a test folder.
    expect(m.layer).not.toBe('test')
  })

  it('keep a matching folder name when there is one', () => {
    const files = [code('manage.py', 20, { role: 'entry' }), ...djangoApp('blog'), ...djangoApp('members')]
    expect(mod(files, 'blog').role).not.toBe('Website feature')
  })
})

describe('paperwork doesn’t decide what a package is', () => {
  it('a package with a long CHANGELOG is still code (changesets packages/read)', () => {
    const pkg = (name: string) => [
      doc(`packages/${name}/CHANGELOG.md`, 494),
      doc(`packages/${name}/README.md`, 14),
      makeFile(`packages/${name}/package.json`, { kind: 'config', role: 'config', layer: 'config', lines: 31 }),
      makeFile(`packages/${name}/src/index.test.ts`, { kind: 'test', role: 'test', layer: 'test', lines: 248 }),
      code(`packages/${name}/src/index.ts`, 86),
    ]
    const files = ['read', 'write', 'cli', 'git', 'types', 'config', 'apply', 'assemble'].flatMap(pkg)
    const m = mod(files, 'packages/read')
    expect(m.layer).toBe('logic')
    expect(m.role).not.toBe('Documents')
    expect(m.description).not.toMatch(/documentation/)
  })

  it('a crate with licence files and an example is still code (ripgrep crates/grep)', () => {
    const crate = (name: string) => [
      doc(`crates/${name}/COPYING`, 3),
      doc(`crates/${name}/LICENSE-MIT`, 21),
      doc(`crates/${name}/README.md`, 34),
      makeFile(`crates/${name}/UNLICENSE`, { kind: 'other', role: 'other', layer: 'other', lines: 24 }),
      makeFile(`crates/${name}/Cargo.toml`, { kind: 'config', role: 'config', layer: 'config', lines: 33 }),
      makeFile(`crates/${name}/examples/simple.rs`, { role: 'entry', layer: 'docs', lines: 69 }),
      code(`crates/${name}/src/lib.rs`, 21, { role: 'entry' }),
    ]
    const m = mod(['grep', 'cli', 'regex', 'ignore', 'printer', 'searcher', 'matcher'].flatMap(crate), 'crates/grep')
    expect(m.layer).toBe('logic')
  })

  it('Maven and Gradle wrappers don’t make a Spring guide folder "build files"', () => {
    const guide = (dir: string) => [
      makeFile(`${dir}/mvnw`, { kind: 'script', role: 'script', layer: 'infra', lines: 300 }),
      makeFile(`${dir}/gradlew`, { kind: 'script', role: 'script', layer: 'infra', lines: 250 }),
      makeFile(`${dir}/pom.xml`, { kind: 'config', role: 'build', layer: 'infra', lines: 60 }),
      code(`${dir}/src/main/java/com/example/restservice/RestServiceApplication.java`, 12, { role: 'entry', layer: 'api' }),
      code(`${dir}/src/main/java/com/example/restservice/GreetingController.java`, 20, { role: 'controller', layer: 'api' }),
    ]
    const m = mod(['complete', 'initial', 'complete-kotlin', 'initial-kotlin', 'docs-a', 'docs-b'].flatMap(guide), 'complete')
    expect(m.layer).toBe('api')
    expect(m.role).not.toBe('Build files')
  })

  it('a long test file next to a small package doesn’t make it "tests" (changesets packages/config)', () => {
    const pkg = (name: string) => [
      makeFile(`packages/${name}/src/config.ts`, { role: 'config', layer: 'config', lines: 211 }),
      makeFile(`packages/${name}/src/rules.ts`, { role: 'config', layer: 'config', lines: 206 }),
      makeFile(`packages/${name}/src/utils.ts`, { role: 'util', layer: 'logic', lines: 41 }),
      makeFile(`packages/${name}/src/parse.test.ts`, { kind: 'test', role: 'test', layer: 'test', lines: 716 }),
      makeFile(`packages/${name}/schema.json`, { kind: 'data', role: 'schema', layer: 'data', lines: 252 }),
    ]
    const m = mod(['config', 'cli', 'read', 'write', 'git', 'types', 'apply', 'assemble'].flatMap(pkg), 'packages/config')
    expect(m.layer).not.toBe('test')
  })

  it('one front-door file doesn’t make a package "Starting points"', () => {
    const crate = (name: string) => [code(`crates/${name}/src/lib.rs`, 60, { role: 'entry' }), code(`crates/${name}/src/util.rs`, 40)]
    const m = mod(['grep', 'cli', 'regex', 'ignore', 'printer', 'searcher', 'matcher'].flatMap(crate), 'crates/grep')
    expect(m.role).not.toBe('Starting points')
  })
})
