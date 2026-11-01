import type { AnalyzedFile, FileEdge, FileRole, Layer, ModuleEdge, ModuleInfo } from '@/core/types'
import { LAYERS, ROOT_MODULE_ID } from '@/core/types'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import { formatCompact } from '@/core/format'
import { basename, dirname } from '@/core/paths'
import { describeFolder } from '@/knowledge'
import { count, listJoin, safeName, sentence } from './structure/text'
import { zonesOf, type Zone } from './structure/zones'
import { dict } from '@/core/dict'

export interface BuildModulesOptions {
  /** Workspace globs / folders declared by manifests ("packages/*", "apps/web"); each package becomes its own module. */
  workspaces?: string[]
  /** The project's name, used to label the top-level module when the main code lives right at the root. */
  projectName?: string
}

/** Aim for a readable map. */
const MIN_MODULES = 6
const MAX_MODULES = 24
/** A module holding more than this share of the project's own code gets opened up into its sub-folders. */
const DOMINANT_SHARE = 0.55
/** Top-level folders that hold several separate packages. */
const CONTAINER_NAMES = new Set(['packages', 'apps', 'crates', 'libs', 'services'])

/**
 * Estimated lines in a file: the real count when it was downloaded, otherwise size / 40 for text files.
 * Media, generated files and unknown binaries count as zero.
 */
export function fileLines(f: AnalyzedFile): number {
  if (f.lines != null) return f.lines
  if (f.kind === 'asset' || f.kind === 'generated' || (f.kind === 'other' && !f.language)) return 0
  return Math.round(f.size / 40)
}

/** Weight used to decide the map's structure: real code counts fully, prose a little, borrowed/generated nothing. */
function structuralWeight(f: AnalyzedFile): number {
  const lines = fileLines(f)
  let w: number
  if (f.kind === 'generated' || f.kind === 'asset' || (f.layer === 'other' && f.role === 'library')) w = 0
  else if (f.kind === 'docs' || f.kind === 'data') w = lines * 0.25
  else w = lines
  return w + 0.5
}

interface Node {
  path: string
  children: Map<string, Node>
  files: AnalyzedFile[]
  weight: number
}

interface Mod {
  id: string
  path: string
  /** The folder whose *direct* files belong to this module (after its sub-folders were split off). */
  direct: Node | null
  /** Whole folder subtrees belonging to this module. */
  subtrees: Node[]
  /** True for one package of a multi-package repository. */
  isPackage?: boolean
}

function newNode(path: string): Node {
  return { path, children: new Map(), files: [], weight: 0 }
}

function buildTree(files: AnalyzedFile[]): Node {
  const root = newNode('')
  for (const f of files) {
    const w = structuralWeight(f)
    root.weight += w
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      let child = node.children.get(seg)
      if (!child) {
        child = newNode(node.path ? `${node.path}/${seg}` : seg)
        node.children.set(seg, child)
      }
      child.weight += w
      node = child
    }
    node.files.push(f)
  }
  return root
}

function* subtreeFiles(node: Node): Generator<AnalyzedFile> {
  yield* node.files
  for (const child of node.children.values()) yield* subtreeFiles(child)
}

const filesCache = new WeakMap<Mod, AnalyzedFile[]>()
const peripheralCache = new WeakMap<Mod, boolean>()

function modFiles(m: Mod): AnalyzedFile[] {
  const hit = filesCache.get(m)
  if (hit) return hit
  const out: AnalyzedFile[] = m.direct ? [...m.direct.files] : []
  for (const s of m.subtrees) for (const f of subtreeFiles(s)) out.push(f)
  filesCache.set(m, out)
  return out
}

/** Call after changing a module's contents. */
function invalidate(m: Mod): void {
  filesCache.delete(m)
  peripheralCache.delete(m)
}

function modWeight(m: Mod): number {
  let w = 0
  if (m.direct) for (const f of m.direct.files) w += structuralWeight(f)
  for (const s of m.subtrees) w += s.weight
  return w
}

const PERIPHERAL_LAYERS = new Set<Layer>(['test', 'docs', 'other', 'infra', 'config'])

/**
 * The layer that best describes a group of files, by lines. When a folder mixes real code with its tests or docs
 * (Go keeps tests next to the code), the real code decides — as long as it is a meaningful share.
 */
