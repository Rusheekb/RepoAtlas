/**
 * Shared data contracts for RepoAtlas.
 *
 * Pipeline:  GitHub (src/github)  ──►  RepoSnapshot
 *            Analysis (src/analysis + src/knowledge)  ──►  RepoAnalysis
 *            UI (src/pages, src/components) renders RepoAnalysis
 *            AI (src/ai) adds deeper explanations on demand using the user's own Claude API key.
 *
 * Everything runs in the browser. There is no server.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GitHub ingestion
// ─────────────────────────────────────────────────────────────────────────────

/** What the user asked for: a repository and (optionally) a branch / tag / commit. */
export interface RepoRef {
  owner: string
  repo: string
  /** Branch, tag or commit SHA. Undefined = the repository's default branch. */
  ref?: string
}

export interface RepoMeta {
  owner: string
  repo: string
  /** "owner/repo" with GitHub's canonical casing. */
  fullName: string
  description: string | null
  homepage: string | null
  htmlUrl: string
  ownerAvatarUrl: string
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  topics: string[]
  license: string | null
  /** GitHub's own guess at the main language, e.g. "TypeScript". */
  primaryLanguage: string | null
  createdAt: string
  pushedAt: string
  sizeKb: number
  isPrivate: boolean
  isFork: boolean
  archived: boolean
}

/** One file (git blob) in the repository tree. Folders are implied by paths. */
export interface TreeEntry {
  /** POSIX path relative to the repo root, no leading slash. e.g. "src/app/main.ts" */
  path: string
  /** Size in bytes. */
  size: number
  sha: string
}

/** Raw material fetched from GitHub. Contents are only fetched for a prioritized subset of files. */
export interface RepoSnapshot {
  meta: RepoMeta
  /** The branch / tag / sha that was resolved (defaults to meta.defaultBranch). */
  ref: string
  /** Commit SHA the snapshot was taken at (used for cache keys and raw file URLs). */
  commitSha: string
  /** Every blob in the repo (possibly truncated for gigantic repos; see treeTruncated). */
  tree: TreeEntry[]
  /** GitHub truncates trees over ~100k entries / 7 MB. */
  treeTruncated: boolean
  /** path → UTF-8 text content, for the files we downloaded. */
  files: Record<string, string>
  /** Files we deliberately did not download, and why. */
  skipped: { path: string; reason: SkipReason }[]
  fetchedAt: number
}

export type SkipReason =
  | 'binary'
  | 'too-large'
  | 'vendored'
  | 'generated'
  | 'lockfile'
  | 'limit'
  | 'fetch-failed'

export type LoadStage = 'meta' | 'tree' | 'files' | 'analyze' | 'done'

export interface LoadProgress {
  stage: LoadStage
  /** Friendly, plain-English status line ("Reading 120 of 340 files…"). */
  message: string
  done?: number
  total?: number
}

/** How much of the repo to download for analysis. */
export type AnalysisDepth = 'quick' | 'standard' | 'deep'

export type GitHubErrorKind =
  | 'invalid-input'
  | 'not-found'
  | 'rate-limited'
  | 'unauthorized'
  | 'network'
  | 'empty'
  | 'unknown'

// ─────────────────────────────────────────────────────────────────────────────
// Static analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Layers" are the plain-English families of code we color by everywhere (graphs, treemap, badges).
 * Fixed order = fixed palette slot (see src/core/labels.ts LAYER_INFO). Never re-map.
 */
export type Layer =
  | 'ui' // what people see: screens, components, pages, styles
  | 'api' // how it talks to the outside world: routes, endpoints, network clients, CLIs
  | 'logic' // the core rules and processing
  | 'data' // data shapes, storage, databases, models, migrations
  | 'test' // automated checks
  | 'config' // settings and setup
  | 'docs' // documentation & guides
  | 'infra' // build, deploy, CI, containers, scripts
  | 'other' // assets, misc

export const LAYERS: readonly Layer[] = [
  'ui',
  'api',
  'logic',
  'data',
  'test',
  'config',
  'docs',
  'infra',
  'other',
] as const

