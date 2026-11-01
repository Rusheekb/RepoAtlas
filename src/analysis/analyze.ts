import type {
  AnalyzedFile,
  CodeSymbol,
  ExternalPackage,
  FileEdge,
  FileRole,
  Layer,
  LanguageStat,
  ModuleInfo,
  RawImport,
  RepoAnalysis,
  RepoSnapshot,
  RepoStats,
  RouteInfo,
  TechItem,
  TreeEntry,
} from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { ancestors, basename, depthOf, dirname, extname } from '@/core/paths'
import { formatNumber } from '@/core/format'
import { detectTechStack, docsSiteRoots, findRelevantTerms, lookupPackage, parseManifests, type Ecosystem, type ImportedPackage, type ManifestInfo } from '@/knowledge'
import { detectLanguage, type LanguageDef } from './languages'
import { extractImports } from './imports'
import { createResolver, type ResolvedImport, type Resolver } from './resolve'
import { extractSymbols } from './symbols'
import { extractRoutes } from './routes'
import { classifyFile } from './classify'
import { buildModuleEdges, buildModules } from './modules'
import { findEntryPoints, findHubs, type EntryPoint } from './graph'
import { detectProjectKind } from './projectKind'
import { projectDisplayName, summarizeFile, writeOverview } from './summaries'
import { buildLearningPath } from './learningPath'
import { buildStarterConcepts, buildStarterTours } from './starter'
import { ecosystemOf, familyOf } from './structure/family'
import { isPeripheral, isTestFileName, isWrapperScript, zonesOf } from './structure/zones'
import { clearSignalCache } from './structure/signals'
import { addSamePackageImports } from './structure/samePackage'
import { dict } from '@/core/dict'

/** Let the browser paint (progress messages, spinners) between heavy phases. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const warned = new Set<string>()

/** Run a collaborator defensively: one misbehaving parser must never sink the whole analysis. */
function safe<T>(label: string, fn: () => T, fallback: T): T {
  try {
    const v = fn()
    return v ?? fallback
  } catch (err) {
    if (!warned.has(label)) {
      warned.add(label)
      console.warn(`[analysis] ${label} failed; continuing without it.`, err)
    }
    return fallback
  }
}

function emptyManifests(): ManifestInfo {
  return { dependencies: [], scripts: [], entryHints: [], workspaces: [], psr4: {}, projectNames: [], descriptions: [] }
}

/** Fill any fields a manifest parser left out, so later steps can rely on them. */
function normalizeManifests(m: Partial<ManifestInfo> | null | undefined): ManifestInfo {
  const base = emptyManifests()
  if (!m || typeof m !== 'object') return base
  return {
    dependencies: Array.isArray(m.dependencies) ? m.dependencies.filter((d) => d && typeof d.name === 'string') : [],
    scripts: Array.isArray(m.scripts) ? m.scripts : [],
    entryHints: Array.isArray(m.entryHints) ? m.entryHints.filter((h) => h && typeof h.path === 'string') : [],
    workspaces: Array.isArray(m.workspaces) ? m.workspaces.filter((w) => typeof w === 'string') : [],
    goModulePath: typeof m.goModulePath === 'string' ? m.goModulePath : undefined,
    psr4: m.psr4 && typeof m.psr4 === 'object' ? m.psr4 : {},
    projectNames: Array.isArray(m.projectNames) ? m.projectNames.filter((n) => typeof n === 'string') : [],
    descriptions: Array.isArray(m.descriptions) ? m.descriptions.filter((n) => typeof n === 'string') : [],
  }
}

function countLines(text: string): number {
  if (!text) return 0
  let n = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return text.endsWith('\n') ? n : n + 1
}

/**
 * Language bytes are counted for real code only — not vendored copies, build output, minified bundles or the build-tool
 * launcher scripts projects copy in unchanged (mvnw, gradlew …).
 */
function countsForLanguages(path: string): boolean {
  const zones = zonesOf(path)
  if (zones.includes('vendor') || zones.includes('generated') || isWrapperScript(path)) return false
  return !/\.min\.(js|css|mjs)$|\.(js|css)\.map$|\.bundle\.js$/i.test(path)
}

