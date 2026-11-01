import type { LanguageStat, TechItem } from '@/core/types'
import { basename, depthOf } from '@/core/paths'
import type { DependencyRef, Ecosystem, ManifestInfo, TechKnowledgeEntry } from './types'
import { TECH_CATALOG } from './tech'
import { LANGUAGE_INFO, NON_CODE_LANGUAGES, languageSlug, languageTechId } from './catalog/languages'
import { isPeripheralPath } from './parsers/util'

export interface DetectTechInput {
  paths: string[]
  files: Record<string, string>
  manifests: ManifestInfo
  languages: LanguageStat[]
  /** External package names actually imported by source files (normalized), with counts. */
  importedPackages?: { name: string; count: number }[]
}

const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi', 'go', 'cargo', 'gem', 'composer', 'maven', 'nuget', 'pub', 'cocoapods', 'swift', 'conda']
const IMPORTANCE_RANK: Record<TechItem['importance'], number> = { core: 0, supporting: 1, tooling: 2 }
/** Languages below this share of the code are not listed on their own. */
const LANGUAGE_THRESHOLD = 5
/** Undeclared packages must be imported by at least this many files to count (see detectTechStack step 2). */
const UNDECLARED_IMPORT_MIN_FILES = 3
const MAX_EVIDENCE = 6

// ─────────────────────────────────────────────────────────────────────────────
// Lookup indexes (built once, lazily)
// ─────────────────────────────────────────────────────────────────────────────

interface PackageIndex {
  exact: Map<string, TechKnowledgeEntry[]>
  /** Prefix patterns ("@radix-ui/" from "@radix-ui/*"), longest first. */
  prefixes: { prefix: string; entry: TechKnowledgeEntry }[]
  imports: Map<string, TechKnowledgeEntry[]>
}

interface FileIndex {
  exact: Map<string, TechKnowledgeEntry[]>
  suffix: Map<string, TechKnowledgeEntry[]>
  prefix: { prefix: string; entry: TechKnowledgeEntry }[]
  globs: { re: RegExp; entry: TechKnowledgeEntry }[]
  pathPatterns: { re: RegExp; entry: TechKnowledgeEntry }[]
  pathQuick: RegExp | null
}

interface Index {
  byId: Map<string, TechKnowledgeEntry>
  packages: Map<Ecosystem, PackageIndex>
  files: FileIndex
}

let INDEX: Index | null = null

function getIndex(): Index {
  INDEX ??= buildIndex()
  return INDEX
}