function dominantLayerOf(files: AnalyzedFile[]): Layer {
  const by = new Map<Layer, number>()
  let total = 0
  for (const f of files) {
    const w = fileLines(f) + 0.01
    by.set(f.layer, (by.get(f.layer) ?? 0) + w)
    total += w
  }
  const coreTotal = LAYERS.filter((l) => !PERIPHERAL_LAYERS.has(l)).reduce((s, l) => s + (by.get(l) ?? 0), 0)
  const pool = coreTotal >= total * 0.12 ? LAYERS.filter((l) => !PERIPHERAL_LAYERS.has(l)) : LAYERS
  let best: Layer = 'other'
  let bestW = -1
  for (const layer of pool) {
    const w = by.get(layer) ?? 0
    if (w > bestW) {
      best = layer
      bestW = w
    }
  }
  return best
}

/** Labels for supporting folders when the folder knowledge base has nothing to say. */
const ZONE_FALLBACK: Record<Zone, { role: string; description: string; emoji: string }> = {
  test: { role: 'Automatic checks', description: 'Tests that check the code still works after every change.', emoji: '✅' },
  example: { role: 'Examples', description: 'Small sample projects that show how to use this project.', emoji: '🧪' },
  docs: { role: 'Documentation', description: 'Guides and explanations written for people.', emoji: '📖' },
  vendor: { role: 'Borrowed code', description: 'Copies of other people’s code, kept here so the project can use it.', emoji: '📦' },
  generated: { role: 'Machine-made files', description: 'Files produced automatically by tools; people don’t edit them by hand.', emoji: '🤖' },
  infra: { role: 'Build & deploy setup', description: 'Automation and setup for building, checking and shipping the project.', emoji: '🏗️' },
  scripts: { role: 'Chore scripts', description: 'Small programs that automate everyday chores for the people working on the project.', emoji: '📜' },
}

/** Supporting material (tests, docs, examples, tooling) rather than the project's own running code. */
function isPeripheralMod(m: Mod): boolean {
  if (m.id === ROOT_MODULE_ID) return false
  const hit = peripheralCache.get(m)
  if (hit !== undefined) return hit
  const result = zonesOf(`${m.path}/x`).length > 0 || basename(m.path).startsWith('.') || PERIPHERAL_LAYERS.has(dominantLayerOf(modFiles(m)))
  peripheralCache.set(m, result)
  return result
}

/** Follow single-child folder chains with no files of their own (src/main/java/com/acme → the deepest one). */
function collapseChain(node: Node): Node {
  let n = node
  while (n.files.length === 0 && n.children.size === 1) n = n.children.values().next().value as Node
  return n
}

function subtreeMod(node: Node, isPackage = false): Mod {
  return { id: node.path, path: node.path, direct: null, subtrees: [node], isPackage }
}

function isExpandable(m: Mod): boolean {
  return m.direct === null && m.subtrees.length === 1 && m.subtrees[0].children.size > 0
}

/** Replace a whole-folder module with: its own direct files (if any) + one module per sub-folder. */
function expand(mods: Mod[], m: Mod, opts: { collapse: boolean; packages: boolean }): void {
  const node = m.subtrees[0]
  const idx = mods.indexOf(m)
  const replacement: Mod[] = []
  if (node.files.length > 0) replacement.push({ id: node.path, path: node.path, direct: node, subtrees: [], isPackage: m.isPackage })
  for (const child of node.children.values()) {
    const plain = subtreeMod(child, opts.packages)
    // Supporting folders (tests, docs …) keep their own, more telling name instead of a deep chain's last folder.
    replacement.push(opts.collapse && !opts.packages && !isPeripheralMod(plain) ? subtreeMod(collapseChain(child)) : plain)
  }
  mods.splice(idx, 1, ...replacement)
}

