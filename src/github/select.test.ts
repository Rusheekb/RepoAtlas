import { ANALYSIS_DEPTHS } from '@/core/labels'
import type { SkipReason, TreeEntry } from '@/core/types'
import { MAX_FILE_BYTES, selectFilesToFetch, skipReasonFor } from './select'

const entry = (path: string, size = 1000): TreeEntry => ({ path, size, sha: `sha-${path}` })
const tree = (...items: (string | [string, number])[]): TreeEntry[] =>
  items.map((i) => (typeof i === 'string' ? entry(i) : entry(i[0], i[1])))

function reasonOf(result: ReturnType<typeof selectFilesToFetch>, path: string): SkipReason | 'fetch' | undefined {
  if (result.fetch.includes(path)) return 'fetch'
  return result.skipped.find((s) => s.path === path)?.reason
}

describe('skipReasonFor', () => {
  const cases: [string, number, SkipReason | null][] = [
    ['src/index.ts', 100, null],
    ['assets/logo.png', 100, 'binary'],
    ['assets/logo.SVG', 100, 'binary'],
    ['public/fonts/Inter.woff2', 100, 'binary'],
    ['docs/manual.pdf', 100, 'binary'],
    ['models/net.onnx', 100, 'binary'],
    ['data/train.parquet', 100, 'binary'],
    ['lib/native.so', 100, 'binary'],
    ['.DS_Store', 100, 'binary'],
    ['app/__pycache__/x.cpython-311.pyc', 100, 'generated'],
    ['package-lock.json', 100, 'lockfile'],
    ['yarn.lock', 100, 'lockfile'],
    ['pnpm-lock.yaml', 100, 'lockfile'],
    ['Cargo.lock', 100, 'lockfile'],
    ['go.sum', 100, 'lockfile'],
    ['Gemfile.lock', 100, 'lockfile'],
    ['poetry.lock', 100, 'lockfile'],
    ['bun.lockb', 100, 'lockfile'],
    ['uv.lock', 100, 'lockfile'],
    ['node_modules/react/index.js', 100, 'vendored'],
    ['packages/app/node_modules/x/y.js', 100, 'vendored'],
    ['vendor/github.com/pkg/errors/errors.go', 100, 'vendored'],
    ['third_party/zlib/zlib.c', 100, 'vendored'],
    ['.venv/lib/site.py', 100, 'vendored'],
    ['dist/bundle.js', 100, 'generated'],
    ['build/output.js', 100, 'generated'],
    ['out/main.js', 100, 'generated'],
    ['.next/server/page.js', 100, 'generated'],
    ['target/debug/app.d', 100, 'generated'],
    ['coverage/lcov.info', 100, 'generated'],
    ['.git/config', 100, 'generated'],
    ['MyApp/bin/Debug/app.deps.json', 100, 'generated'],
    ['static/jquery.min.js', 100, 'generated'],
    ['static/site.min.css', 100, 'generated'],
    ['static/app.js.map', 100, 'generated'],
    ['api/v1/service.pb.go', 100, 'generated'],
    ['proto/service_pb2.py', 100, 'generated'],
    ['src/schema.generated.ts', 100, 'generated'],
    ['src/__snapshots__/a.test.ts.snap', 100, 'generated'],
    ['src/huge.ts', MAX_FILE_BYTES + 1, 'too-large'],
    ['src/just-fits.ts', MAX_FILE_BYTES, null],
    ['bin/cli.js', 100, null],
    ['.github/workflows/ci.yml', 100, null],
    ['src/constructor.js', 100, null],
  ]
  it.each(cases)('%s (%i bytes) → %s', (path, size, expected) => {
    expect(skipReasonFor(entry(path, size))).toBe(expected)
  })
})

