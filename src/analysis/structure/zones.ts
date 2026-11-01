/**
 * "Zones" are areas of a repository whose folder names say what everything inside them is for, regardless of the
 * individual file: test folders, example folders, docs, vendored copies of other people's code, generated output,
 * deployment setup and chore scripts. Several analysis steps (classification, entry points, project kind, tours)
 * use them to tell the project's real code apart from the supporting material around it.
 */
export type Zone = 'test' | 'example' | 'docs' | 'vendor' | 'generated' | 'infra' | 'scripts'

const TEST_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  '__test__',
  'spec',
  'specs',
  'e2e',
  'testing',
  'test-utils',
  'testutils',
  'test_utils',
  'testdata',
  'test-data',
  'test_data',
  'fixtures',
  '__fixtures__',
  '__mocks__',
  'mocks',
  '__snapshots__',
  'cypress',
  'playwright',
  'integration-tests',
  'integration_tests',
  'unittests',
  'bench',
  'benches',
  'benchmark',
  'benchmarks',
])

const EXAMPLE_DIRS = new Set([
  'example',
  'examples',
  'demo',
  'demos',
  'sample',
  'samples',
  'playground',
  'playgrounds',
  'sandbox',
  'tutorial',
  'tutorials',
  'showcase',
])

const DOCS_DIRS = new Set(['docs', 'doc', 'documentation', 'guides', 'guide', 'wiki', 'manual', 'handbook', 'man', '_docs'])

const VENDOR_DIRS = new Set([
  'vendor',
  'vendors',
  'third_party',
  'third-party',
  'thirdparty',
  'external',
  'externals',
  'node_modules',
  'bower_components',
  'jspm_packages',
  'deps',
  '_vendor',
])

const GENERATED_DIRS = new Set([
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  'target',
  'coverage',
  '__pycache__',
  '.cache',
  '__generated__',
  'generated',
  'gen',
  '.venv',
  'venv',
  'site-packages',
])

const INFRA_DIRS = new Set([
  '.github',
  '.circleci',
  '.gitlab',
  '.buildkite',
  '.devcontainer',
  '.husky',
  'deploy',
  'deployment',
  'deployments',
  'infra',
  'infrastructure',
  'terraform',
  'k8s',
  'kubernetes',
  'helm',
  'docker',
  'ansible',
  'devops',
  'pulumi',
  '.ci',
])

const SCRIPT_DIRS = new Set(['scripts', 'script', 'dev-scripts'])
/** Only mean "chore scripts" at the top level (src/tools/ is often real code). */
const TOP_SCRIPT_DIRS = new Set(['tools', 'tooling', 'hack'])
/** Only mean "deployment setup" at the top level (src/components/charts/ is UI code). */
const TOP_INFRA_DIRS = new Set(['charts', 'ops', 'ci'])

/** Folder names of a path, lower-cased (the file name itself is excluded). */
export function folderSegments(path: string): string[] {
  const parts = path.toLowerCase().split('/')
  parts.pop()
  return parts
}

/**
 * Every zone a path sits in. Order of the result: nearest folder first.
 * "build" and "gen" only count as generated output at the top level (src/build/ is often real code).
 */
export function zonesOf(path: string): Zone[] {
  const segs = folderSegments(path)
  const out: Zone[] = []
  for (let i = segs.length - 1; i >= 0; i--) {
    const z = zoneOfSegment(segs[i], i)
    if (z && !out.includes(z)) out.push(z)
  }
  return out
}

function zoneOfSegment(seg: string, depth: number): Zone | null {
  if (TEST_DIRS.has(seg)) return 'test'
  if (EXAMPLE_DIRS.has(seg)) return 'example'
  if (DOCS_DIRS.has(seg)) return 'docs'
  if (VENDOR_DIRS.has(seg)) return 'vendor'
  if (GENERATED_DIRS.has(seg)) {
    if ((seg === 'build' || seg === 'gen' || seg === 'out' || seg === 'target') && depth > 0) return null
    return 'generated'
  }
  if (INFRA_DIRS.has(seg) || (depth === 0 && TOP_INFRA_DIRS.has(seg))) return 'infra'
  if (SCRIPT_DIRS.has(seg) || (depth === 0 && TOP_SCRIPT_DIRS.has(seg))) return 'scripts'
  return null
}

export function inZone(path: string, zone: Zone): boolean {
  return zonesOf(path).includes(zone)
}

/**
 * Whether a path is supporting material rather than the project's own running code
 * (tests, examples, docs, vendored or generated files).
 */
export function isPeripheral(path: string): boolean {
  const z = zonesOf(path)
  return z.includes('test') || z.includes('example') || z.includes('docs') || z.includes('vendor') || z.includes('generated')
}

/** Test files by name alone (any folder): foo.test.ts, foo_test.go, test_foo.py, FooTest.java, foo_spec.rb … */
export function isTestFileName(name: string): boolean {
  const lower = name.toLowerCase()
  if (/\.(test|spec|e2e|cy)\.[a-z0-9]+$/.test(lower)) return true
  if (/_test\.(go|py|exs|dart|cc|cpp|c|rs|lua|r|sh)$/.test(lower)) return true
  if (/^test_.+\.py$/.test(lower)) return true
  if (/_spec\.(rb|lua|js|ts)$/.test(lower)) return true
  if (/[a-z0-9_](Test|Tests|Spec|IT|TestCase)\.(java|kt|kts|scala|groovy|cs|php|swift|m)$/.test(name)) return true
  if (/^test[A-Z_].*\.(java|kt|php|swift|m)$/.test(name)) return true
  if (lower === 'conftest.py') return true
  return false
}