/** Folders that hold separate packages: conventional names at the top level plus manifest workspaces. */
function containerPaths(root: Node, workspaces: string[] | undefined): string[] {
  const out = new Set<string>()
  for (const [name, child] of root.children) {
    if (CONTAINER_NAMES.has(name.toLowerCase()) && [...child.children.values()].length >= 2) out.add(child.path)
  }
  for (const raw of workspaces ?? []) {
    const ws = raw.replace(/^!/, '').replace(/^\.\//, '').replace(/\/+$/, '')
    if (!ws || raw.startsWith('!')) continue
    const star = ws.indexOf('*')
    const container = star === -1 ? dirname(ws) : ws.slice(0, star).replace(/\/+$/, '')
    if (container && !container.includes('*')) out.add(container)
  }
  return [...out].sort((a, b) => a.split('/').length - b.split('/').length)
}

/** Split modules until `containerPath`'s sub-folders are modules of their own. */
function splitContainer(mods: Mod[], containerPath: string): void {
  for (let guard = 0; guard < 12; guard++) {
    const m = mods.find((x) => x.direct === null && x.subtrees.length === 1 && (containerPath === x.path || containerPath.startsWith(`${x.path}/`)))
    if (!m || !isExpandable(m)) return
    const isTarget = m.path === containerPath
    if (isTarget && m.subtrees[0].children.size < 2) return
    expand(mods, m, { collapse: false, packages: isTarget })
    if (isTarget) return
  }
}

/** A copy of a folder holding only its own files (its sub-folders belong to other modules). */
function directOnly(node: Node): Node {
  return { path: node.path, children: new Map(), files: node.files, weight: node.files.reduce((s, f) => s + structuralWeight(f), 0) }
}

function moveInto(target: Mod, m: Mod): void {
  if (m.direct) target.subtrees.push(directOnly(m.direct))
  target.subtrees.push(...m.subtrees)
  invalidate(target)
}

function hasEntry(m: Mod): boolean {
  return modFiles(m).some((f) => f.isEntry || f.role === 'entry')
}

/** The module tiny module `m` should be folded into: the nearest parent folder's own module (created if needed), else the root. */
function mergeTarget(mods: Mod[], m: Mod, nodeAt: (path: string) => Node | null): Mod {
  for (let p = dirname(m.path); p; p = dirname(p)) {
    const existing = mods.find((x) => x !== m && (x.direct?.path === p || x.subtrees.some((t) => t.path === p)))
    if (existing) return existing
  }
  const parent = dirname(m.path)
  if (parent) {
    const node = nodeAt(parent)
    if (node) {
      const created: Mod = { id: parent, path: parent, direct: node, subtrees: [] }
      mods.push(created)
      return created
    }
  }
  let root = mods.find((x) => x.id === ROOT_MODULE_ID)
  if (!root) {
    root = { id: ROOT_MODULE_ID, path: '', direct: newNode(''), subtrees: [] }
    mods.push(root)
  }
  return root
}

// ─────────────────────────────────────────────────────────────────────────────
// Describing a module
// ─────────────────────────────────────────────────────────────────────────────

/** Plural label + what those files are for, per role. */
const ROLE_PLURAL: Record<FileRole, [label: string, purpose: string]> = {
  entry: ['starting points', 'where the program begins running'],
  page: ['screens', 'the pages people can visit'],
  component: ['UI building blocks', 'the reusable pieces the screens are made from'],
  layout: ['page frames', 'the headers, sidebars and footers around the pages'],
  hook: ['reusable behaviors', 'bundles of behavior the screens plug in'],
  state: ['app-memory files', 'they keep track of information while the app runs'],
  route: ['web address handlers', 'they decide what happens when someone visits each address'],
  controller: ['request handlers', 'they receive requests and work out the response'],
  middleware: ['checkpoints', 'they inspect every request on the way in or out, like security guards'],
  service: ['services', 'each does one specific job for the rest of the code'],
  client: ['outside connections', 'they talk to other servers and services over the internet'],
  model: ['data models', 'they describe the kinds of things the app stores'],
  schema: ['data rules', 'they define what valid information looks like'],
  migration: ['database change steps', 'a recorded history of how the database structure changed'],
  repository: ['data-access files', 'they read and save information in storage'],
  util: ['helpers', 'small handy tools used all over the code'],
  types: ['type definitions', 'they describe the shapes of data so mistakes are caught early'],
  constants: ['fixed-value files', 'values that never change, collected in one place'],
  config: ['settings files', 'they tell tools and the app how to behave'],
  test: ['tests', 'automatic checks that make sure the code still works'],
  fixture: ['test samples', 'example data the tests use'],
  style: ['styling files', 'the colors, fonts and spacing'],
  docs: ['documents', 'explanations written for people'],
  script: ['scripts', 'small programs that automate chores'],
  build: ['build files', 'instructions for turning the code into something runnable'],
  ci: ['automation pipelines', 'checks and deployments that run automatically on every change'],
  container: ['container recipes', 'ready-to-run boxes holding everything the app needs'],
  asset: ['media files', 'images, fonts and other media'],
  i18n: ['translation files', 'the app’s text in different languages'],
  cli: ['command files', 'they handle commands typed into a terminal'],
  library: ['code files', 'part of the project’s own source code'],
  other: ['files', 'miscellaneous supporting files'],
}

const LAYER_ROLE_LABEL: Record<Layer, string> = {
  ui: 'Screens & visuals',
  api: 'Connections to the outside world',
  logic: 'Core logic',
  data: 'Data & storage',
  test: 'Automatic checks',
  config: 'Settings & setup',
  docs: 'Documentation',
  infra: 'Build & deploy',
  other: 'Supporting files',
}

const SUPPORT_ROLES = new Set<FileRole>(['test', 'fixture', 'docs', 'config', 'asset', 'other', 'ci', 'build', 'container', 'script'])

function dominantRole(files: AnalyzedFile[], layer: Layer): FileRole {
  // In a folder of real code, its tests, docs and settings don't define what the folder is.
  const coreFolder = !PERIPHERAL_LAYERS.has(layer)
  const pool = coreFolder && files.some((f) => !SUPPORT_ROLES.has(f.role)) ? files.filter((f) => !SUPPORT_ROLES.has(f.role)) : files
  const by = new Map<FileRole, number>()
  for (const f of pool) by.set(f.role, (by.get(f.role) ?? 0) + 1)
  let best: FileRole = 'other'
  let bestN = -1
  for (const [role, n] of by) {
    // Generic code only wins when nothing more specific is common.
    const adj = role === 'library' || role === 'other' ? n * 0.6 : n
    if (adj > bestN || (adj === bestN && role < best)) {
      best = role
      bestN = adj
    }
  }
  return best
}

function topLanguages(files: AnalyzedFile[]): string[] {
  const codeKinds = new Set(['source', 'test', 'style', 'markup', 'script', 'build'])
  const by = new Map<string, number>()
  for (const f of files) if (f.language && codeKinds.has(f.kind)) by.set(f.language, (by.get(f.language) ?? 0) + fileLines(f) + 1)
  if (by.size === 0) for (const f of files) if (f.language) by.set(f.language, (by.get(f.language) ?? 0) + fileLines(f) + 1)
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l)
}