describe('folders that are only sometimes build output (build, out, target, obj, coverage)', () => {
  const t = tree(
    // pypa/build: the project's own package is called "build".
    'pyproject.toml',
    'src/build/__init__.py',
    'src/build/_builder.py',
    'build/lib/build/__init__.py',
    // Go and Java packages that happen to use these names.
    'go.mod',
    'internal/build/build.go',
    'src/main/java/org/acme/aop/target/Advice.java',
    'src/coverage/report.py',
    // A top-level folder that is a real Python package.
    'coverage/__init__.py',
    'coverage/control.py',
    // Real output, next to the settings file of the tool that writes it.
    'crates/app/Cargo.toml',
    'crates/app/target/debug/app.d',
    'services/api/pom.xml',
    'services/api/target/classes/App.class.txt',
    'web/package.json',
    'web/build/static/main.js',
    'web/coverage/lcov.info',
    'android/app/build.gradle',
    'android/app/build/intermediates/R.txt',
    'src/MyApp/MyApp.csproj',
    'src/MyApp/obj/project.assets.json',
    'out/main.js',
  )
  const result = selectFilesToFetch(t, 'deep')

  it('downloads real code in folders with those names', () => {
    for (const p of [
      'src/build/__init__.py',
      'src/build/_builder.py',
      'internal/build/build.go',
      'src/main/java/org/acme/aop/target/Advice.java',
      'src/coverage/report.py',
      'coverage/__init__.py',
      'coverage/control.py',
    ]) {
      expect(reasonOf(result, p), p).toBe('fetch')
    }
  })

  it('still skips them when they are output: at the top level, or next to the tool’s settings file', () => {
    for (const p of [
      'build/lib/build/__init__.py',
      'crates/app/target/debug/app.d',
      'services/api/target/classes/App.class.txt',
      'web/build/static/main.js',
      'web/coverage/lcov.info',
      'android/app/build/intermediates/R.txt',
      'src/MyApp/obj/project.assets.json',
      'out/main.js',
    ]) {
      expect(reasonOf(result, p), p).toBe('generated')
    }
  })

  it('without the rest of the tree, only treats them as output at the top level', () => {
    expect(skipReasonFor(entry('build/x.js'))).toBe('generated')
    expect(skipReasonFor(entry('src/build/x.py'))).toBeNull()
    expect(skipReasonFor(entry('target/release/x.d'))).toBe('generated')
    expect(skipReasonFor(entry('pkg/target/x.java'))).toBeNull()
  })
})

