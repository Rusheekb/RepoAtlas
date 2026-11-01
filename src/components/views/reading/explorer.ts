import { extname } from '@/core/paths'
import type { AnalyzedFile, RepoAnalysis, RepoSnapshot, SkipReason } from '@/core/types'

/** Above this size we don't try to show a file in the browser (it would be slow and unreadable). */
export const MAX_VIEWABLE_BYTES = 1.5 * 1024 * 1024

export type LineRange = { start: number; end: number }

/** The file "Read the Code" opens when the link doesn't name one: the README, else the first starting point. */
export function defaultFilePath(analysis: Pick<RepoAnalysis, 'files' | 'readme' | 'entryPoints'>): string | null {
  if (analysis.readme && analysis.readme.path in analysis.files) return analysis.readme.path
  const entry = analysis.entryPoints.find((p) => p in analysis.files)
  if (entry) return entry
  const files = Object.values(analysis.files)
  const source = files.filter((f) => f.kind === 'source').sort((a, b) => a.path.localeCompare(b.path))[0]
  return source?.path ?? files.map((f) => f.path).sort()[0] ?? null
}

/** "?line=120" → 120–120, "?line=10-20" → 10–20 (either order), anything else → null. */
export function parseLineParam(value: string | null | undefined): LineRange | null {
  if (!value) return null
  const m = /^\s*L?(\d{1,7})(?:\s*[-–:]\s*L?(\d{1,7}))?\s*$/i.exec(value)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  if (a < 1 || b < 1) return null
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

export function formatLineParam(range: LineRange | null): string | undefined {
  if (!range) return undefined
  return range.start === range.end ? String(range.start) : `${range.start}-${range.end}`
}

export function describeRange(range: LineRange): string {
  return range.start === range.end ? `line ${range.start}` : `lines ${range.start}–${range.end}`
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])

export function isImagePath(path: string): boolean {
  return IMAGE_EXTS.has(extname(path))
}

export function isMarkdownPath(path: string): boolean {
  return ['md', 'markdown', 'mdx'].includes(extname(path))
}

/** How a file can be shown. */
export type FileAvailability =
  /** Its text is already here. */
  | { kind: 'ready'; content: string }
  /** Download it now (it wasn't part of the first batch). `note` explains why it was left out, if we know. */
  | { kind: 'download'; reason: SkipReason | null }
  /** An image, font, archive or compiled file: nothing to read. */
  | { kind: 'binary' }
  /** Too big to show comfortably. */
  | { kind: 'too-large'; size: number }

/** Decide whether a file can be shown right away, downloaded on demand, or only described. */
export function fileAvailability(file: AnalyzedFile, snapshot: Pick<RepoSnapshot, 'files' | 'skipped'>): FileAvailability {
  if (file.path in snapshot.files) return { kind: 'ready', content: snapshot.files[file.path] }
  const reason = snapshot.skipped.find((s) => s.path === file.path)?.reason ?? null
  if (reason === 'binary' || (file.kind === 'asset' && file.language === null && isImagePath(file.path))) return { kind: 'binary' }
  if (file.size > MAX_VIEWABLE_BYTES) return { kind: 'too-large', size: file.size }
  return { kind: 'download', reason }
}

/** Why a file wasn't read up front, in plain English (null when there's nothing worth saying). */
export function skipNote(reason: SkipReason | null): string | null {
  switch (reason) {
    case 'lockfile':
      return 'This is a “lockfile”: a long list a tool writes automatically to record the exact versions of every add-on the project uses. People rarely read it.'
    case 'generated':
      return 'This file was produced automatically by a tool, so it’s usually not where people make changes.'
    case 'vendored':
      return 'This is a copy of someone else’s code, kept inside the project for convenience.'
    case 'too-large':
      return 'This file is quite large, so we didn’t read it when we first looked at the project.'
    case 'limit':
      return 'We skipped this file when first reading the project, to keep things quick.'
    case 'fetch-failed':
      return 'This file didn’t download the first time, so we’re trying again.'
    default:
      return null
  }
}

/** Folder breadcrumb for a path: "src/flask/app.py" → src, src/flask, then the file. */
export function breadcrumbs(path: string): { name: string; path: string; isFile: boolean }[] {
  const parts = path.split('/').filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/'), isFile: i === parts.length - 1 }))
}

/** A friendly word for the kind of symbol, for the outline. */
export const SYMBOL_KIND_LABEL: Record<string, { label: string; emoji: string }> = {
  function: { label: 'Function', emoji: '🔧' },
  method: { label: 'Method', emoji: '🔧' },
  class: { label: 'Class', emoji: '🏛️' },
  component: { label: 'Screen piece', emoji: '🧩' },
  hook: { label: 'Reusable behavior', emoji: '🪝' },
  interface: { label: 'Shape of data', emoji: '📐' },
  type: { label: 'Type', emoji: '🏷️' },
  enum: { label: 'List of choices', emoji: '📋' },
  struct: { label: 'Data structure', emoji: '🧱' },
  trait: { label: 'Shared ability', emoji: '🎭' },
  constant: { label: 'Fixed value', emoji: '📌' },
  variable: { label: 'Value', emoji: '📦' },
  module: { label: 'Module', emoji: '📦' },
}