/** Normalize a package name the way its ecosystem compares names (PEP 503 for Python, "_" = "-" for crates …). */
export function normalizePackageName(ecosystem: Ecosystem, name: string): string {
  const n = name.trim().toLowerCase()
  switch (ecosystem) {
    case 'pypi':
    case 'conda':
      return n.replace(/[-_.]+/g, '-')
    case 'cargo':
      return n.replace(/_/g, '-')
    default:
      return n
  }
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (!list) map.set(key, [value])
  else if (!list.includes(value)) list.push(value)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function globToRegexBody(glob: string): string {
  return glob
    .split('**')
    .map((part) => part.split('*').map(escapeRegex).join('[^/]*'))
    .join('.*')
}

function buildIndex(): Index {
  const byId = new Map<string, TechKnowledgeEntry>()
  const packages = new Map<Ecosystem, PackageIndex>()
  for (const eco of ECOSYSTEMS) packages.set(eco, { exact: new Map(), prefixes: [], imports: new Map() })
  const files: FileIndex = { exact: new Map(), suffix: new Map(), prefix: [], globs: [], pathPatterns: [], pathQuick: null }

  for (const entry of TECH_CATALOG) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
    for (const [eco, names] of Object.entries(entry.packages ?? {}) as [Ecosystem, string[]][]) {
      const idx = packages.get(eco)
      if (!idx) continue
      for (const raw of names) {
        if (raw.endsWith('*')) idx.prefixes.push({ prefix: normalizePackageName(eco, raw.slice(0, -1)), entry })
        else pushMap(idx.exact, normalizePackageName(eco, raw), entry)
      }
    }
    for (const [eco, names] of Object.entries(entry.imports ?? {}) as [Ecosystem, string[]][]) {
      const idx = packages.get(eco)
      if (!idx) continue
      for (const raw of names) pushMap(idx.imports, normalizePackageName(eco, raw), entry)
    }
    for (const pattern of entry.files ?? []) {
      const p = pattern.toLowerCase()
      if (p.includes('/')) {
        const folder = p.endsWith('/')
        const body = globToRegexBody(folder ? p.slice(0, -1) : p)
        files.pathPatterns.push({ re: new RegExp(folder ? `(^|/)${body}/` : `(^|/)${body}($|/)`), entry })
      } else if (!p.includes('*')) {
        pushMap(files.exact, p, entry)
      } else if (p.startsWith('*') && p.lastIndexOf('*') === 0 && p[1] === '.') {
        pushMap(files.suffix, p.slice(1), entry)
      } else if (p.endsWith('*') && p.indexOf('*') === p.length - 1) {
        files.prefix.push({ prefix: p.slice(0, -1), entry })
      } else {
        files.globs.push({ re: new RegExp(`^${globToRegexBody(p)}$`), entry })
      }
    }
  }
  for (const idx of packages.values()) idx.prefixes.sort((a, b) => b.prefix.length - a.prefix.length)
  if (files.pathPatterns.length > 0) files.pathQuick = new RegExp(files.pathPatterns.map((x) => `(?:${x.re.source})`).join('|'))
  return { byId, packages, files }
}

// ─────────────────────────────────────────────────────────────────────────────
// Package matching
// ─────────────────────────────────────────────────────────────────────────────

/** Shorter and shorter prefixes of a module path: "a.b.c" → ["a.b", "a"], "github.com/x/y/v2" → ["github.com/x/y", "github.com/x"]. */
function truncations(name: string, ecosystem: Ecosystem): string[] {
  const out: string[] = []
  for (let i = name.length - 1; i > 0; i--) {
    const ch = name[i]
    const isSep = ecosystem === 'go' ? ch === '/' : ch === '.' || ch === '/' || ch === '\\' || ch === ':'
    if (!isSep) continue
    const prefix = name.slice(0, i)
    // Go module paths keep at least "host/owner".
    if (ecosystem === 'go' && !prefix.includes('/')) break
    out.push(prefix)
  }
  return out
}

/** Every catalog entry a declared dependency points to (exact names, prefix patterns, Go sub-paths). */
function matchDependency(ecosystem: Ecosystem, name: string): TechKnowledgeEntry[] {
  const { packages } = getIndex()
  const ecos: Ecosystem[] = ecosystem === 'conda' ? ['conda', 'pypi'] : [ecosystem]
  const found: TechKnowledgeEntry[] = []
  const add = (e: TechKnowledgeEntry) => {
    if (!found.includes(e)) found.push(e)
  }
  for (const eco of ecos) {
    const idx = packages.get(eco)
    if (!idx) continue
    const norm = normalizePackageName(eco, name)
    for (const e of idx.exact.get(norm) ?? []) add(e)
    for (const { prefix, entry } of idx.prefixes) if (norm.startsWith(prefix)) add(entry)
    if (found.length === 0 && (eco === 'go' || eco === 'maven')) {
      for (const t of truncations(norm, eco)) {
        const hit = idx.exact.get(t)
        if (hit) {
          hit.forEach(add)
          break
        }
      }
    }
  }
  return found
}

/** Best single catalog entry for an imported module name within one ecosystem. */
function matchImport(ecosystem: Ecosystem, name: string): TechKnowledgeEntry | undefined {
  const idx = getIndex().packages.get(ecosystem)
  if (!idx) return undefined
  const norm = normalizePackageName(ecosystem, name)
  const exact = idx.exact.get(norm)?.[0]
  if (exact) return exact
  const pre = idx.prefixes.find((p) => norm.startsWith(p.prefix))
  if (pre) return pre.entry
  const imp = idx.imports.get(norm)?.[0]
  if (imp) return imp
  for (const t of truncations(norm, ecosystem)) {
    const hit = idx.exact.get(t)?.[0] ?? idx.imports.get(t)?.[0]
    if (hit) return hit
  }
  if (ecosystem === 'conda') return matchImport('pypi', name)
  return undefined
}