describe('selectFilesToFetch priorities', () => {
  const repo = tree(
    'tests/test_app.py',
    'src/widgets/b.py',
    'src/widgets/a.py',
    'docs/guide.md',
    'CHANGELOG.md',
    'src/app/main.py',
    'packages/core/package.json',
    'package.json',
    'Dockerfile',
    '.github/workflows/ci.yml',
    'CONTRIBUTING.md',
    'README.md',
    'ARCHITECTURE.md',
    'tsconfig.json',
    'src/index.ts',
    'main.go',
    'src/utils/helpers.py',
    'assets/logo.png',
    'yarn.lock',
  )
  const result = selectFilesToFetch(repo, 'standard')
  const order = result.fetch

  it('puts the root README, architecture and contributing docs first', () => {
    expect(order.slice(0, 3)).toEqual(['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md'])
  })

  it('then manifests and key config, nearest the root first', () => {
    const manifests = ['package.json', 'Dockerfile', 'tsconfig.json', '.github/workflows/ci.yml', 'packages/core/package.json']
    const idx = manifests.map((m) => order.indexOf(m))
    expect(Math.min(...idx)).toBe(3)
    expect(Math.max(...idx)).toBe(3 + manifests.length - 1)
    expect(order.indexOf('package.json')).toBeLessThan(order.indexOf('packages/core/package.json'))
    expect(order.indexOf('tsconfig.json')).toBeLessThan(order.indexOf('packages/core/package.json'))
  })

  it('then entry points, then other source, with tests and docs last', () => {
    const firstSource = order.indexOf('src/widgets/a.py')
    for (const e of ['main.go', 'src/index.ts', 'src/app/main.py']) {
      expect(order.indexOf(e)).toBeGreaterThan(order.indexOf('packages/core/package.json'))
      expect(order.indexOf(e)).toBeLessThan(firstSource)
    }
    const lastSource = Math.max(...['src/widgets/a.py', 'src/widgets/b.py', 'src/utils/helpers.py'].map((p) => order.indexOf(p)))
    expect(order.indexOf('tests/test_app.py')).toBeGreaterThan(lastSource)
    expect(order.indexOf('docs/guide.md')).toBeGreaterThan(order.indexOf('tests/test_app.py'))
    expect(order.indexOf('CHANGELOG.md')).toBeGreaterThan(order.indexOf('tests/test_app.py'))
  })

  it('skips binaries and lockfiles with reasons', () => {
    expect(reasonOf(result, 'assets/logo.png')).toBe('binary')
    expect(reasonOf(result, 'yarn.lock')).toBe('lockfile')
  })

  it('accounts for every entry exactly once', () => {
    const all = [...result.fetch, ...result.skipped.map((s) => s.path)].sort()
    expect(all).toEqual(repo.map((e) => e.path).sort())
  })

  it('treats translated READMEs and fixtures as low priority', () => {
    const r = selectFilesToFetch(
      tree('README.md', 'README.zh-CN.md', 'src/a.ts', 'test/fixtures/package.json', 'examples/demo/main.js', 'package.json'),
      'standard',
    ).fetch
    expect(r[0]).toBe('README.md')
    expect(r[1]).toBe('package.json')
    expect(r.indexOf('src/a.ts')).toBeLessThan(r.indexOf('examples/demo/main.js'))
    expect(r.indexOf('examples/demo/main.js')).toBeLessThan(r.indexOf('test/fixtures/package.json'))
    expect(r.indexOf('test/fixtures/package.json')).toBeLessThan(r.indexOf('README.zh-CN.md'))
  })

  it('recognizes common entry points in many languages', () => {
    const r = selectFilesToFetch(
      tree(
        'lib/zzz.rs',
        'src/main.rs',
        'cmd/server/main.go',
        'internal/thing/thing.go',
        'manage.py',
        'MyApp/Program.cs',
        'src/main/java/com/acme/app/DemoApplication.java',
        'src/main/java/com/acme/app/util/Strings.java',
        'web/index.html',
      ),
      'standard',
    ).fetch
    const util = r.indexOf('src/main/java/com/acme/app/util/Strings.java')
    for (const e of ['src/main.rs', 'cmd/server/main.go', 'manage.py', 'MyApp/Program.cs', 'src/main/java/com/acme/app/DemoApplication.java', 'web/index.html']) {
      expect(r.indexOf(e)).toBeLessThan(r.indexOf('lib/zzz.rs'))
      expect(r.indexOf(e)).toBeLessThan(util)
    }
  })
})

describe('selectFilesToFetch spreading', () => {
  it('represents every folder before going deep into any one of them', () => {
    const items: TreeEntry[] = []
    for (let i = 0; i < 200; i++) items.push(entry(`src/components/C${String(i).padStart(3, '0')}.tsx`, 500 + i))
    for (let i = 0; i < 5; i++) items.push(entry(`src/utils/u${i}.ts`, 800))
    for (let i = 0; i < 5; i++) items.push(entry(`server/routes/r${i}.js`, 800))
    for (let i = 0; i < 5; i++) items.push(entry(`lib/deep/er/still/x${i}.py`, 800))
    items.push(entry('scripts/release.sh', 300))
    const { fetch } = selectFilesToFetch(items, 'standard')
    const first20 = fetch.slice(0, 20)
    for (const folder of ['src/components/', 'src/utils/', 'server/routes/', 'lib/deep/er/still/', 'scripts/']) {
      expect(first20.some((p) => p.startsWith(folder))).toBe(true)
    }
    // Smaller files first inside a folder.
    expect(fetch.indexOf('src/components/C000.tsx')).toBeLessThan(fetch.indexOf('src/components/C001.tsx'))
  })

  it('takes turns between top-level folders', () => {
    const items: TreeEntry[] = []
    for (const top of ['alpha', 'beta', 'gamma']) for (let i = 0; i < 30; i++) items.push(entry(`${top}/f${i}.ts`, 100 + i))
    const { fetch } = selectFilesToFetch(items, 'standard')
    const tops = fetch.slice(0, 9).map((p) => p.split('/')[0])
    expect(new Set(tops.slice(0, 3)).size).toBe(3)
    expect(tops.filter((t) => t === 'alpha')).toHaveLength(3)
  })
})