/** Broad file type. */
export type FileKind =
  | 'source'
  | 'test'
  | 'config'
  | 'docs'
  | 'style'
  | 'markup'
  | 'data'
  | 'asset'
  | 'build'
  | 'script'
  | 'generated'
  | 'other'

/** What job a file does. Labels/descriptions live in src/core/labels.ts ROLE_INFO. */
export type FileRole =
  | 'entry'
  | 'page'
  | 'component'
  | 'layout'
  | 'hook'
  | 'state'
  | 'route'
  | 'controller'
  | 'middleware'
  | 'service'
  | 'client'
  | 'model'
  | 'schema'
  | 'migration'
  | 'repository'
  | 'util'
  | 'types'
  | 'constants'
  | 'config'
  | 'test'
  | 'fixture'
  | 'style'
  | 'docs'
  | 'script'
  | 'build'
  | 'ci'
  | 'container'
  | 'asset'
  | 'i18n'
  | 'cli'
  | 'library'
  | 'other'

export type SymbolKind =
  | 'function'
  | 'class'
  | 'component'
  | 'hook'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'constant'
  | 'variable'
  | 'module'

/** A named thing defined in a file (function, class, component …). Line numbers are 1-based. */
export interface CodeSymbol {
  name: string
  kind: SymbolKind
  line: number
  exported: boolean
  /** Short one-line signature, e.g. "function login(email, password)". */
  signature?: string
}

/** An HTTP endpoint the file defines, e.g. Express `app.get('/users')` or Flask `@app.route('/')`. */
export interface RouteInfo {
  method: string // 'GET' | 'POST' | … | 'ANY'
  path: string
  line: number
}

/** An import statement as written in the source, before resolution. */
export interface RawImport {
  /** The specifier exactly as written: './utils', 'react', 'os.path', 'github.com/x/y', 'crate::db'. */
  specifier: string
  line: number
  /** Optional names imported (for display only). */
  names?: string[]
  /** e.g. 'import' | 'require' | 'dynamic' | 'include' | 'use' | 'mod' */
  kind?: string
}

export interface AnalyzedFile {
  path: string
  /** Base name, e.g. "main.ts" */
  name: string
  /** Parent folder path ('' for root files). */
  dir: string
  /** Lower-case extension without dot ('' if none). */
  ext: string
  /** Display language ("TypeScript", "Python" …) or null when unknown / not code. */
  language: string | null
  size: number
  /** Line count (only for files whose contents were downloaded). */
  lines: number | null
  /** Whether contents are in RepoSnapshot.files. */
  fetched: boolean
  kind: FileKind
  role: FileRole
  layer: Layer
  isEntry: boolean
  /** Why we think this is a starting point, in plain English. */
  entryReason?: string
  /** The architecture-level module (ModuleInfo.id) this file belongs to. */
  moduleId: string
  /** Resolved internal imports (repo paths). */
  imports: string[]
  /** External packages used (normalized package names, e.g. "react", "flask", "github.com/gin-gonic/gin"). */
  externalImports: string[]
  /** Specifiers we could not resolve (relative paths that point nowhere, aliases we don't understand …). */
  unresolvedImports: string[]
  /** Repo paths of files that import this one. */
  importedBy: string[]
  symbols: CodeSymbol[]
  routes: RouteInfo[]
  /** Heuristic one-sentence plain-English description. */
  summary: string
}

/** An architecture-level grouping of files (usually a folder). */
export interface ModuleInfo {
  /** Stable id: the folder path, or ROOT_MODULE_ID for loose files at the root. */
  id: string
  /** Display name, e.g. "components" or "Project setup files". */
  name: string
  /** Folder path ('' for root module). */
  path: string
  /** Dominant layer (by lines of code). */
  layer: Layer
  /** Short plain-English role label, e.g. "Reusable screen pieces". */
  role: string
  /** 1–3 sentence heuristic plain-English description. */
  description: string
  /** A single emoji used as the module's icon. */
  emoji: string
  /** Every file path assigned to this module. */
  files: string[]
  fileCount: number
  lines: number
  bytes: number
  /** Languages present, most-used first. */
  languages: string[]
  /** Most important files (entry points / most imported), max ~5. */
  keyFiles: string[]
  /** Lines of code per layer. */
  layerBreakdown: Partial<Record<Layer, number>>
}