function pickKeyFiles(files: AnalyzedFile[], layer: Layer): string[] {
  const testModule = layer === 'test'
  const candidates = files.filter((f) => f.kind !== 'asset' && f.kind !== 'generated' && (testModule ? f.kind === 'test' : f.kind !== 'test'))
  const pool = candidates.length > 0 ? candidates : files
  return [...pool]
    .sort(
      (a, b) =>
        Number(b.isEntry) - Number(a.isEntry) ||
        (testModule ? Number(b.role === 'test') - Number(a.role === 'test') : 0) ||
        Number(b.kind === 'source' || b.kind === 'test') - Number(a.kind === 'source' || a.kind === 'test') ||
        b.importedBy.length - a.importedBy.length ||
        Number(b.fetched) - Number(a.fetched) ||
        Number(b.kind === 'source') - Number(a.kind === 'source') ||
        fileLines(b) - fileLines(a) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 5)
    .map((f) => f.path)
}

function describeComposition(files: AnalyzedFile[], lines: number, languages: string[]): string {
  const parts = [count(files.length, 'file')]
  if (lines > 0) parts.push(`about ${formatCompact(lines)} lines`)
  const lang = languages[0]
  const tail = lang ? `, mostly ${lang}` : ''
  return `It has ${parts.join(' with ')}${tail}.`
}

