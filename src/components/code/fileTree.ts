import { ancestors } from '@/core/paths'
import type { AnalyzedFile } from '@/core/types'

/**
 * Pure helpers behind <FileTree>: build a folder tree from a flat file list, filter it by a search query, and flatten
 * only the expanded folders into rows (so a 10,000-file project renders a few dozen rows, not 10,000).
 */

export interface TreeFolder {
  /** Folder path ('' for the root). For a compacted chain ("src/flask") this is the deepest folder. */
  path: string
  /** Display name. A chain of single-child folders is shown as one row: "src/flask". */
  name: string
  folders: TreeFolder[]
  files: AnalyzedFile[]
  /** Files anywhere inside. */
  fileCount: number
}

export type TreeRow =
  | {
      kind: 'folder'
      path: string
      name: string
      depth: number
      expanded: boolean
      folder: TreeFolder
      parentPath: string | null
      setSize: number
      posInSet: number
    }
  | {
      kind: 'file'
      path: string
      name: string
      depth: number
      file: AnalyzedFile
      parentPath: string | null
      setSize: number
      posInSet: number
    }
  | {
      /** "Show 240 more files" at the end of a long folder. */
      kind: 'more'
      path: string
      name: string
      depth: number
      folderPath: string
      hidden: number
      parentPath: string | null
      setSize: number
      posInSet: number
    }

/** Files shown per folder before a "Show more" row. */
export const FOLDER_PAGE_SIZE = 200

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const byName = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)

interface MutableFolder {
  path: string
  name: string
  folders: Map<string, MutableFolder>
  files: AnalyzedFile[]
}

function finish(f: MutableFolder, compact: boolean): TreeFolder {
  let node = f
  let name = f.name
  // Fold "a" → "a/b" → "a/b/c" chains (folders holding exactly one folder and nothing else) into one row.
  while (compact && node.path !== '' && node.files.length === 0 && node.folders.size === 1) {
    const only = [...node.folders.values()][0]
    name = `${name}/${only.name}`
    node = only
  }
  const folders = [...node.folders.values()].map((c) => finish(c, compact)).sort((a, b) => byName(a.name, b.name))
  const files = node.files.slice().sort((a, b) => byName(a.name, b.name))
  const fileCount = files.length + folders.reduce((n, c) => n + c.fileCount, 0)
  return { path: node.path, name, folders, files, fileCount }
}

/** Build the folder tree. Folders come first, then files, each sorted alphabetically (numbers in natural order). */
export function buildTree(files: readonly AnalyzedFile[], opts: { compact?: boolean } = {}): TreeFolder {
  const root: MutableFolder = { path: '', name: '', folders: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let cur = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      let next = cur.folders.get(seg)
      if (!next) {
        next = { path: cur.path ? `${cur.path}/${seg}` : seg, name: seg, folders: new Map(), files: [] }
        cur.folders.set(seg, next)
      }
      cur = next
    }
    cur.files.push(file)
  }
  return finish(root, opts.compact ?? true)
}

/** Lower-cased search terms. "flask app" → ["flask", "app"]. */
export function queryTerms(query: string | null | undefined): string[] {
  return (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
}

/** Files whose path contains every search term (case-insensitive). */
export function filterFiles(files: readonly AnalyzedFile[], query: string | null | undefined): AnalyzedFile[] {
  const terms = queryTerms(query)
  if (!terms.length) return files.slice()
  return files.filter((f) => {
    const p = f.path.toLowerCase()
    return terms.every((t) => p.includes(t))
  })
}

/** Every folder path in the tree (used to auto-expand search results). */
export function allFolderPaths(root: TreeFolder): string[] {
  const out: string[] = []
  const walk = (f: TreeFolder) => {
    for (const c of f.folders) {
      out.push(c.path)
      walk(c)
    }
  }
  walk(root)
  return out
}

/** The folders to open so `path` (a file or folder) is visible. */
export function foldersToReveal(path: string | null | undefined): string[] {
  if (!path) return []
  return ancestors(path)
}

/**
 * Flatten the tree into the rows on screen: a folder's children are only listed when it is expanded.
 * `limits` raises the per-folder file cap (see FOLDER_PAGE_SIZE) for folders where the reader asked to see more.
 */
export function visibleRows(
  root: TreeFolder,
  isExpanded: (folderPath: string) => boolean,
  limits: ReadonlyMap<string, number> = new Map(),
): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (folder: TreeFolder, depth: number, parentPath: string | null) => {
    const limit = limits.get(folder.path) ?? FOLDER_PAGE_SIZE
    const shownFiles = folder.files.length > limit ? folder.files.slice(0, limit) : folder.files
    const hidden = folder.files.length - shownFiles.length
    const setSize = folder.folders.length + shownFiles.length + (hidden > 0 ? 1 : 0)
    let pos = 0
    for (const child of folder.folders) {
      const expanded = isExpanded(child.path)
      rows.push({ kind: 'folder', path: child.path, name: child.name, depth, expanded, folder: child, parentPath, setSize, posInSet: ++pos })
      if (expanded) walk(child, depth + 1, child.path)
    }
    for (const file of shownFiles) {
      rows.push({ kind: 'file', path: file.path, name: file.name, depth, file, parentPath, setSize, posInSet: ++pos })
    }
    if (hidden > 0) {
      rows.push({
        kind: 'more',
        path: `${folder.path}\u0000more`,
        name: `Show ${hidden} more`,
        depth,
        folderPath: folder.path,
        hidden,
        parentPath,
        setSize,
        posInSet: ++pos,
      })
    }
  }
  walk(root, 0, null)
  return rows
}

/** Where the first search term appears in `name`, for bolding the match. */
export function matchRange(name: string, terms: readonly string[]): { start: number; end: number } | null {
  const lower = name.toLowerCase()
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i !== -1) return { start: i, end: i + t.length }
  }
  return null
}