function languageStats(entries: TreeEntry[], langOf: Map<string, LanguageDef | null>): LanguageStat[] {
  const by = new Map<string, { bytes: number; files: number; color: string }>()
  for (const e of entries) {
    const lang = langOf.get(e.path)
    if (!lang || !lang.isCode || !countsForLanguages(e.path)) continue
    const s = by.get(lang.name) ?? { bytes: 0, files: 0, color: lang.color }
    s.bytes += Math.max(0, e.size || 0)
    s.files++
    by.set(lang.name, s)
  }
  const totalBytes = [...by.values()].reduce((s, x) => s + x.bytes, 0)
  const totalFiles = [...by.values()].reduce((s, x) => s + x.files, 0)
  // An all-empty repo still gets sensible shares (by file count).
  const weight = (x: { bytes: number; files: number }) => (totalBytes > 0 ? x.bytes : x.files)
  const total = totalBytes > 0 ? totalBytes : totalFiles
  return [...by.entries()]
    .map(([name, x]) => ({ name, bytes: x.bytes, files: x.files, percent: total > 0 ? Math.round((weight(x) / total) * 1000) / 10 : 0, color: x.color }))
    .sort((a, b) => b.bytes - a.bytes || b.files - a.files || a.name.localeCompare(b.name))
}

/**
 * The project's welcome note: the top-level README, else one in the docs or .github folder or in the main code
 * (src/README.md). A README inside an example, a test fixture or a vendored copy describes something else, so
 * it's never used as "the authors' own words" about the project.
 */