/** A description generated from what's inside; `specific` is true when it names a clear common job. */
function generatedDescription(files: AnalyzedFile[], role: FileRole, layer: Layer, keyFiles: string[] = []): { text: string; specific: boolean } {
  const sameRole = files.filter((f) => f.role === role).length
  const [plural, purpose] = ROLE_PLURAL[role]
  if (role === 'library' || role === 'other' || sameRole < Math.max(2, files.length * 0.35)) {
    const names = [...new Set(keyFiles.map((p) => basename(p)))].slice(0, 3).map((n) => `\`${safeName(n, 40)}\``)
    const area = LAYER_INFO[layer].label.toLowerCase()
    if (names.length === 0) return { text: sentence(`Part of the project’s ${area} — ${lowerNoDot(LAYER_INFO[layer].description)}`), specific: false }
    if (names.length >= files.length) return { text: sentence(`Holds ${listJoin(names)}, part of the project’s ${area}`), specific: false }
    return { text: sentence(`Holds part of the project’s ${area}, including ${listJoin(names)}`), specific: false }
  }
  const n = sameRole === 1 ? `1 ${plural.replace(/s$/, '')}` : `${sameRole} ${plural}`
  return { text: sentence(`Holds ${n} — ${purpose}`), specific: true }
}

function lowerNoDot(s: string): string {
  const t = s.replace(/[.]+$/, '')
  return t ? t[0].toLowerCase() + t.slice(1) : t
}

/**
 * Display names: the folder's own name, or "parent/name" when two modules would otherwise share a name
 * (using the first folder where their paths differ, e.g. "client/components" vs "server/components").
 */
function uniqueNames(mods: Mod[]): Map<Mod, string> {
  const names = new Map<Mod, string>()
  const groups = new Map<string, Mod[]>()
  for (const m of mods) {
    if (m.id === ROOT_MODULE_ID) continue
    const key = basename(m.path).toLowerCase()
    const g = groups.get(key)
    if (g) g.push(m)
    else groups.set(key, [m])
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      names.set(group[0], basename(group[0].path))
      continue
    }
    const segs = group.map((m) => m.path.split('/'))
    const minLen = Math.min(...segs.map((s) => s.length))
    let d = 0
    while (d < minLen - 1 && segs.every((s) => s[d] === segs[0][d])) d++
    const proposals = group.map((m, i) => {
      const s = segs[i]
      return d < s.length - 1 ? `${s[d]}/${s[s.length - 1]}` : m.path
    })
    const unique = new Set(proposals.map((p) => p.toLowerCase())).size === proposals.length
    group.forEach((m, i) => names.set(m, unique ? proposals[i] : m.path))
  }
  return names
}

/**
 * Group files into architecture-level modules (usually folders) that make a readable map: aim for ~6–24 modules.
 * Algorithm sketch: start from top-level folders; if one folder holds most of the code (e.g. "src", "lib", "app",
 * "packages"), expand it into its children; repeat while a module dominates (> ~55% of lines) and has sub-folders;
 * merge tiny folders (< ~2% of lines) into their parent or an "other" bucket; loose root files go to ROOT_MODULE_ID
 * ("Project setup files"). Every file gets exactly one moduleId. Name/role/description/emoji come from
 * knowledge/folders describeFolder + the dominant layer of the files inside.
 *
 * Monorepo containers (packages/*, apps/*, crates/*, libs/*, services/* and manifest workspaces) always become one
 * module per package. Dominance is measured against the project's own code, so big test or docs folders don't
 * stop the main code from being opened up.
 */
