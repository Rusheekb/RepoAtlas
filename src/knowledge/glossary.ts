import type { FileRole, GlossaryTerm, Layer, ProjectKindId, TechCategory } from '@/core/types'
import { BASICS_TERMS } from './terms/basics'
import { WEB_TERMS } from './terms/web'
import { DATA_TERMS } from './terms/data'
import { TOOLS_TERMS } from './terms/tools'
import { ARCHITECTURE_TERMS } from './terms/architecture'
import { TESTING_TERMS } from './terms/testing'
import { DEVOPS_TERMS } from './terms/devops'
import { LANGUAGE_TERMS } from './terms/languages'
import { SECURITY_TERMS } from './terms/security'
import { AI_TERMS } from './terms/ai'
import { getTech } from './detectTech'

/**
 * 270+ technical terms explained in plain English with analogies. Ids are kebab-case and stable.
 * Includes every basic a newcomer meets (repository, file, folder, function, dependency, framework …) plus web,
 * data, tooling, architecture, testing, devops, language, security and AI vocabulary.
 * The terms themselves live in ./terms/*.ts, grouped by category.
 */
export const GLOSSARY: GlossaryTerm[] = [
  ...BASICS_TERMS,
  ...WEB_TERMS,
  ...DATA_TERMS,
  ...TOOLS_TERMS,
  ...ARCHITECTURE_TERMS,
  ...TESTING_TERMS,
  ...DEVOPS_TERMS,
  ...LANGUAGE_TERMS,
  ...SECURITY_TERMS,
  ...AI_TERMS,
]

let BY_ID: Map<string, GlossaryTerm> | null = null

function byId(): Map<string, GlossaryTerm> {
  BY_ID ??= new Map(GLOSSARY.map((t) => [t.id, t]))
  return BY_ID
}

