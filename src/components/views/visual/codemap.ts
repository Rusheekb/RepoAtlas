/** Pure helpers for the "Where Code Lives" view: files in a folder, the biggest files and folder statistics. */
import type { AnalyzedFile, Layer } from '@/core/types'

/** Normalize a folder path ('' = the whole project). */
export function cleanFolder(path: string | null | undefined): string {
  return (path ?? '').replace(/^\/+|\/+$/g, '')
}

/** Files inside `folder` (at any depth). '' returns every file. */
export function filesUnder(files: readonly AnalyzedFile[], folder: string): AnalyzedFile[] {
  const f = cleanFolder(folder)
  if (!f) return [...files]
  const prefix = `${f}/`
  return files.filter((file) => file.path.startsWith(prefix))
}

/** True when some file lives inside `folder` (so the folder exists in this project). */
export function folderExists(files: readonly AnalyzedFile[], folder: string): boolean {
  const f = cleanFolder(folder)
  if (!f) return true
  const prefix = `${f}/`
  return files.some((file) => file.path.startsWith(prefix))
}

/**
 * The biggest files by lines of code (files whose contents weren't downloaded have no line count and are left out).
 * If no file has a line count, falls back to size on disk.
 */
export function biggestFiles(files: readonly AnalyzedFile[], n = 15): AnalyzedFile[] {
  const counted = files.filter((f) => f.lines != null && f.lines > 0)
  const pool = counted.length ? counted : files.filter((f) => f.size > 0)
  const value = (f: AnalyzedFile) => (counted.length ? (f.lines ?? 0) : f.size)
  return [...pool].sort((a, b) => value(b) - value(a) || a.path.localeCompare(b.path)).slice(0, Math.max(0, n))
}

export interface FolderLanguage {
  name: string
  files: number
  lines: number
}

export interface FolderStats {
  files: number
  /** Lines across files with a known line count. */
  lines: number
  bytes: number
  /** Distinct sub-folders at any depth. */
  folders: number
  /** Files we read the contents of (the rest are only known by name and size). */
  readFiles: number
  /** Languages by lines (then files), most used first. Files without a language are not listed. */
  languages: FolderLanguage[]
  /** Lines (or bytes ÷ 40 when unread) per layer, for a "kinds of code" bar. */
  layerBreakdown: Partial<Record<Layer, number>>
}

/** Totals for a folder ('' = whole project). */
export function folderStats(files: readonly AnalyzedFile[], folder: string): FolderStats {
  const f = cleanFolder(folder)
  const inside = filesUnder(files, f)
  const prefixLen = f ? f.length + 1 : 0
  const folders = new Set<string>()
  const langs = new Map<string, FolderLanguage>()
  const layerBreakdown: Partial<Record<Layer, number>> = {}
  let lines = 0
  let bytes = 0
  let readFiles = 0
  for (const file of inside) {
    bytes += file.size
    if (file.lines != null) {
      lines += file.lines
      readFiles++
    }
    const rel = file.path.slice(prefixLen)
    const parts = rel.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
    if (file.language) {
      const l = langs.get(file.language) ?? { name: file.language, files: 0, lines: 0 }
      l.files++
      l.lines += file.lines ?? 0
      langs.set(file.language, l)
    }
    const weight = file.lines ?? Math.round(file.size / 40)
    if (weight > 0) layerBreakdown[file.layer] = (layerBreakdown[file.layer] ?? 0) + weight
  }
  const languages = [...langs.values()].sort((a, b) => b.lines - a.lines || b.files - a.files || a.name.localeCompare(b.name))
  return { files: inside.length, lines, bytes, folders: folders.size, readFiles, languages, layerBreakdown }
}