export function pickReadme(paths: string[], contents: Record<string, string>): { path: string; content: string } | null {
  const candidates = paths.filter((p) => {
    if (!/^readme(\.[a-z0-9]+)?$/i.test(basename(p)) || typeof contents[p] !== 'string') return false
    if (depthOf(p) === 0) return true
    const zones = zonesOf(p)
    if (zones.some((z) => z === 'example' || z === 'test' || z === 'vendor' || z === 'generated')) return false
    return depthOf(p) <= 1
  })
  if (candidates.length === 0) return null
  const extRank = (p: string) => {
    const ext = extname(p)
    return ext === 'md' || ext === 'markdown' ? 0 : ext === 'mdx' ? 1 : ext === 'rst' ? 2 : ext === 'txt' || ext === '' ? 3 : 4
  }
  const docsDir = (p: string) => (/^(docs?|\.github)\//i.test(p) ? 0 : 1)
  const best = [...candidates].sort((a, b) => depthOf(a) - depthOf(b) || docsDir(a) - docsDir(b) || extRank(a) - extRank(b) || a.localeCompare(b))[0]
  return { path: best, content: contents[best] }
}

interface Parsed {
  imports: string[]
  externalImports: string[]
  /** For each outside package, the import paths that pointed at it ("go.mongodb.org/mongo-driver/v2/bson"). */
  externalSpecifiers: Map<string, string[]>
  unresolvedImports: string[]
  symbols: CodeSymbol[]
  routes: RouteInfo[]
}

const EMPTY_PARSE: Parsed = { imports: [], externalImports: [], externalSpecifiers: new Map(), unresolvedImports: [], symbols: [], routes: [] }
const MAX_UNRESOLVED_PER_FILE = 50
/** Import paths remembered per outside package (enough to tell "only its bson sub-package" from real use). */
const MAX_SPECIFIERS = 20
/** Very large files are listed but not parsed (they're almost always data or generated code). */
const MAX_PARSE_CHARS = 1_500_000

function parseFile(path: string, content: string, lang: LanguageDef, resolve: Resolver, exists: (p: string) => boolean): Parsed {
  if (!content || content.length > MAX_PARSE_CHARS || !lang.isCode) return EMPTY_PARSE
  const raw = safe<RawImport[]>('extractImports', () => extractImports(path, content, lang.name), [])
  const symbols = safe<CodeSymbol[]>('extractSymbols', () => extractSymbols(path, content, lang.name), [])
  const routes = safe<RouteInfo[]>('extractRoutes', () => extractRoutes(path, content, lang.name), [])
  const imports = new Set<string>()
  const external = new Set<string>()
  const specifiers = new Map<string, string[]>()
  const unresolved = new Set<string>()
  for (const imp of Array.isArray(raw) ? raw : []) {
    if (!imp || typeof imp.specifier !== 'string') continue
    const res = safe<ResolvedImport>('resolveImport', () => resolve(path, imp, lang.name), { type: 'unresolved' })
    switch (res.type) {
      case 'internal': {
        let any = false
        for (const target of res.paths ?? []) {
          if (target !== path && exists(target)) {
            imports.add(target)
            any = true
          }
        }
        if (!any && !(res.paths ?? []).includes(path) && unresolved.size < MAX_UNRESOLVED_PER_FILE) unresolved.add(imp.specifier)
        break
      }
      case 'external':
        if (res.packageName) {
          external.add(res.packageName)
          const list = specifiers.get(res.packageName) ?? []
          if (list.length < MAX_SPECIFIERS && !list.includes(imp.specifier)) list.push(imp.specifier)
          specifiers.set(res.packageName, list)
        }
        break
      case 'builtin':
        break
      default:
        if (unresolved.size < MAX_UNRESOLVED_PER_FILE) unresolved.add(imp.specifier)
    }
  }
  return {
    imports: [...imports],
    externalImports: [...external],
    externalSpecifiers: specifiers,
    unresolvedImports: [...unresolved],
    symbols: Array.isArray(symbols) ? symbols.filter((s) => s && typeof s.name === 'string') : [],
    routes: Array.isArray(routes) ? routes.filter((r) => r && typeof r.path === 'string') : [],
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Orchestrates the full static analysis: languages → manifests (knowledge/parseManifests) → per-file language, imports,
 * resolution, symbols, routes, classification → edges & importedBy → tech stack (knowledge/detectTechStack) →
 * modules & module edges → entry points & hubs → project kind → summaries → glossary terms → learning path →
 * starter concepts & tours → overview. Pure function of the snapshot (no network). Must handle 50k-file trees
 * (only fetched files are parsed) in well under a second for typical repos; yield to the event loop between phases.
 */
export async function analyzeRepo(snapshot: RepoSnapshot): Promise<RepoAnalysis> {
  clearSignalCache()
  try {
    return await analyze(snapshot)
  } finally {
    clearSignalCache()
  }
}

async function analyze(snapshot: RepoSnapshot): Promise<RepoAnalysis> {
  const contents: Record<string, string> = dict<string>()
  for (const [p, text] of Object.entries(snapshot.files ?? {})) if (typeof text === 'string') contents[p] = text

  // Every path once, in tree order; downloaded files missing from the tree are added too.
  const entryMap = new Map<string, TreeEntry>()
  for (const e of snapshot.tree ?? []) {
    if (e && typeof e.path === 'string' && e.path && !e.path.endsWith('/') && !entryMap.has(e.path)) entryMap.set(e.path, e)
  }
  for (const [p, text] of Object.entries(contents)) if (!entryMap.has(p)) entryMap.set(p, { path: p, size: text.length, sha: '' })
  const entries = [...entryMap.values()]
  const paths = entries.map((e) => e.path)
  const exists = (p: string) => entryMap.has(p)

  // 1. Languages (over the whole tree, by size).
  const langOf = new Map<string, LanguageDef | null>()
  for (const p of paths) langOf.set(p, safe('detectLanguage', () => detectLanguage(p), null))
  const languages = languageStats(entries, langOf)
  await tick()

  // 2. Manifests.
  const manifests = normalizeManifests(safe<ManifestInfo | null>('parseManifests', () => parseManifests(contents, paths), null))
  await tick()

  // 3. Read the downloaded code: imports, symbols, routes.
  const resolve: Resolver = safe<Resolver>(
    'createResolver',
    () => createResolver({ paths, files: contents, goModulePath: manifests.goModulePath, psr4: manifests.psr4 }),
    () => ({ type: 'unresolved' }),
  )
  const parsed = new Map<string, Parsed>()
  const packageFiles = new Map<string, { count: number; coreCount: number; ecosystem: Ecosystem | null; specifiers: Set<string> }>()
  // The project's own running code — not tests, examples, docs (or the docs website) or vendored copies.
  const siteRoots = safe<ReadonlySet<string>>('docsSiteRoots', () => docsSiteRoots(paths), new Set<string>())
  const inSite = (p: string) => siteRoots.size > 0 && p.includes('/') && siteRoots.has(p.slice(0, p.indexOf('/')))
  const isCoreCode = (p: string) => !isPeripheral(p) && !isTestFileName(basename(p)) && !inSite(p)
  let sinceYield = 0
  for (const p of paths) {
    const content = contents[p]
    const lang = langOf.get(p)
    if (content === undefined || !lang) continue
    const result = parseFile(p, content, lang, resolve, exists)
    parsed.set(p, result)
    const eco = ecosystemOf(familyOf(lang.name))
    const core = isCoreCode(p)
    for (const pkg of result.externalImports) {
      let cur = packageFiles.get(pkg)
      if (!cur) {
        cur = { count: 0, coreCount: 0, ecosystem: eco, specifiers: new Set() }
        packageFiles.set(pkg, cur)
      }
      cur.count++
      if (core) cur.coreCount++
      for (const spec of result.externalSpecifiers.get(pkg) ?? []) if (cur.specifiers.size < MAX_SPECIFIERS) cur.specifiers.add(spec)
    }
    if (++sinceYield >= 150) {
      sinceYield = 0
      await tick()
    }
  }
  await tick()

  // 4. Technologies.
  const importedPackages: ImportedPackage[] = [...packageFiles.entries()]
    .map(([name, v]) => ({ name, count: v.count, coreCount: v.coreCount, specifiers: [...v.specifiers] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const techStack = safe<TechItem[]>('detectTechStack', () => detectTechStack({ paths, files: contents, manifests, languages, importedPackages }), [])
  const techIds = new Set(techStack.map((t) => t.id))
  await tick()

  // 5. Classify every file and build its record.
  const files: Record<string, AnalyzedFile> = dict<AnalyzedFile>()
  for (const e of entries) {
    const p = e.path
    const content = contents[p]
    const fetched = content !== undefined
    const lang = langOf.get(p) ?? null
    const info = parsed.get(p) ?? EMPTY_PARSE
    const cls = safe(
      'classifyFile',
      () => classifyFile(p, { content, language: lang?.name ?? null, isCode: lang ? lang.isCode : undefined, symbols: info.symbols, routes: info.routes, techIds }),
      { kind: 'other' as const, role: 'other' as const, layer: 'other' as const },
    )
    files[p] = {
      path: p,
      name: basename(p),
      dir: dirname(p),
      ext: extname(p),
      language: lang?.name ?? null,
      size: Math.max(0, e.size || (fetched ? content.length : 0)),
      lines: fetched ? countLines(content) : null,
      fetched,
      kind: cls.kind,
      role: cls.role,
      layer: cls.layer,
      isEntry: false,
      moduleId: ROOT_MODULE_ID,
      imports: info.imports,
      externalImports: info.externalImports,
      unresolvedImports: info.unresolvedImports,
      importedBy: [],
      symbols: info.symbols,
      routes: info.routes,
      summary: '',
    }
  }
  await tick()

  // 6. Who uses whom (including same-package use in Java/Kotlin, which needs no import line).
  safe('addSamePackageImports', () => addSamePackageImports(files, contents), 0)
  const fileEdges: FileEdge[] = []
  for (const f of Object.values(files)) {
    for (const target of f.imports) {
      const t = files[target]
      if (!t || target === f.path) continue
      t.importedBy.push(f.path)
      fileEdges.push({ source: f.path, target })
    }
  }
  const fileList = Object.values(files)
  await tick()

  // 7. Starting points.
  const entryPoints = safe(
    'findEntryPoints',
    () => findEntryPoints(fileList, manifests, contents, { projectNames: [snapshot.meta?.repo ?? '', ...manifests.projectNames] }),
    [] as EntryPoint[],
  ).filter((e) => files[e.path])
  for (const ep of entryPoints) {
    const f = files[ep.path]
    f.isEntry = true
    f.entryReason = ep.reason
    // Only a clear start-up signal turns plain code into a "starting point"; a hunch from the import graph doesn't.
    if (!ep.weak && (f.role === 'library' || f.role === 'other')) f.role = 'entry'
  }
  await tick()

  // 8. Modules.
  const { modules: builtModules, assignments } = safe(
    'buildModules',
    () => buildModules(fileList, { workspaces: manifests.workspaces, projectName: snapshot.meta?.repo, techIds }),
    { modules: [] as ModuleInfo[], assignments: {} as Record<string, string> },
  )
  const modules = ensureEveryFileHasAModule(builtModules, assignments, fileList)
  for (const f of fileList) f.moduleId = assignments[f.path] ?? ROOT_MODULE_ID
  const moduleEdges = safe('buildModuleEdges', () => buildModuleEdges(fileEdges, assignments), [])
  const hubs = safe('findHubs', () => findHubs(fileList), [])
  await tick()

  // 9. What kind of project is this?
  const readme = pickReadme(paths, contents)
  const projectKind = safe(
    'detectProjectKind',
    () =>
      detectProjectKind({
        files: fileList,
        techStack,
        manifests,
        readme: readme?.content ?? null,
        topics: snapshot.meta?.topics ?? [],
        description: snapshot.meta?.description ?? null,
        contents,
        repoName: snapshot.meta?.repo,
      }),
    { id: 'unknown', label: 'Software project', description: 'A software project.', emoji: '📁', confidence: 0.2, reasons: [] },
  )
  // For toolboxes (libraries, plugins), the "front door" people import matters more than a helper command.
  if (projectKind.id === 'library' || projectKind.id === 'plugin') {
    const door = (p: string) => /front door|named after the project|built from this file|says this is the main/i.test(files[p]?.entryReason ?? '')
    entryPoints.sort((a, b) => Number(door(b.path)) - Number(door(a.path)))
  }
  await tick()

  // 10. One sentence per file.
  for (const f of fileList) f.summary = summarizeFile(f)
  await tick()

  // 11. Outside packages, numbers, glossary.
  const techByNorm = new Map<string, string>()
  for (const t of techStack) {
    techByNorm.set(norm(t.id), t.id)
    techByNorm.set(norm(t.name), t.id)
  }
  const externalPackages: ExternalPackage[] = [...packageFiles.entries()]
    .map(([name, v]) => {
      const techId = (v.ecosystem ? safe('lookupPackage', () => lookupPackage(v.ecosystem as Ecosystem, name)?.id, undefined) : undefined) ?? techByNorm.get(norm(name))
      return techId ? { name, count: v.count, techId } : { name, count: v.count }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const folders = new Set<string>()
  let maxDepth = 0
  for (const p of paths) {
    for (const a of ancestors(p)) folders.add(a)
    maxDepth = Math.max(maxDepth, depthOf(p))
  }
  const stats: RepoStats = {
    totalFiles: fileList.length,
    analyzedFiles: fileList.filter((f) => f.fetched).length,
    totalBytes: fileList.reduce((s, f) => s + f.size, 0),
    totalLines: fileList.reduce((s, f) => s + (f.lines ?? 0), 0),
    sourceFiles: fileList.filter((f) => f.kind === 'source').length,
    testFiles: fileList.filter((f) => f.kind === 'test').length,
    languageCount: languages.length,
    folderCount: folders.size,
    maxDepth,
    internalEdges: fileEdges.length,
    externalPackages: externalPackages.length,
  }

  const roleCounts = new Map<FileRole, number>()
  const layersPresent = new Set<Layer>()
  for (const f of fileList) {
    roleCounts.set(f.role, (roleCounts.get(f.role) ?? 0) + 1)
    layersPresent.add(f.layer)
  }
  const glossaryTermIds = safe(
    'findRelevantTerms',
    () =>
      findRelevantTerms({
        techIds: techStack.map((t) => t.id),
        roles: [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r),
        layers: [...layersPresent],
        projectKind: projectKind.id,
        languages: languages.map((l) => l.name),
      }),
    [] as string[],
  )
  await tick()

  // 12. The story: overview, learning path, starter concepts and tours.
  const base = {
    meta: snapshot.meta,
    ref: snapshot.ref,
    commitSha: snapshot.commitSha,
    files,
    fileEdges,
    modules,
    moduleEdges,
    languages,
    techStack,
    projectKind,
    entryPoints: entryPoints.map((e) => e.path),
    hubs,
    externalPackages,
    readme,
    stats,
    glossaryTermIds,
    warnings: buildWarnings(snapshot, stats, fileList),
    analyzedAt: Date.now(),
  }
  const displayName = projectDisplayName(snapshot.meta?.repo ?? '', manifests.projectNames)
  const overview = safe('writeOverview', () => writeOverview(base, { name: displayName }), '')
  const learningPath = safe('buildLearningPath', () => buildLearningPath({ ...base, overview }, { name: displayName }), [])
  await tick()
  const starterConcepts = safe('buildStarterConcepts', () => buildStarterConcepts({ ...base, overview, learningPath }, contents, { name: displayName }), {
    concepts: [],
    relations: [],
    source: 'starter' as const,
  })
  const starterTours = safe('buildStarterTours', () => buildStarterTours({ ...base, overview, learningPath }, contents), [])

  return { ...base, overview, learningPath, starterConcepts, starterTours }
}

/** If module building failed or missed files, put the stragglers in a top-level module so every file has a home. */
function ensureEveryFileHasAModule(modules: ModuleInfo[], assignments: Record<string, string>, files: AnalyzedFile[]): ModuleInfo[] {
  const ids = new Set(modules.map((m) => m.id))
  const stray = files.filter((f) => !assignments[f.path] || !ids.has(assignments[f.path]))
  if (stray.length === 0) return modules
  let root = modules.find((m) => m.id === ROOT_MODULE_ID)
  if (!root) {
    root = {
      id: ROOT_MODULE_ID,
      name: 'Project setup files',
      path: '',
      layer: 'config',
      role: 'Project setup files',
      description: 'Loose files at the top of the project: settings, instructions and the welcome note (README).',
      emoji: '🧭',
      files: [],
      fileCount: 0,
      lines: 0,
      bytes: 0,
      languages: [],
      keyFiles: [],
      layerBreakdown: {},
    }
    modules = [...modules, root]
  }
  for (const f of stray) {
    assignments[f.path] = ROOT_MODULE_ID
    root.files.push(f.path)
    root.fileCount++
    root.lines += f.lines ?? 0
    root.bytes += f.size
  }
  return modules
}

function buildWarnings(snapshot: RepoSnapshot, stats: RepoStats, files: AnalyzedFile[]): string[] {
  const warnings: string[] = []
  const skipped = Array.isArray(snapshot.skipped) ? snapshot.skipped : []
  const by = (reason: string) => skipped.filter((s) => s?.reason === reason).length
  if (stats.totalFiles === 0) {
    warnings.push('This repository looks empty — there are no files to explore yet.')
    return warnings
  }
  if (snapshot.treeTruncated) warnings.push('This project is so big that GitHub only shared part of its file list, so some folders may be missing from the maps.')
  if (by('limit') > 0) {
    warnings.push(
      `We read the ${formatNumber(stats.analyzedFiles)} most important of ${formatNumber(stats.totalFiles)} files. The rest still appear on the maps (sized by how big they are), but we didn’t look inside them.`,
    )
  }
  const tooLarge = by('too-large')
  if (tooLarge > 0) warnings.push(`${tooLarge === 1 ? '1 very large file was' : `${formatNumber(tooLarge)} very large files were`} skipped (over 512 KB each), so we can’t show what’s inside.`)
  const failed = by('fetch-failed')
  if (failed > 0) warnings.push(`We couldn’t download ${failed === 1 ? '1 file' : `${formatNumber(failed)} files`}, so ${failed === 1 ? 'it appears' : 'they appear'} without details.`)
  if (stats.sourceFiles === 0) {
    warnings.push('We didn’t find any program code here — it looks like documents, settings or data. The maps still show how it’s organized.')
  } else if (!files.some((f) => f.kind === 'source' && f.fetched)) {
    warnings.push('We couldn’t read any of the program code itself, so explanations are based on file names and folders only.')
  }
  return warnings
}