export const ROOT_MODULE_ID = '(root)'

/** "Module A uses module B" — aggregated from file imports. */
export interface ModuleEdge {
  source: string
  target: string
  /** Number of file-level import links behind this edge. */
  weight: number
  /** A few concrete examples: which file imports which. */
  examples: { from: string; to: string }[]
}

export interface FileEdge {
  /** Importing file. */
  source: string
  /** Imported file. */
  target: string
}

export interface LanguageStat {
  name: string
  bytes: number
  files: number
  /** 0–100 */
  percent: number
  /** Hex color (GitHub linguist-style). */
  color: string
}

export type TechCategory =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'desktop'
  | 'database'
  | 'data-science'
  | 'ai'
  | 'styling'
  | 'state'
  | 'testing'
  | 'build'
  | 'quality'
  | 'infra'
  | 'ci'
  | 'docs'
  | 'api'
  | 'auth'
  | 'payments'
  | 'cloud'
  | 'cli'
  | 'game'
  | 'utility'
  | 'package-manager'

/** A technology detected in the repo, explained for non-technical readers. */
export interface TechItem {
  id: string
  name: string
  category: TechCategory
  /** 1–2 plain-English sentences: what it is and what it does *for this kind of project*. */
  description: string
  /** Everyday analogy ("like LEGO bricks for web pages"). */
  analogy?: string
  url?: string
  /** Where we saw it: ["package.json → dependencies", "Dockerfile"]. */
  evidence: string[]
  importance: 'core' | 'supporting' | 'tooling'
}

export type ProjectKindId =
  | 'web-app'
  | 'website'
  | 'api-server'
  | 'library'
  | 'cli-tool'
  | 'mobile-app'
  | 'desktop-app'
  | 'browser-extension'
  | 'data-science'
  | 'ml-model'
  | 'game'
  | 'infrastructure'
  | 'documentation'
  | 'monorepo'
  | 'bot'
  | 'plugin'
  | 'unknown'

export interface ProjectKind {
  id: ProjectKindId
  /** e.g. "Web application" */
  label: string
  /** Plain-English explanation of what this kind of project is. */
  description: string
  emoji: string
  /** 0–1 */
  confidence: number
  /** Plain-English evidence ("Uses React, a toolkit for building web pages"). */
  reasons: string[]
}

export type GlossaryCategory =
  | 'basics'
  | 'web'
  | 'data'
  | 'tools'
  | 'architecture'
  | 'testing'
  | 'devops'
  | 'languages'
  | 'security'
  | 'ai'

export interface GlossaryTerm {
  id: string
  term: string
  /** Other spellings / plurals that should link to this term ("APIs", "endpoint"). */
  aliases: string[]
  /** One plain-English sentence. */
  short: string
  /** A short paragraph with more depth. */
  long: string
  analogy?: string
  category: GlossaryCategory
  related?: string[]
}

export type ViewId =
  | 'overview'
  | 'map'
  | 'codemap'
  | 'concepts'
  | 'tours'
  | 'explore'
  | 'ask'
  | 'quiz'
  | 'glossary'

export type LearningTarget =
  | { type: 'readme' }
  | { type: 'file'; path: string }
  | { type: 'module'; id: string }
  | { type: 'view'; view: ViewId }

export interface LearningStep {
  id: string
  title: string
  /** Why this step matters, plain English. */
  description: string
  target: LearningTarget
  /** Rough reading time in minutes. */
  minutes: number
}

export interface RepoStats {
  totalFiles: number
  /** Files whose contents were downloaded and parsed. */
  analyzedFiles: number
  totalBytes: number
  /** Lines across analyzed files. */
  totalLines: number
  sourceFiles: number
  testFiles: number
  languageCount: number
  folderCount: number
  maxDepth: number
  internalEdges: number
  externalPackages: number
}