export function buildModules(files: AnalyzedFile[], options: BuildModulesOptions = {}): { modules: ModuleInfo[]; assignments: Record<string, string> } {
  if (files.length === 0) return { modules: [], assignments: {} }
  const root = buildTree(files)
  const nodeIndex = new Map<string, Node>()
  const indexNodes = (n: Node) => {
    nodeIndex.set(n.path, n)
    for (const c of n.children.values()) indexNodes(c)
  }
  indexNodes(root)
  const nodeAt = (p: string) => nodeIndex.get(p) ?? null

  // 1. Start: loose root files + one module per top-level folder.
  const mods: Mod[] = []
  if (root.files.length > 0) mods.push({ id: ROOT_MODULE_ID, path: '', direct: root, subtrees: [] })
  for (const child of root.children.values()) {
    const probe = subtreeMod(child)
    mods.push(isPeripheralMod(probe) ? probe : subtreeMod(collapseChain(child)))
  }

  // 2. Multi-package containers.
  for (const c of containerPaths(root, options.workspaces)) splitContainer(mods, c)

  // 3. Open up modules that dominate the project's own code (or when the map is still very sparse).
  for (let iter = 0; iter < 80; iter++) {
    const core = mods.filter((m) => !isPeripheralMod(m))
    const coreTotal = core.reduce((s, m) => s + modWeight(m), 0) || 1
    const candidates = core.filter(isExpandable).sort((a, b) => modWeight(b) - modWeight(a) || a.path.localeCompare(b.path))
    const m = candidates[0]
    if (!m) break
    const share = modWeight(m) / coreTotal
    const node = m.subtrees[0]
    const after = mods.length - 1 + (node.files.length > 0 ? 1 : 0) + node.children.size
    const sparse = mods.length < MIN_MODULES && (after > mods.length || share > 0.3)
    if (share > DOMINANT_SHARE || sparse) expand(mods, m, { collapse: true, packages: false })
    else break
  }

  // 4. Tidy: drop empties; fold tiny hidden/settings folders into their parent when the map is busy.
  for (let i = mods.length - 1; i >= 0; i--) if (modFiles(mods[i]).length === 0) mods.splice(i, 1)
  const total = mods.reduce((s, m) => s + modWeight(m), 0) || 1
  if (mods.length > 10) {
    const tiny = mods.filter((m) => {
      if (m.id === ROOT_MODULE_ID || m.direct || hasEntry(m)) return false
      const fl = modFiles(m)
      const share = modWeight(m) / total
      const hidden = basename(m.path).startsWith('.') && m.path !== '.github'
      const settingsOnly = ['config', 'other'].includes(dominantLayerOf(fl))
      return share < 0.006 && fl.length <= 3 && (hidden || settingsOnly)
    })
    for (const m of tiny) {
      if (mods.length <= 10) break
      const target = mergeTarget(mods, m, nodeAt)
      moveInto(target, m)
      mods.splice(mods.indexOf(m), 1)
    }
  }

  // 5. Too many modules: fold the smallest ones into their parent folder's module.
  for (let guard = 0; mods.length > MAX_MODULES && guard < 500; guard++) {
    const mergeable = mods
      .filter((m) => m.id !== ROOT_MODULE_ID && !hasEntry(m))
      .sort((a, b) => modWeight(a) - modWeight(b) || modFiles(a).length - modFiles(b).length || b.path.localeCompare(a.path))
    const m = mergeable[0]
    if (!m) break
    const target = mergeTarget(mods, m, nodeAt)
    if (target === m) break
    moveInto(target, m)
    mods.splice(mods.indexOf(m), 1)
  }

  // 6. Describe.
  const names = uniqueNames(mods)
  const assignments: Record<string, string> = dict<string>()
  const packageCount = mods.filter((m) => m.isPackage && m.subtrees.length > 0).length
  const infos: { info: ModuleInfo; weight: number; peripheral: boolean }[] = []

  for (const m of mods) {
    const mfiles = modFiles(m)
    if (mfiles.length === 0) continue
    for (const f of mfiles) assignments[f.path] = m.id
    const layerBreakdown: Partial<Record<Layer, number>> = {}
    let lines = 0
    let bytes = 0
    for (const f of mfiles) {
      const l = fileLines(f)
      lines += l
      bytes += f.size
      if (l > 0) layerBreakdown[f.layer] = (layerBreakdown[f.layer] ?? 0) + l
    }
    const layer = dominantLayerOf(mfiles)
    const role = dominantRole(mfiles, layer)
    const languages = topLanguages(mfiles)
    const keyFiles = pickKeyFiles(mfiles, layer)
    const isRoot = m.id === ROOT_MODULE_ID
    const folderName = basename(m.path)
    const zone = isRoot ? undefined : zonesOf(`${m.path}/x`)[0]
    const folder = isRoot ? null : (describeFolder(folderName) ?? (zone ? { ...ZONE_FALLBACK[zone], layer } : null))

    let name = isRoot ? 'Project setup files' : (names.get(m) ?? folderName)
    let roleLabel: string
    let description: string
    let emoji: string

    if (isRoot) {
      const code = mfiles.filter((f) => f.kind === 'source')
      const codeLines = code.reduce((s, f) => s + fileLines(f), 0)
      const nonTestLines = mfiles.filter((f) => f.kind !== 'test' && f.kind !== 'docs').reduce((s, f) => s + fileLines(f), 0)
      if (code.length >= 5 || (code.length >= 3 && codeLines >= nonTestLines * 0.3)) {
        name = options.projectName ? safeName(options.projectName, 40) : 'Main code'
        roleLabel = 'Main code (top level)'
        description = `The project's main code sits right at the top level, next to its setup files. ${describeComposition(mfiles, lines, languages)}`
        emoji = '🏠'
      } else {
        roleLabel = 'Project setup files'
        description = `Loose files at the top of the project: settings, instructions and the welcome note (README) that tie everything together. ${describeComposition(mfiles, lines, languages)}`
        emoji = '🧭'
      }
      const merged = m.subtrees.map((t) => basename(t.path)).filter(Boolean)
      if (merged.length > 0) {
        const shown = merged.slice(0, 3).map((n) => `\`${safeName(n, 30)}\``)
        description += ` It also gathers ${merged.length > 3 ? `${shown.join(', ')} and ${merged.length - 3} more small folders` : `the small ${listJoin(shown)} folder${merged.length === 1 ? '' : 's'}`}.`
      }
    } else {
      roleLabel = folder?.role ?? (role !== 'library' && role !== 'other' ? capitalizeFirst(ROLE_PLURAL[role][0]) : LAYER_ROLE_LABEL[layer])
      const lead = folder ? sentence(folder.description) : generatedDescription(mfiles, role, layer, keyFiles).text
      const extra: string[] = []
      if (folder) {
        const generated = generatedDescription(mfiles, role, layer, keyFiles)
        if (generated.specific) extra.push(generated.text)
      }
      if (m.isPackage && packageCount > 1) extra.push(`It's one of ${packageCount} separate packages kept together in this repository.`)
      const merged = m.subtrees.filter((s) => s.path !== m.path).map((s) => basename(s.path))
      if (m.direct && merged.length > 0) {
        const shown = merged.slice(0, 3).map((n) => `\`${safeName(n, 30)}\``)
        extra.push(`It also holds ${merged.length > 3 ? `${shown.join(', ')} and ${merged.length - 3} more small folders` : `the small ${listJoin(shown)} folder${merged.length === 1 ? '' : 's'}`}.`)
      }
      extra.push(describeComposition(mfiles, lines, languages))
      description = [lead, ...extra.slice(0, 2)].join(' ')
      emoji = folder?.emoji ?? (role !== 'library' && role !== 'other' ? ROLE_INFO[role].emoji : LAYER_INFO[layer].emoji)
    }

    infos.push({
      info: {
        id: m.id,
        name,
        path: m.path,
        layer,
        role: roleLabel,
        description,
        emoji,
        files: mfiles.map((f) => f.path),
        fileCount: mfiles.length,
        lines,
        bytes,
        languages,
        keyFiles,
        layerBreakdown,
      },
      weight: modWeight(m),
      peripheral: isPeripheralMod(m),
    })
  }

  infos.sort((a, b) => Number(a.peripheral) - Number(b.peripheral) || b.weight - a.weight || a.info.id.localeCompare(b.info.id))
  return { modules: infos.map((x) => x.info), assignments }
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Aggregate file edges into module edges (skip self-loops), with up to 3 example file pairs each. */
export function buildModuleEdges(fileEdges: FileEdge[], assignments: Record<string, string>): ModuleEdge[] {
  const byKey = new Map<string, ModuleEdge>()
  const seenPairs = new Set<string>()
  for (const e of fileEdges) {
    const source = assignments[e.source]
    const target = assignments[e.target]
    if (source == null || target == null || source === target) continue
    const pairKey = `${e.source}\u0000${e.target}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    const key = `${source}\u0000${target}`
    let edge = byKey.get(key)
    if (!edge) {
      edge = { source, target, weight: 0, examples: [] }
      byKey.set(key, edge)
    }
    edge.weight++
    if (edge.examples.length < 3) edge.examples.push({ from: e.source, to: e.target })
  }
  return [...byKey.values()].sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
}