describe('selectFilesToFetch limits', () => {
  it('caps the number of files by depth and marks the rest "limit"', () => {
    const items = Array.from({ length: 500 }, (_, i) => entry(`src/m${i % 20}/f${i}.ts`, 2000))
    const quick = selectFilesToFetch(items, 'quick')
    expect(quick.fetch).toHaveLength(ANALYSIS_DEPTHS.quick.maxFiles)
    expect(quick.skipped.filter((s) => s.reason === 'limit')).toHaveLength(500 - ANALYSIS_DEPTHS.quick.maxFiles)
    expect(selectFilesToFetch(items, 'standard').fetch).toHaveLength(ANALYSIS_DEPTHS.standard.maxFiles)
    expect(selectFilesToFetch(items, 'deep').fetch).toHaveLength(500)
  })

  it('respects the total byte budget but still fits smaller files', () => {
    const big = 400 * 1024
    const items = [
      ...Array.from({ length: 10 }, (_, i) => entry(`a/big${i}.ts`, big)),
      ...Array.from({ length: 10 }, (_, i) => entry(`b/small${i}.ts`, 100)),
    ]
    const { fetch, skipped } = selectFilesToFetch(items, 'quick')
    const sizes = new Map(items.map((e) => [e.path, e.size]))
    const total = fetch.reduce((n, p) => n + (sizes.get(p) ?? 0), 0)
    expect(total).toBeLessThanOrEqual(ANALYSIS_DEPTHS.quick.maxTotalBytes)
    expect(fetch.filter((p) => p.startsWith('b/'))).toHaveLength(10)
    expect(skipped.some((s) => s.reason === 'limit' && s.path.startsWith('a/'))).toBe(true)
  })

  it('lets empty files through without using up the budget', () => {
    const items = [
      ...Array.from({ length: 200 }, (_, i) => entry(`pkg${i}/__init__.py`, 0)),
      ...Array.from({ length: 200 }, (_, i) => entry(`pkg${i}/core.py`, 1000)),
    ]
    const { fetch } = selectFilesToFetch(items, 'quick')
    expect(fetch.filter((p) => p.endsWith('core.py'))).toHaveLength(ANALYSIS_DEPTHS.quick.maxFiles)
    expect(fetch.filter((p) => p.endsWith('__init__.py'))).toHaveLength(200)
  })

  it('stops CI workflows and package manifests from crowding out code', () => {
    const items = [
      ...Array.from({ length: 30 }, (_, i) => entry(`.github/workflows/w${i}.yml`, 500)),
      ...Array.from({ length: 300 }, (_, i) => entry(`packages/p${i}/package.json`, 500)),
      ...Array.from({ length: 300 }, (_, i) => entry(`packages/p${i}/src/thing.ts`, 500)),
    ]
    const { fetch } = selectFilesToFetch(items, 'quick')
    expect(fetch.filter((p) => p.startsWith('.github/workflows/')).length).toBeLessThanOrEqual(6)
    expect(fetch.filter((p) => p.endsWith('package.json')).length).toBeLessThanOrEqual(Math.floor(ANALYSIS_DEPTHS.quick.maxFiles * 0.3))
    expect(fetch.filter((p) => p.endsWith('thing.ts')).length).toBeGreaterThan(50)
  })

  it('ignores duplicate paths', () => {
    const { fetch, skipped } = selectFilesToFetch([entry('a.ts'), entry('a.ts')], 'quick')
    expect(fetch).toEqual(['a.ts'])
    expect(skipped).toEqual([])
  })

  it('is fast on very large trees', () => {
    const items: TreeEntry[] = []
    for (let i = 0; i < 60_000; i++) {
      items.push(entry(`top${i % 25}/mid${i % 300}/leaf${i % 7}/file${i}.${['ts', 'py', 'go', 'md', 'png', 'json'][i % 6]}`, 100 + (i % 5000)))
    }
    const t0 = performance.now()
    const { fetch, skipped } = selectFilesToFetch(items, 'deep')
    const ms = performance.now() - t0
    expect(fetch).toHaveLength(ANALYSIS_DEPTHS.deep.maxFiles)
    expect(fetch.length + skipped.length).toBe(items.length)
    expect(ms).toBeLessThan(3000)
  })
})