export interface ExternalPackage {
  name: string
  /** How many files import it. */
  count: number
  /** TechItem.id if it maps to a known technology. */
  techId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanations (produced heuristically by analysis, or by Claude on demand)
// ─────────────────────────────────────────────────────────────────────────────

export type ConceptCategory = 'data' | 'feature' | 'process' | 'actor' | 'technology' | 'idea'

/** A key idea in the project (a domain thing like "Order", a process like "Checkout", or a technical idea). */
export interface Concept {
  /** kebab-case, unique within the map */
  id: string
  name: string
  emoji: string
  category: ConceptCategory
  /** One plain-English sentence. */
  summary: string
  /** Markdown, 1–4 short paragraphs. */
  explanation: string
  /** Everyday analogy. */
  analogy: string
  /** Repo paths where this concept lives. */
  files: string[]
  /** 1 (minor) – 5 (central) */
  importance: number
}

export interface ConceptRelation {
  from: string
  to: string
  /** Verb phrase read as "from → label → to", e.g. "is stored in". */
  label: string
}

export interface ConceptMap {
  concepts: Concept[]
  relations: ConceptRelation[]
  /** 'starter' = heuristic, 'ai' = generated by Claude. */
  source: 'starter' | 'ai'
}

export interface TourStep {
  title: string
  /** Markdown, plain English. */
  explanation: string
  /** Repo path this step points at (or null for a conceptual step). */
  file: string | null
  /** A short line of code copied verbatim from `file` that the step refers to (used to find & highlight it). */
  snippet: string | null
  /** ModuleInfo.id to highlight on the architecture map (or null). */
  moduleId: string | null
}

/** A guided walkthrough answering one question, e.g. "What happens when the app starts?" */
export interface Tour {
  id: string
  title: string
  question: string
  emoji: string
  summary: string
  steps: TourStep[]
  source: 'starter' | 'ai'
}

export interface QuizQuestion {
  question: string
  options: string[]
  answerIndex: number
  /** Why the answer is right, plain English. */
  explanation: string
}

export interface Quiz {
  questions: QuizQuestion[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  error?: string
}

/** The full result of static analysis. Everything the UI needs, with no AI required. */
export interface RepoAnalysis {
  meta: RepoMeta
  ref: string
  commitSha: string
  /** Every file in the tree keyed by path (fetched or not). */
  files: Record<string, AnalyzedFile>
  fileEdges: FileEdge[]
  modules: ModuleInfo[]
  moduleEdges: ModuleEdge[]
  languages: LanguageStat[]
  techStack: TechItem[]
  projectKind: ProjectKind
  /** Likely starting points, most likely first. */
  entryPoints: string[]
  /** Files many others depend on, most depended-on first. */
  hubs: string[]
  externalPackages: ExternalPackage[]
  readme: { path: string; content: string } | null
  stats: RepoStats
  /** GlossaryTerm ids relevant to this repo, most relevant first. */
  glossaryTermIds: string[]
  learningPath: LearningStep[]
  /** Heuristic plain-English overview (markdown). */
  overview: string
  /** Heuristic concept map so the Key Ideas view works without AI. */
  starterConcepts: ConceptMap
  /** Heuristic tours so the Guided Tours view works without AI. */
  starterTours: Tour[]
  /** Things the reader should know about the analysis' limits (plain English). */
  warnings: string[]
  analyzedAt: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/** How technical explanations should be. */
export type ReadingLevel = 'eli5' | 'beginner' | 'intermediate' | 'expert'

export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'

/** How much of the repo's code Claude reads as background for each answer. */
export type ContextSize = 'small' | 'medium' | 'large'

export type ThemePref = 'system' | 'light' | 'dark'

/** Something the global "Explain" side panel can explain. */
export type ExplainTarget =
  | { type: 'module'; id: string }
  | { type: 'file'; path: string }
  | { type: 'folder'; path: string }
  | { type: 'concept'; concept: Concept }
  | { type: 'tech'; id: string }
  | { type: 'term'; id: string }