/** Look up a package by ecosystem + name in the catalog (honours "*" prefix patterns, import names and module sub-paths). */
export function lookupPackage(ecosystem: Ecosystem, name: string): TechKnowledgeEntry | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined
  return matchImport(ecosystem, name)
}

/** Look up a catalog entry by id. Language ids for languages without a catalog entry ("lang-zig") get a generic entry. */
export function getTech(id: string): TechKnowledgeEntry | undefined {
  const hit = getIndex().byId.get(id)
  if (hit) return hit
  if (id.startsWith('lang-') && id.length > 5) {
    const name = id
      .slice(5)
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
    return genericLanguageEntry(id, name)
  }
  return undefined
}

function genericLanguageEntry(id: string, name: string): TechKnowledgeEntry {
  return {
    id,
    name,
    category: 'language',
    importance: 'core',
    description: `${name} is a programming language: a precise, written way of giving a computer step-by-step instructions. Part of this project is written in it.`,
    analogy: 'Like one of the many human languages: different words and grammar, but all used to say what should happen.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content signals: facts only visible inside downloaded files
// ─────────────────────────────────────────────────────────────────────────────

/** Docker image names (last path segment, or "org/name") → catalog id. */
const IMAGE_TECH: Record<string, string> = {
  postgres: 'postgresql',
  postgis: 'postgresql',
  'postgis/postgis': 'postgresql',
  'timescale/timescaledb': 'postgresql',
  'dpage/pgadmin4': 'postgresql',
  pgvector: 'postgresql',
  'pgvector/pgvector': 'postgresql',
  mysql: 'mysql',
  mariadb: 'mysql',
  percona: 'mysql',
  mongo: 'mongodb',
  mongodb: 'mongodb',
  'mongo-express': 'mongodb',
  redis: 'redis',
  'redis-stack': 'redis',
  valkey: 'redis',
  keydb: 'redis',
  elasticsearch: 'elasticsearch',
  opensearch: 'elasticsearch',
  rabbitmq: 'rabbitmq',
  kafka: 'kafka',
  'cp-kafka': 'kafka',
  'cp-server': 'kafka',
  redpanda: 'kafka',
  nginx: 'nginx',
  cassandra: 'cassandra',
  'scylla': 'cassandra',
  neo4j: 'neo4j',
  'dynamodb-local': 'dynamodb',
  meilisearch: 'meilisearch',
  typesense: 'meilisearch',
  localstack: 'aws',
  node: 'nodejs',
  'chromadb/chroma': 'vector-database',
  qdrant: 'vector-database',
  weaviate: 'vector-database',
  ollama: 'ollama',
  jenkins: 'jenkins',
  'dotnet/aspnet': 'aspnetcore',
  'dotnet/sdk': 'dotnet',
}

function imageTech(image: string): { id: string; label: string } | null {
  if (!image || image.includes('$')) return null
  const noDigest = image.split('@')[0]
  const lastColon = noDigest.lastIndexOf(':')
  const noTag = lastColon > noDigest.lastIndexOf('/') ? noDigest.slice(0, lastColon) : noDigest
  const parts = noTag.toLowerCase().split('/')
  const last = parts[parts.length - 1]
  const lastTwo = parts.slice(-2).join('/')
  const id = IMAGE_TECH[lastTwo] ?? IMAGE_TECH[last]
  return id ? { id, label: last } : null
}

const URL_SCHEME_TECH: Record<string, string> = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mysql',
  mongodb: 'mongodb',
  'mongodb+srv': 'mongodb',
  redis: 'redis',
  rediss: 'redis',
  amqp: 'rabbitmq',
  amqps: 'rabbitmq',
}

const DB_ENGINE_TECH: Record<string, string> = {
  postgresql: 'postgresql',
  postgresql_psycopg2: 'postgresql',
  postgis: 'postgresql',
  mysql: 'mysql',
  mysql2: 'mysql',
  trilogy: 'mysql',
  mariadb: 'mysql',
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
}

interface SignalHit {
  id: string
  evidence: string
}

const PYPROJECT_TOOLS: [RegExp, string, string][] = [
  [/^\[tool\.poetry\]/m, 'poetry', '[tool.poetry]'],
  [/^\[tool\.uv\b/m, 'uv', '[tool.uv]'],
  [/^\[tool\.ruff\b/m, 'ruff', '[tool.ruff]'],
  [/^\[tool\.black\]/m, 'black', '[tool.black]'],
  [/^\[tool\.mypy\b/m, 'mypy', '[tool.mypy]'],
  [/^\[tool\.pytest\b/m, 'pytest', '[tool.pytest]'],
]

const K8S_KIND = /^kind:[ \t]*(Deployment|Service|StatefulSet|DaemonSet|Ingress|ConfigMap|CronJob|Job|Pod|Namespace|HorizontalPodAutoscaler|PersistentVolumeClaim)[ \t]*$/m

/** Scan downloaded files for technology clues that file names and manifests miss. */
function contentSignals(files: Record<string, string>): SignalHit[] {
  const hits: SignalHit[] = []
  const counts = new Map<string, { first: string; n: number; label: string }>()
  const countHit = (id: string, path: string, label: string) => {
    const c = counts.get(id)
    if (c) c.n++
    else counts.set(id, { first: path, n: 1, label })
  }
  for (const [path, text] of Object.entries(files)) {
    if (typeof text !== 'string' || !text || isPeripheralPath(path)) continue
    const lowerBase = basename(path).toLowerCase()
    const ext = lowerBase.includes('.') ? lowerBase.slice(lowerBase.lastIndexOf('.') + 1) : ''
    const sample = text.length > 200_000 ? text.slice(0, 200_000) : text

    if (/^(docker-)?compose([.-][\w.-]+)?\.ya?ml$/.test(lowerBase)) {
      const seen = new Set<string>()
      for (const m of sample.matchAll(/^[ \t-]*image:[ \t]*["']?([^\s"'#]{1,300})/gm)) {
        const t = imageTech(m[1])
        if (t && !seen.has(t.id)) {
          seen.add(t.id)
          hits.push({ id: t.id, evidence: `${path} → ${t.label} service` })
        }
      }
    } else if (/^(dockerfile|containerfile)([._-].*)?$/.test(lowerBase) || lowerBase.endsWith('.dockerfile')) {
      for (const m of sample.matchAll(/^[ \t]*FROM[ \t]+(?:--platform=\S+[ \t]+)?(\S{1,300})/gim)) {
        const t = imageTech(m[1])
        if (t) hits.push({ id: t.id, evidence: `${path} → FROM ${t.label}` })
      }
    } else if (/^\.env(\.[\w-]+)?$/.test(lowerBase) || lowerBase === 'env.example') {
      const seen = new Set<string>()
      for (const m of sample.matchAll(/\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\//gi)) {
        const id = URL_SCHEME_TECH[m[1].toLowerCase()]
        if (id && !seen.has(id)) {
          seen.add(id)
          hits.push({ id, evidence: `${path} → database address` })
        }
      }
    } else if (ext === 'py' && (lowerBase === 'settings.py' || /\/settings\//.test(path))) {
      for (const m of sample.matchAll(/django\.db\.backends\.(\w+)/g)) {
        const id = DB_ENGINE_TECH[m[1]]
        if (id) hits.push({ id, evidence: `${path} → database engine` })
      }
    } else if (path.endsWith('config/database.yml')) {
      for (const m of sample.matchAll(/^[ \t]*adapter:[ \t]*["']?(\w+)/gm)) {
        const id = DB_ENGINE_TECH[m[1]]
        if (id) hits.push({ id, evidence: `${path} → database adapter` })
      }
    } else if (/^application(-[\w-]+)?\.(properties|ya?ml)$/.test(lowerBase)) {
      for (const m of sample.matchAll(/jdbc:(postgresql|mysql|mariadb|sqlite)/g)) {
        const id = DB_ENGINE_TECH[m[1]]
        if (id) hits.push({ id, evidence: `${path} → database address` })
      }
      if (/mongodb(\+srv)?:\/\//.test(sample)) hits.push({ id: 'mongodb', evidence: `${path} → database address` })
    } else if (lowerBase === 'components.json' && /ui\.shadcn\.com/.test(sample)) {
      hits.push({ id: 'shadcn', evidence: path })
    } else if (lowerBase === 'mix.exs') {
      if (/:phoenix\b/.test(sample)) hits.push({ id: 'phoenix', evidence: `${path} → :phoenix` })
    } else if (lowerBase === 'manifest.json' && /"manifest_version"\s*:/.test(sample)) {
      hits.push({ id: 'browser-extension', evidence: `${path} (browser extension manifest)` })
    } else if (lowerBase === 'pyproject.toml') {
      for (const [re, id, label] of PYPROJECT_TOOLS) if (re.test(sample)) hits.push({ id, evidence: `${path} → ${label}` })
    } else if (lowerBase === 'setup.cfg' || lowerBase === 'tox.ini') {
      if (/^\[flake8\]/m.test(sample)) hits.push({ id: 'flake8', evidence: `${path} → [flake8]` })
      if (/^\[(tool:)?pytest\]/m.test(sample)) hits.push({ id: 'pytest', evidence: `${path} → [pytest]` })
      if (/^\[mypy\b/m.test(sample)) hits.push({ id: 'mypy', evidence: `${path} → [mypy]` })
    } else if ((ext === 'yaml' || ext === 'yml') && !path.startsWith('.github/') && /^apiVersion:[ \t]*\S+/m.test(sample) && K8S_KIND.test(sample)) {
      countHit('kubernetes', path, 'Kubernetes resource files')
    } else if (ext === 'swift') {
      if (/^[ \t]*import[ \t]+SwiftUI\b/m.test(sample)) countHit('swiftui', path, 'Swift files')
      if (/^[ \t]*import[ \t]+UIKit\b/m.test(sample)) countHit('uikit', path, 'Swift files')
    } else if (ext === 'cs' && /^[ \t]*using[ \t]+UnityEngine[ \t]*;/m.test(sample)) {
      countHit('unity', path, 'C# files')
    } else if (ext === 'php' && depthOf(path) <= 2 && /^[ \t/*#]*Plugin Name:/m.test(sample.slice(0, 4000))) {
      hits.push({ id: 'wordpress', evidence: `${path} (WordPress plugin header)` })
    } else if (lowerBase === 'style.css' && depthOf(path) <= 2 && /Theme Name:/.test(sample.slice(0, 4000))) {
      hits.push({ id: 'wordpress', evidence: `${path} (WordPress theme header)` })
    } else if ((lowerBase === 'config.toml' || lowerBase === 'config.yaml' || lowerBase === 'config.yml') && depthOf(path) === 0 && /\bbaseURL\b/.test(sample)) {
      hits.push({ id: 'hugo', evidence: `${path} → baseURL` })
    }
  }
  for (const [id, c] of counts) hits.push({ id, evidence: c.n === 1 ? c.first : `${c.first} and ${c.n - 1} more ${c.label}` })
  return hits
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

interface Accumulator {
  entry: TechKnowledgeEntry
  /** "package.json → dependencies" lines, in discovery order (root manifests first). */
  manifestEvidence: string[]
  /** Content, language and "comes with" clues. */
  evidence: string[]
  score: number
  runtime: boolean
  peer: boolean
  dev: boolean
  imported: number
  /** Imported by code although an ecosystem with a package list doesn't declare it (often example or optional code). */
  undeclaredImport: boolean
  manifests: Set<string>
  files: { first: string; n: number } | null
  content: boolean
  languageShare: number
  implied: boolean
}

/** Language display name → package ecosystems its imports come from. */
function ecosystemsForLanguage(name: string): Ecosystem[] {
  const id = languageTechId(name) ?? ''
  switch (id) {
    case 'javascript':
    case 'typescript':
    case 'vue':
    case 'svelte':
    case 'astro':
    case 'coffeescript':
      return ['npm']
    case 'python':
    case 'jupyter':
      return ['pypi', 'conda']
    case 'go':
      return ['go']
    case 'rust':
      return ['cargo']
    case 'ruby':
      return ['gem']
    case 'php':
    case 'laravel':
      return ['composer']
    case 'java':
    case 'kotlin':
    case 'scala':
    case 'groovy':
    case 'clojure':
      return ['maven']
    case 'csharp':
    case 'fsharp':
    case 'visual-basic':
      return ['nuget']
    case 'dart':
      return ['pub']
    case 'swift':
    case 'objective-c':
      return ['swift', 'cocoapods']
    default:
      return []
  }
}

/** "package.json → devDependencies"; flat lists without sections (requirements.txt) are cited by file name alone. */
function evidenceFor(dep: DependencyRef): string {
  return dep.section ? `${dep.source} → ${dep.section}` : dep.source
}

function formatShare(p: number): string {
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

/**
 * Detect the technologies used, de-duplicated, with plain-English descriptions and evidence.
 * Includes the main programming languages (≥ 5% of code) as 'language' items.
 * Order: core first (frameworks, languages, databases), then supporting, then tooling; strongest evidence first within each.
 * Runtime dependencies outrank dev dependencies (dev-only → usually one step less important), and technologies a framework
 * is built on are added when missing (Next.js → React), while keeping both when both are present.
 */
export function detectTechStack(input: DetectTechInput): TechItem[] {
  const index = getIndex()
  const acc = new Map<string, Accumulator>()
  const get = (entry: TechKnowledgeEntry): Accumulator => {
    let a = acc.get(entry.id)
    if (!a) {
      a = { entry, manifestEvidence: [], evidence: [], score: 0, runtime: false, peer: false, dev: false, imported: 0, undeclaredImport: false, manifests: new Set(), files: null, content: false, languageShare: 0, implied: false }
      acc.set(entry.id, a)
    }
    return a
  }
  const addEvidence = (a: Accumulator, text: string) => {
    if (!a.evidence.includes(text)) a.evidence.push(text)
  }

  // 1. Declared dependencies.
  const deps = Array.isArray(input.manifests?.dependencies) ? input.manifests.dependencies : []
  const declaredEcosystems = new Set<Ecosystem>()
  for (const dep of deps) {
    if (!dep || typeof dep.name !== 'string' || !ECOSYSTEMS.includes(dep.ecosystem)) continue
    declaredEcosystems.add(dep.ecosystem === 'conda' ? 'pypi' : dep.ecosystem)
    if (dep.ecosystem === 'npm' && dep.name.startsWith('@types/')) continue
    for (const entry of matchDependency(dep.ecosystem, dep.name)) {
      const a = get(entry)
      const line = evidenceFor(dep)
      if (!a.manifestEvidence.includes(line)) a.manifestEvidence.push(line)
      a.manifests.add(dep.source)
      if (dep.section === 'peerDependencies') a.peer = true
      else if (dep.dev) a.dev = true
      else a.runtime = true
    }
  }

  // 2. Packages imported by the code.
  const languages = Array.isArray(input.languages) ? input.languages.filter((l) => l && typeof l.name === 'string') : []
  const likely = new Set<Ecosystem>()
  for (const l of languages) for (const e of ecosystemsForLanguage(l.name)) likely.add(e)
  const importEcos: Ecosystem[] = likely.size > 0 ? [...likely] : [...ECOSYSTEMS]
  for (const pkg of input.importedPackages ?? []) {
    if (!pkg || typeof pkg.name !== 'string' || !pkg.name) continue
    const ecos: Ecosystem[] = /^[a-z0-9-]+\.[a-z]{2,}\//i.test(pkg.name) && importEcos.includes('go') ? ['go', ...importEcos] : importEcos
    let entry: TechKnowledgeEntry | undefined
    let matchedEco: Ecosystem | undefined
    for (const eco of ecos) {
      entry = matchImport(eco, pkg.name)
      if (entry) {
        matchedEco = eco === 'conda' ? 'pypi' : eco
        break
      }
    }
    if (!entry || !matchedEco) continue
    const count = Math.max(1, Math.round(pkg.count || 1))
    const declared = acc.has(entry.id) && acc.get(entry.id)!.manifests.size > 0
    if (!declared && declaredEcosystems.has(matchedEco)) {
      // The project lists its packages but not this one: likely used only by examples, scripts or optional code.
      if (count < UNDECLARED_IMPORT_MIN_FILES) continue
      get(entry).undeclaredImport = true
    }
    const a = get(entry)
    a.imported = Math.max(a.imported, count)
  }

  // 3. Telltale files anywhere in the tree.
  const fileHit = (entry: TechKnowledgeEntry, path: string) => {
    const a = get(entry)
    if (a.files) a.files.n++
    else a.files = { first: path, n: 1 }
  }
  const paths = Array.isArray(input.paths) ? input.paths : []
  const fi = index.files
  for (const path of paths) {
    if (typeof path !== 'string' || !path) continue
    const lower = path.toLowerCase()
    const base = basename(lower)
    const matched: TechKnowledgeEntry[] = []
    for (const e of fi.exact.get(base) ?? []) matched.push(e)
    for (let i = base.indexOf('.', 1); i !== -1; i = base.indexOf('.', i + 1)) for (const e of fi.suffix.get(base.slice(i)) ?? []) matched.push(e)
    if (base.startsWith('.')) for (const e of fi.suffix.get(base) ?? []) matched.push(e)
    for (const { prefix, entry } of fi.prefix) if (base.startsWith(prefix)) matched.push(entry)
    for (const { re, entry } of fi.globs) if (re.test(base)) matched.push(entry)
    if (fi.pathQuick && lower.includes('/') && fi.pathQuick.test(lower)) for (const { re, entry } of fi.pathPatterns) if (re.test(lower)) matched.push(entry)
    if (matched.length === 0 || isPeripheralPath(path)) continue
    for (const e of new Set(matched)) fileHit(e, path)
  }

  // 4. Clues inside downloaded files.
  for (const hit of contentSignals(input.files ?? {})) {
    const entry = index.byId.get(hit.id)
    if (!entry) continue
    const a = get(entry)
    a.content = true
    addEvidence(a, hit.evidence)
  }

  // 5. Programming languages (≥ 5% of the code).
  const shares = new Map<string, { share: number; names: string[] }>()
  const code = languages.filter((l) => !NON_CODE_LANGUAGES.has(l.name.toLowerCase()))
  const totalBytes = code.reduce((s, l) => s + (Number.isFinite(l.bytes) ? Math.max(0, l.bytes) : 0), 0)
  const totalPercent = code.reduce((s, l) => s + (Number.isFinite(l.percent) ? Math.max(0, l.percent) : 0), 0)
  for (const l of code) {
    const share = totalBytes > 0 ? (Math.max(0, l.bytes) / totalBytes) * 100 : totalPercent > 0 ? (Math.max(0, l.percent) / totalPercent) * 100 : 0
    const id = languageTechId(l.name) ?? `lang-${languageSlug(l.name)}`
    const s = shares.get(id) ?? { share: 0, names: [] }
    s.share += share
    s.names.push(l.name)
    shares.set(id, s)
  }
  const ranked = [...shares.entries()].sort((a, b) => b[1].share - a[1].share)
  const qualifying = ranked.filter(([, s]) => s.share >= LANGUAGE_THRESHOLD)
  if (qualifying.length === 0 && ranked.length > 0 && ranked[0][1].share > 0) qualifying.push(ranked[0])
  for (const [id, s] of qualifying) {
    const known = index.byId.get(id)
    const display = s.names[0]
    const entry = known ?? genericLanguageEntry(id, display)
    const a = get(entry)
    a.languageShare = Math.max(a.languageShare, s.share)
    addEvidence(a, entry.category === 'language' ? `${formatShare(s.share)} of the code` : `${formatShare(s.share)} of the code is ${display} files`)
  }

  // 6. Foundations a framework always brings (Next.js → React), when not already found.
  let grew = true
  for (let round = 0; grew && round < 4; round++) {
    grew = false
    for (const a of [...acc.values()]) {
      for (const impliedId of a.entry.implies ?? []) {
        if (acc.has(impliedId)) continue
        const implied = index.byId.get(impliedId)
        if (!implied) continue
        const b = get(implied)
        b.implied = true
        addEvidence(b, `${a.entry.name} is built on it`)
        grew = true
      }
    }
  }

  // 7. Score, rank and describe.
  const items: { item: TechItem; score: number }[] = []
  for (const a of acc.values()) {
    const evidence: string[] = a.manifestEvidence.slice(0, 3)
    if (a.manifestEvidence.length > 3) evidence.push(`and ${a.manifestEvidence.length - 3} more package lists`)
    if (a.files) evidence.push(a.files.n === 1 ? a.files.first : `${a.files.first} and ${a.files.n - 1} more`)
    if (a.imported > 0) evidence.push(`used in ${a.imported} ${a.imported === 1 ? 'file' : 'files'}`)
    for (const e of a.evidence) if (!evidence.includes(e)) evidence.push(e)
    if (evidence.length === 0) continue

    let score = 0
    if (a.runtime) score += 10 + Math.min(3, a.manifests.size - 1)
    else if (a.peer) score += 7
    else if (a.dev) score += 3
    if (a.imported > 0) score += 2 + Math.min(8, 2 * Math.log2(1 + a.imported))
    if (a.files) score += 4 + Math.min(2, Math.log2(a.files.n))
    if (a.content) score += 5
    // A language's strength is its share of the code; its compiler package or config file shouldn't count twice.
    if (a.languageShare > 0) score = (a.entry.category === 'language' ? 0 : score) + 6 + Math.min(12, a.languageShare / 8)
    if (a.implied && score === 0) score = 1

    const usedForReal = a.runtime || a.peer || a.imported > 0 || a.files !== null || a.content || a.implied
    let importance: TechItem['importance'] = a.entry.importance
    if (a.entry.category === 'language') {
      importance = a.languageShare >= LANGUAGE_THRESHOLD || (qualifying.length === 1 && a.languageShare > 0) ? 'core' : a.runtime || a.peer ? 'supporting' : 'tooling'
    } else if ((!usedForReal && a.dev) || (a.undeclaredImport && !a.runtime && !a.peer && a.files === null && !a.content)) {
      importance = importance === 'core' ? 'supporting' : 'tooling'
    }

    const item: TechItem = {
      id: a.entry.id,
      name: a.entry.name,
      category: a.entry.category,
      description: a.entry.description,
      evidence: evidence.slice(0, MAX_EVIDENCE),
      importance,
    }
    if (a.entry.analogy) item.analogy = a.entry.analogy
    if (a.entry.url) item.url = a.entry.url
    items.push({ item, score })
  }

  items.sort(
    (x, y) =>
      IMPORTANCE_RANK[x.item.importance] - IMPORTANCE_RANK[y.item.importance] || y.score - x.score || x.item.name.localeCompare(y.item.name),
  )
  return items.map((x) => x.item)
}

/** Plain-English description for a language display name, if we have one ("TSX" → TypeScript's). */
export function describeLanguage(name: string): { id: string; name: string; description: string; analogy?: string } | null {
  const id = languageTechId(name)
  const info = id ? LANGUAGE_INFO.get(id) : undefined
  if (info) return { id: info.id, name: info.name, description: info.description, analogy: info.analogy }
  const entry = id ? getIndex().byId.get(id) : undefined
  if (entry) return { id: entry.id, name: entry.name, description: entry.description, analogy: entry.analogy }
  return null
}