export function getTerm(id: string): GlossaryTerm | undefined {
  return byId().get(id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Relevance
// ─────────────────────────────────────────────────────────────────────────────

/** Terms every newcomer needs, whatever the project. */
const ALWAYS_RELEVANT = ['repository', 'file', 'folder', 'source-code', 'function', 'variable', 'dependency', 'library', 'framework', 'readme']

const KIND_TERMS: Record<ProjectKindId, string[]> = {
  'web-app': ['frontend', 'backend', 'server', 'component', 'api', 'route', 'database', 'http', 'state', 'deployment'],
  website: ['html', 'css', 'static-site', 'responsive', 'url', 'hosting', 'markdown', 'cdn'],
  'api-server': ['server', 'api', 'endpoint', 'route', 'request', 'response', 'http', 'rest', 'middleware', 'database', 'json'],
  library: ['package', 'module', 'import', 'export', 'api', 'package-manager', 'semver', 'interface'],
  'cli-tool': ['cli', 'terminal', 'shell', 'parameter', 'script', 'entry-point'],
  'mobile-app': ['ui', 'component', 'state', 'api', 'frontend', 'event'],
  'desktop-app': ['ui', 'event', 'runtime', 'component', 'state'],
  'browser-extension': ['browser', 'dom', 'javascript', 'authorization', 'event', 'plugin'],
  'data-science': ['dataset', 'dataframe', 'notebook', 'csv', 'algorithm', 'python'],
  'ml-model': ['machine-learning', 'ml-model', 'training', 'inference', 'neural-network', 'dataset', 'gpu', 'tensor'],
  game: ['loop', 'event', 'render', 'state', 'object'],
  infrastructure: ['infrastructure-as-code', 'cloud', 'container', 'deployment', 'kubernetes', 'ci-cd', 'server', 'environment'],
  documentation: ['markdown', 'static-site', 'readme', 'hosting'],
  monorepo: ['monorepo', 'package', 'package-manager', 'build', 'module'],
  bot: ['api', 'webhook', 'event', 'token', 'async', 'handler'],
  plugin: ['plugin', 'api', 'hook', 'interface'],
  unknown: [],
}

const LAYER_TERMS: Record<Layer, string[]> = {
  ui: ['component', 'ui', 'css'],
  api: ['api', 'endpoint', 'request'],
  logic: ['function', 'algorithm'],
  data: ['database', 'schema', 'model'],
  test: ['test', 'unit-test'],
  config: ['config', 'environment-variable'],
  docs: ['markdown', 'readme'],
  infra: ['ci-cd', 'deployment', 'container'],
  other: [],
}

const ROLE_TERMS: Partial<Record<FileRole, string[]>> = {
  entry: ['entry-point'],
  page: ['route', 'render'],
  component: ['component', 'props'],
  layout: ['component'],
  hook: ['hook', 'state'],
  state: ['state', 'state-management'],
  route: ['route', 'url', 'endpoint'],
  controller: ['controller', 'mvc'],
  middleware: ['middleware'],
  service: ['service'],
  client: ['api', 'http', 'request'],
  model: ['model', 'orm'],
  schema: ['schema', 'validation'],
  migration: ['migration', 'database'],
  repository: ['database', 'crud'],
  util: ['function'],
  types: ['type', 'interface'],
  constants: ['constant'],
  config: ['config'],
  test: ['test', 'unit-test', 'mock'],
  fixture: ['fixture'],
  style: ['css'],
  docs: ['markdown'],
  script: ['script', 'terminal'],
  build: ['build', 'bundle'],
  ci: ['ci-cd', 'pipeline'],
  container: ['container', 'docker'],
  cli: ['cli', 'terminal'],
  library: ['module'],
}

const TECH_CATEGORY_TERMS: Partial<Record<TechCategory, string[]>> = {
  language: ['programming-language'],
  frontend: ['component', 'render', 'dom', 'frontend'],
  backend: ['server', 'request', 'response', 'route', 'backend'],
  mobile: ['ui', 'component'],
  desktop: ['ui', 'event'],
  database: ['database', 'query', 'schema'],
  'data-science': ['dataframe', 'notebook', 'dataset'],
  ai: ['machine-learning', 'llm', 'api'],
  styling: ['css', 'responsive'],
  state: ['state', 'state-management'],
  testing: ['test', 'unit-test', 'mock'],
  build: ['build', 'bundle'],
  quality: ['linting', 'formatter'],
  infra: ['container', 'deployment'],
  ci: ['ci-cd', 'pipeline'],
  docs: ['markdown', 'static-site'],
  api: ['api', 'request', 'json'],
  auth: ['authentication', 'token', 'session'],
  payments: ['api', 'webhook', 'api-key'],
  cloud: ['cloud', 'deployment', 'api-key'],
  cli: ['cli', 'terminal'],
  game: ['loop', 'render'],
  utility: ['library'],
  'package-manager': ['package-manager', 'lockfile'],
}

/** Specific technologies → the ideas you need to read their code. */
const TECH_TERMS: Record<string, string[]> = {
  react: ['component', 'props', 'state', 'hook', 'jsx', 'virtual-dom', 'render'],
  next: ['ssr', 'route', 'static-site', 'server', 'hydration'],
  remix: ['ssr', 'route'],
  gatsby: ['static-site', 'markdown'],
  astro: ['static-site', 'component'],
  vue: ['component', 'reactive', 'template'],
  nuxt: ['ssr', 'route'],
  svelte: ['component', 'reactive'],
  sveltekit: ['ssr', 'route'],
  angular: ['component', 'dependency-injection', 'typescript', 'decorator'],
  solid: ['reactive', 'component'],
  express: ['middleware', 'route', 'endpoint'],
  fastify: ['route', 'endpoint', 'validation'],
  koa: ['middleware', 'route'],
  hono: ['route', 'endpoint', 'serverless'],
  nestjs: ['decorator', 'dependency-injection', 'controller', 'service'],
  django: ['mvc', 'orm', 'migration', 'template'],
  'django-rest-framework': ['rest', 'serialization', 'endpoint'],
  flask: ['route', 'template', 'decorator'],
  fastapi: ['endpoint', 'async', 'validation'],
  rails: ['mvc', 'orm', 'migration'],
  laravel: ['mvc', 'orm', 'migration'],
  'spring-boot': ['dependency-injection', 'decorator', 'controller'],
  aspnetcore: ['controller', 'dependency-injection', 'middleware'],
  prisma: ['orm', 'schema', 'migration'],
  drizzle: ['orm', 'schema', 'migration'],
  typeorm: ['orm', 'migration'],
  sequelize: ['orm', 'migration'],
  mongoose: ['schema', 'nosql'],
  sqlalchemy: ['orm', 'model'],
  alembic: ['migration'],
  hibernate: ['orm', 'model'],
  'entity-framework': ['orm', 'migration'],
  gorm: ['orm', 'model'],
  diesel: ['orm', 'migration'],
  graphql: ['graphql', 'schema', 'query'],
  'apollo-server': ['graphql', 'schema'],
  'apollo-client': ['graphql', 'cache'],
  trpc: ['api', 'type'],
  openapi: ['api', 'endpoint', 'rest'],
  'socket-io': ['websocket', 'event'],
  'websocket-ws': ['websocket'],
  redis: ['cache', 'queue'],
  celery: ['queue', 'background-job'],
  sidekiq: ['queue', 'background-job'],
  kafka: ['queue', 'pub-sub', 'event-driven'],
  rabbitmq: ['queue', 'pub-sub'],
  postgresql: ['sql', 'relational-database'],
  mysql: ['sql', 'relational-database'],
  sqlite: ['sql', 'relational-database'],
  mongodb: ['nosql', 'json'],
  elasticsearch: ['index', 'query'],
  docker: ['docker', 'container', 'container-image'],
  'docker-compose': ['docker', 'container'],
  kubernetes: ['kubernetes', 'container', 'yaml'],
  helm: ['kubernetes', 'template'],
  terraform: ['infrastructure-as-code', 'cloud'],
  pulumi: ['infrastructure-as-code', 'cloud'],
  'aws-cdk': ['infrastructure-as-code', 'cloud'],
  'serverless-framework': ['serverless', 'cloud'],
  'github-actions': ['ci-cd', 'pipeline', 'yaml'],
  'gitlab-ci': ['ci-cd', 'pipeline'],
  circleci: ['ci-cd', 'pipeline'],
  jenkins: ['ci-cd', 'pipeline'],
  jest: ['unit-test', 'mock', 'assertion'],
  vitest: ['unit-test', 'mock', 'assertion'],
  mocha: ['unit-test', 'assertion'],
  pytest: ['unit-test', 'fixture', 'assertion'],
  junit: ['unit-test', 'assertion'],
  rspec: ['unit-test', 'tdd'],
  cypress: ['e2e-test'],
  playwright: ['e2e-test'],
  'testing-library': ['unit-test', 'component'],
  storybook: ['component'],
  typescript: ['typescript', 'type', 'interface', 'generics', 'static-typing'],
  javascript: ['javascript'],
  python: ['python'],
  nodejs: ['nodejs', 'runtime', 'async'],
  deno: ['runtime', 'typescript'],
  openai: ['llm', 'prompt', 'api-key'],
  anthropic: ['llm', 'prompt', 'api-key', 'context-window'],
  gemini: ['llm', 'prompt', 'api-key'],
  langchain: ['llm', 'prompt', 'rag', 'ai-agent'],
  llamaindex: ['rag', 'embedding', 'llm'],
  'vercel-ai-sdk': ['llm', 'prompt'],
  'vector-database': ['embedding', 'vector-database', 'rag'],
  transformers: ['ml-model', 'neural-network', 'inference'],
  pytorch: ['neural-network', 'training', 'tensor', 'gpu'],
  tensorflow: ['neural-network', 'training', 'tensor', 'gpu'],
  keras: ['neural-network', 'training'],
  jax: ['tensor', 'gpu'],
  'scikit-learn': ['machine-learning', 'training', 'ml-model'],
  xgboost: ['machine-learning', 'training'],
  pandas: ['dataframe', 'csv'],
  polars: ['dataframe'],
  numpy: ['array', 'tensor'],
  jupyter: ['notebook'],
  tailwind: ['css', 'responsive'],
  sass: ['css'],
  redux: ['state-management', 'state', 'immutable'],
  zustand: ['state-management', 'state'],
  mobx: ['state-management', 'reactive'],
  pinia: ['state-management', 'state'],
  'tanstack-query': ['cache', 'api'],
  jwt: ['jwt', 'token', 'authentication'],
  passport: ['authentication', 'oauth', 'session'],
  'next-auth': ['authentication', 'oauth', 'session'],
  devise: ['authentication', 'session'],
  bcrypt: ['hash', 'authentication'],
  stripe: ['webhook', 'api-key'],
  firebase: ['authentication', 'nosql', 'cloud'],
  supabase: ['authentication', 'database', 'cloud'],
  electron: ['runtime', 'ui'],
  tauri: ['ui'],
  'react-native': ['component', 'state'],
  expo: ['component'],
  flutter: ['component', 'state'],
  vite: ['bundle', 'dev-server', 'hot-reload'],
  webpack: ['bundle', 'build'],
  esbuild: ['bundle', 'transpile'],
  rollup: ['bundle'],
  babel: ['transpile'],
  eslint: ['linting'],
  prettier: ['formatter'],
  biome: ['linting', 'formatter'],
  husky: ['commit', 'git'],
  turbo: ['monorepo'],
  nx: ['monorepo'],
  lerna: ['monorepo'],
  zod: ['validation', 'schema'],
  yup: ['validation', 'schema'],
  joi: ['validation', 'schema'],
  pydantic: ['validation', 'schema'],
  axios: ['http', 'request', 'response'],
  requests: ['http', 'request', 'response'],
  httpx: ['http', 'async'],
  cobra: ['cli', 'terminal', 'parameter'],
  click: ['cli', 'terminal', 'decorator'],
  typer: ['cli', 'terminal'],
  commander: ['cli', 'terminal', 'parameter'],
  clap: ['cli', 'terminal'],
  tokio: ['async', 'concurrency'],
  rayon: ['concurrency', 'thread'],
  serde: ['serialization', 'json'],
  dotenv: ['environment-variable', 'secret'],
  sentry: ['monitoring', 'logging'],
  winston: ['logging'],
  pino: ['logging'],
}

/** Language display names → glossary ids. */
const LANGUAGE_TERM_IDS: Record<string, string[]> = {
  typescript: ['typescript', 'static-typing'],
  tsx: ['typescript', 'jsx'],
  javascript: ['javascript'],
  python: ['python'],
  'jupyter notebook': ['notebook', 'python'],
  html: ['html'],
  css: ['css'],
  scss: ['css'],
  sass: ['css'],
  less: ['css'],
  sql: ['sql'],
  shell: ['shell', 'script'],
  powershell: ['script'],
  markdown: ['markdown'],
  json: ['json'],
  yaml: ['yaml'],
  toml: ['toml'],
  graphql: ['graphql'],
  dockerfile: ['docker', 'container'],
  hcl: ['infrastructure-as-code'],
  go: ['concurrency', 'static-typing'],
  rust: ['static-typing', 'compile'],
  java: ['object-oriented-programming', 'class'],
  kotlin: ['class', 'static-typing'],
  'c#': ['object-oriented-programming', 'class'],
  c: ['compile'],
  'c++': ['compile', 'class'],
  swift: ['static-typing'],
  ruby: ['object-oriented-programming'],
  php: ['server'],
  elixir: ['functional-programming', 'concurrency'],
  haskell: ['functional-programming', 'pure-function'],
  vue: ['component', 'template'],
  svelte: ['component', 'reactive'],
}

/** Glossary ids relevant to a repo, most relevant first (≈20–40 ids). */
export function findRelevantTerms(input: {
  techIds: string[]
  roles: FileRole[]
  layers: Layer[]
  projectKind: ProjectKindId
  languages: string[]
}): string[] {
  const scores = new Map<string, number>()
  const order = new Map<string, number>()
  let seq = 0
  const bump = (id: string, by: number) => {
    if (!byId().has(id)) return
    scores.set(id, (scores.get(id) ?? 0) + by)
    if (!order.has(id)) order.set(id, seq++)
  }

  // Basics come first: the audience may never have opened a code project before.
  ALWAYS_RELEVANT.forEach((id, i) => bump(id, 200 - i))
  for (const id of KIND_TERMS[input.projectKind] ?? []) bump(id, 40)

  const techIds = Array.isArray(input.techIds) ? input.techIds : []
  techIds.slice(0, 40).forEach((techId, i) => {
    const weight = Math.max(8, 32 - i)
    for (const id of TECH_TERMS[techId] ?? []) bump(id, weight)
    const category = getTech(techId)?.category
    if (category) for (const id of TECH_CATEGORY_TERMS[category] ?? []) bump(id, weight / 2)
  })

  const roles = Array.isArray(input.roles) ? input.roles : []
  roles.slice(0, 20).forEach((role, i) => {
    for (const id of ROLE_TERMS[role] ?? []) bump(id, Math.max(4, 20 - i))
  })

  for (const layer of Array.isArray(input.layers) ? input.layers : []) for (const id of LAYER_TERMS[layer] ?? []) bump(id, 10)

  const languages = Array.isArray(input.languages) ? input.languages : []
  languages.slice(0, 8).forEach((name, i) => {
    if (typeof name !== 'string') return
    for (const id of LANGUAGE_TERM_IDS[name.toLowerCase()] ?? []) bump(id, Math.max(6, 25 - i * 4))
  })
  if (languages.length > 0) bump('programming-language', 15)

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .slice(0, 40)
    .map(([id]) => id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Finding terms in text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-word forms that are also everyday English ("state of the art", "a test of patience").
 * They only link when the caller asks for their term via `opts.only`, or when written in `backticks`.
 * Multi-word aliases of the same terms ("app state", "unit test") always link.
 */
const COMMON_WORD_FORMS = new Set([
  'state', 'class', 'classes', 'type', 'types', 'object', 'objects', 'string', 'strings', 'model', 'models', 'view', 'views',
  'event', 'events', 'test', 'tests', 'testing', 'build', 'builds', 'query', 'queries', 'index', 'indexes', 'indices',
  'branch', 'branches', 'issue', 'issues', 'ticket', 'tickets', 'license', 'licenses', 'licence', 'licences', 'plugin', 'plugins',
  'template', 'templates', 'templating', 'code', 'promise', 'promises', 'future', 'futures', 'array', 'factory', 'factories',
  'port', 'ports', 'train', 'trains', 'trained', 'training', 'prompt', 'prompts', 'service', 'services', 'comment', 'comments',
  'exception', 'exceptions', 'regression', 'regressions', 'environment', 'environments', 'secret', 'secrets', 'console',
  'trait', 'traits', 'protocol', 'protocols', 'iteration', 'compiled', 'compilation', 'interpreted', 'bash',
  'response', 'responses', 'responsive', 'accessible', 'host', 'hosted', 'seeds', 'bundle', 'bundled', 'abstract',
  'scale', 'coverage', 'spy', 'spies', 'snapshots', 'permission', 'permissions', 'escape', 'escaped', 'escaping', 'exploit',
  'exploits', 'prediction', 'predictions', 'weights', 'checkpoint', 'checkpoints', 'listener', 'listeners', 'scaffold',
  'stub', 'stubs', 'run time', 'scaling', 'subscriber', 'subscribers', 'observer', 'observers', 'injected',
])

/** Terms with at least one everyday-English form (see COMMON_WORD_FORMS); those forms link only on request. */
export const STOPWORD_SENSITIVE_TERMS: ReadonlySet<string> = new Set(
  GLOSSARY.filter((t) => [t.term, ...t.aliases].some((f) => COMMON_WORD_FORMS.has(f.trim().toLowerCase()))).map((t) => t.id),
)

interface FormInfo {
  termId: string
  /** The exact spelling required (abbreviations like "API" or "REST"), or null for case-insensitive. */
  exact: string | null
  common: boolean
}

interface Matcher {
  re: RegExp
  forms: Map<string, FormInfo>
}

let MATCHER: Matcher | null = null

/**
 * Abbreviations must match their exact case so "REST" doesn’t match "rest", "RESTful" doesn’t match "restful" and
 * "API" doesn’t match "api" in prose: short forms with a capital, and forms that start with two or more capitals.
 */
function needsExactCase(form: string): boolean {
  const letters = form.replace(/[^A-Za-z]/g, '')
  if (!letters) return false
  if (letters.length <= 3 && /[A-Z]/.test(letters)) return true
  return /^[A-Z]{2}/.test(letters)
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMatcher(): Matcher {
  const forms = new Map<string, FormInfo>()
  for (const t of GLOSSARY) {
    for (const raw of [t.term, ...t.aliases]) {
      const form = raw.trim()
      if (form.length < 2) continue
      const key = form.toLowerCase()
      const exact = needsExactCase(form) ? form : null
      const common = COMMON_WORD_FORMS.has(key)
      const prev = forms.get(key)
      if (prev) {
        // Same spelling listed twice for one term: keep the more permissive version.
        if (prev.termId === t.id && prev.exact !== null && exact === null) forms.set(key, { termId: t.id, exact: null, common })
        continue
      }
      forms.set(key, { termId: t.id, exact, common })
    }
  }
  // Longest forms first so "unit test" wins over "test" and "API key" over "API".
  const alternatives = [...forms.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b)).map(escapeRegex)
  const before = '(?<![\\p{L}\\p{N}_$@#/\\\\.\\-])'
  const after = '(?![\\p{L}\\p{N}_]|[\\-./\\\\@][\\p{L}\\p{N}_])'
  const re = new RegExp(`${before}(?:${alternatives.join('|')})${after}`, 'giu')
  return { re, forms }
}

function matcher(): Matcher {
  MATCHER ??= buildMatcher()
  return MATCHER
}

/**
 * Find glossary terms mentioned in a piece of plain text (whole-word, case-insensitive, matching term + aliases),
 * for auto-linking. Returns non-overlapping matches sorted by position; at most one match per term
 * (the first occurrence) unless `allOccurrences` is true. Longer phrases win over shorter ones ("unit test" over "test").
 * Abbreviations match only in their usual capitals ("API", "REST"). Everyday-English words that are also terms
 * ("state", "test", "class" …) only match when `opts.only` includes their term, or when written in `backticks`.
 * `opts.only` restricts matches to those term ids.
 */
export function findTermsInText(text: string, opts?: { allOccurrences?: boolean; only?: string[] }): { start: number; end: number; termId: string }[] {
  if (typeof text !== 'string' || text.length === 0) return []
  const { re, forms } = matcher()
  const only = opts?.only && opts.only.length > 0 ? new Set(opts.only) : null
  const all = opts?.allOccurrences === true
  const used = new Set<string>()
  const out: { start: number; end: number; termId: string }[] = []
  const rx = new RegExp(re.source, re.flags)

  /** The form's info if this spelling may link here, given case rules, `only` and common-word rules. */
  const accept = (spelled: string, start: number): FormInfo | null => {
    const info = forms.get(spelled.toLowerCase())
    if (!info) return null
    if (info.exact !== null && spelled !== info.exact) return null
    if (only && !only.has(info.termId)) return null
    if (info.common && !(only && only.has(info.termId))) {
      const inBackticks = text[start - 1] === '`' && text[start + spelled.length] === '`'
      if (!inBackticks) return null
    }
    return info
  }

  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) {
    const start = m.index
    let spelled = m[0]
    let info = accept(spelled, start)
    if (!info) {
      // A longer phrase was ruled out ("API request" when only "api" is wanted): try its shorter word-boundary prefixes.
      let shorter: { spelled: string; info: FormInfo } | null = null
      for (let k = spelled.length - 1; k > 0 && !shorter; k--) {
        if (WORD_CHAR.test(spelled[k])) continue
        if (/[-./\\@]/.test(spelled[k]) && WORD_CHAR.test(spelled[k + 1] ?? '')) continue
        const candidate = spelled.slice(0, k)
        const ok = accept(candidate, start)
        if (ok) shorter = { spelled: candidate, info: ok }
      }
      if (!shorter) {
        rx.lastIndex = start + 1
        continue
      }
      spelled = shorter.spelled
      info = shorter.info
      rx.lastIndex = start + spelled.length
    }
    // Already linked once: consume the phrase so its words don't link separately.
    if (!all && used.has(info.termId)) continue
    used.add(info.termId)
    out.push({ start, end: start + spelled.length, termId: info.termId })
  }
  return out
}
