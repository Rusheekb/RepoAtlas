import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Icon, LayerDot, RoleIcon } from '@/components/ui/icons'
import { formatNumber } from '@/core/format'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import type { AnalyzedFile } from '@/core/types'
import { buildTree, filterFiles, FOLDER_PAGE_SIZE, foldersToReveal, matchRange, queryTerms, visibleRows, type TreeRow } from './fileTree'

export interface FileTreeProps {
  files: AnalyzedFile[]
  selectedPath?: string | null
  onSelect: (path: string) => void
  /** Filter text. */
  query?: string
  /**
   * The files matching `query`, when the caller already filtered them (so big projects aren't filtered twice per
   * keystroke). Leave out to let the tree filter `files` itself.
   */
  matches?: AnalyzedFile[] | null
  className?: string
  /** A folder (or file) to open up and scroll to, e.g. when arriving from "Read the code" on a module. */
  revealPath?: string | null
  /** Marks files the reader has already opened with a small tick. */
  isSeen?: (path: string) => boolean
  /** Accessible name of the tree (default "Project files"). */
  label?: string
}

/**
 * Search results are capped so a one-letter query can't put thousands of rows on the page (each keystroke would
 * redraw them all). A few hundred rows is more than anyone scans; typing more narrows it down.
 */
export const MAX_SEARCH_ROWS = 250
/** Each level of folders steps in by this much (4px grid). */
const INDENT_PX = 16
/** Left padding of a top-level row, so the icon column lines up with the search icon above the tree. */
const ROW_PAD_PX = 8

function Highlighted({ name, terms }: { name: string; terms: readonly string[] }): ReactNode {
  const m = terms.length ? matchRange(name, terms) : null
  if (!m) return name
  return (
    <>
      {name.slice(0, m.start)}
      <mark className="rounded-xs bg-surface-3 px-px font-medium text-ink">{name.slice(m.start, m.end)}</mark>
      {name.slice(m.end)}
    </>
  )
}

/**
 * Collapsible folder tree with a role icon + layer dot per file, folders auto-expanded to the selection, keyboard navigable.
 * Memoised: it only redraws when its own props change (not on every keystroke of a search box around it).
 */
export const FileTree = memo(function FileTree(props: FileTreeProps) {
  const { files, selectedPath = null, onSelect, query = '', matches: givenMatches, className, revealPath = null, isSeen, label = 'Project files' } = props

  const fullTree = useMemo(() => buildTree(files), [files])
  const terms = useMemo(() => queryTerms(query), [query])
  const searching = terms.length > 0
  const matches = useMemo(() => (searching ? (givenMatches ?? filterFiles(files, query)) : null), [files, query, searching, givenMatches])
  const searchTree = useMemo(() => (matches ? buildTree(matches) : null), [matches])
  const tree = searchTree ?? fullTree

  // Folders the reader opened. A project whose top level is a single folder starts with it open.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>(foldersToReveal(selectedPath))
    if (fullTree.files.length === 0 && fullTree.folders.length === 1) initial.add(fullTree.folders[0].path)
    return initial
  })
  // While searching every matching folder is open; these are the ones the reader closed anyway.
  const [searchClosed, setSearchClosed] = useState<Set<string>>(() => new Set())
  const [limits, setLimits] = useState<Map<string, number>>(() => new Map())
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  useEffect(() => setSearchClosed(new Set()), [query])

  // Open the folders leading to the selected file (and to any folder we were asked to reveal).
  useEffect(() => {
    const open = [...foldersToReveal(selectedPath), ...(revealPath ? [...foldersToReveal(revealPath), revealPath] : [])]
    if (!open.length) return
    setExpanded((prev) => (open.every((p) => prev.has(p)) ? prev : new Set([...prev, ...open])))
  }, [selectedPath, revealPath])

  const isExpanded = useCallback((p: string) => (searching ? !searchClosed.has(p) : expanded.has(p)), [searching, searchClosed, expanded])

  const allRows = useMemo(() => visibleRows(tree, isExpanded, limits), [tree, isExpanded, limits])
  const rows = searching && allRows.length > MAX_SEARCH_ROWS ? allRows.slice(0, MAX_SEARCH_ROWS) : allRows
  const truncatedSearch = rows.length < allRows.length

  const indexByPath = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.path, i))
    return m
  }, [rows])

  // The single row that's reachable with Tab (roving tabindex): the focused row, else the selection, else the first.
  const tabPath =
    (focusedPath && indexByPath.has(focusedPath) && focusedPath) ||
    (selectedPath && indexByPath.has(selectedPath) && selectedPath) ||
    rows[0]?.path ||
    null

  const scrollRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef(new Map<string, HTMLLIElement>())
  const setRowEl = useCallback((path: string, el: HTMLLIElement | null) => {
    if (el) rowEls.current.set(path, el)
    else rowEls.current.delete(path)
  }, [])

  /** Scroll the tree (only the tree, never the page) so a row is visible. */
  const scrollRowIntoView = useCallback((path: string) => {
    const box = scrollRef.current
    const el = rowEls.current.get(path)
    if (!box || !el || box.scrollHeight <= box.clientHeight) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < box.scrollTop) box.scrollTop = Math.max(0, top - 8)
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 8
  }, [])

  // Bring the selected file (or revealed folder) into view when it changes.
  const target = revealPath && !selectedPath?.startsWith(`${revealPath}/`) ? revealPath : selectedPath
  useLayoutEffect(() => {
    if (target) scrollRowIntoView(target)
  }, [target, scrollRowIntoView, rows.length])

  const focusRow = useCallback(
    (path: string) => {
      setFocusedPath(path)
      // Focus after React has rendered the row's new tabIndex.
      requestAnimationFrame(() => {
        rowEls.current.get(path)?.focus({ preventScroll: true })
        scrollRowIntoView(path)
      })
    },
    [scrollRowIntoView],
  )

  const toggleFolder = useCallback(
    (path: string, open?: boolean) => {
      if (searching) {
        setSearchClosed((prev) => {
          const next = new Set(prev)
          const willOpen = open ?? next.has(path)
          if (willOpen) next.delete(path)
          else next.add(path)
          return next
        })
        return
      }
      setExpanded((prev) => {
        const next = new Set(prev)
        const willOpen = open ?? !next.has(path)
        if (willOpen) next.add(path)
        else next.delete(path)
        return next
      })
    },
    [searching],
  )

  const showMore = useCallback((folderPath: string) => {
    setLimits((prev) => new Map(prev).set(folderPath, (prev.get(folderPath) ?? FOLDER_PAGE_SIZE) + FOLDER_PAGE_SIZE * 5))
  }, [])

  const activate = (row: TreeRow) => {
    if (row.kind === 'folder') toggleFolder(row.path)
    else if (row.kind === 'file') onSelect(row.path)
    else showMore(row.folderPath)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!rows.length) return
    const i = tabPath ? (indexByPath.get(tabPath) ?? 0) : 0
    const row = rows[i]
    const go = (j: number) => {
      e.preventDefault()
      const r = rows[Math.max(0, Math.min(rows.length - 1, j))]
      if (r) focusRow(r.path)
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(i + 1)
      case 'ArrowUp':
        return go(i - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(rows.length - 1)
      case 'ArrowRight':
        if (row.kind !== 'folder') return
        e.preventDefault()
        if (!row.expanded) toggleFolder(row.path, true)
        else if (rows[i + 1]?.parentPath === row.path) focusRow(rows[i + 1].path)
        return
      case 'ArrowLeft':
        e.preventDefault()
        if (row.kind === 'folder' && row.expanded) toggleFolder(row.path, false)
        else if (row.parentPath != null && indexByPath.has(row.parentPath)) focusRow(row.parentPath)
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(row)
        return
      default:
        // Type-ahead: jump to the next row starting with the typed letter.
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const ch = e.key.toLowerCase()
          for (let k = 1; k <= rows.length; k++) {
            const r = rows[(i + k) % rows.length]
            if (r.kind !== 'more' && r.name.toLowerCase().startsWith(ch)) {
              e.preventDefault()
              focusRow(r.path)
              return
            }
          }
        }
    }
  }

  return (
    <div ref={scrollRef} className={cn('relative overflow-y-auto overscroll-contain', className)} data-testid="file-tree">
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-2" role="status">
          {searching ? (
            <>
              No files match <span className="font-medium text-ink">“{query.trim()}”</span>. Try a shorter word.
            </>
          ) : (
            'This project has no files to show'
          )}
        </p>
      ) : (
        <ul role="tree" aria-label={label} className="space-y-0.5 py-1" onKeyDown={onKeyDown}>
          {rows.map((row) => {
            const focusable = row.path === tabPath
            const common = {
              ref: (el: HTMLLIElement | null) => setRowEl(row.path, el),
              tabIndex: focusable ? 0 : -1,
              'aria-level': row.depth + 1,
              'aria-setsize': row.setSize,
              'aria-posinset': row.posInSet,
              onFocus: () => setFocusedPath(row.path),
              style: { paddingLeft: ROW_PAD_PX + row.depth * INDENT_PX },
            }
            // One row height (32) and one icon column for folders and files alike; rows sit 2px apart.
            const base =
              'mx-2 flex h-8 cursor-pointer items-center gap-2 rounded-lg pr-2 text-[13px] select-none outline-offset-[-2px] transition-colors duration-150 ease-atlas'

            if (row.kind === 'folder') {
              return (
                <li
                  key={row.path}
                  {...common}
                  role="treeitem"
                  aria-expanded={row.expanded}
                  aria-label={`${row.name}, folder, ${formatNumber(row.folder.fileCount)} ${row.folder.fileCount === 1 ? 'file' : 'files'}`}
                  data-path={row.path}
                  onClick={() => {
                    setFocusedPath(row.path)
                    toggleFolder(row.path)
                  }}
                  className={cn(base, 'text-ink hover:bg-surface-2')}
                  title={row.path}
                >
                  <span className="flex w-4 shrink-0 justify-center" aria-hidden>
                    <ChevronRight
                      className={cn('size-3.5 text-ink-3 transition-transform duration-150 ease-atlas', row.expanded && 'rotate-90')}
                      strokeWidth={1.5}
                    />
                  </span>
                  <Icon as={row.expanded ? FolderOpen : Folder} className="text-ink-3" />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlighted name={row.name} terms={terms} />
                  </span>
                  <span className="shrink-0 text-meta" aria-hidden>
                    {formatNumber(row.folder.fileCount)}
                  </span>
                </li>
              )
            }

            if (row.kind === 'more') {
              return (
                <li
                  key={row.path}
                  {...common}
                  role="treeitem"
                  aria-label={`Show ${formatNumber(row.hidden)} more files in this folder`}
                  onClick={() => showMore(row.folderPath)}
                  className={cn(base, 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                >
                  <span className="w-4 shrink-0" aria-hidden />
                  <span className="w-4 shrink-0" aria-hidden />
                  <span className="truncate underline decoration-line-strong underline-offset-2">Show {formatNumber(row.hidden)} more</span>
                </li>
              )
            }

            const f = row.file
            const selected = row.path === selectedPath
            const layer = LAYER_INFO[f.layer] ?? LAYER_INFO.other
            const role = ROLE_INFO[f.role] ?? ROLE_INFO.other
            const seen = isSeen?.(row.path) ?? false
            return (
              <li
                key={row.path}
                {...common}
                role="treeitem"
                aria-selected={selected}
                aria-label={`${row.name}, ${f.isEntry ? ROLE_INFO.entry.label : role.label}${seen ? ', already read' : ''}`}
                data-path={row.path}
                onClick={() => {
                  setFocusedPath(row.path)
                  onSelect(row.path)
                }}
                className={cn(base, selected ? 'bg-brand-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                title={`${row.path} · ${f.isEntry ? ROLE_INFO.entry.label : role.label} · ${layer.label}`}
              >
                <span className="w-4 shrink-0" aria-hidden />
                <RoleIcon role={f.isEntry ? 'entry' : f.role} className={selected ? 'text-ink-2' : 'text-ink-3'} data-icon={f.isEntry ? 'entry' : f.role} />
                <span className="min-w-0 flex-1 truncate">
                  <Highlighted name={row.name} terms={terms} />
                </span>
                {seen && <Icon as={Check} size={14} className="text-ink-3" />}
                <LayerDot layer={f.layer in LAYER_INFO ? f.layer : 'other'} />
              </li>
            )
          })}
        </ul>
      )}
      {truncatedSearch && (
        <p className="px-3 pt-1 pb-3 text-xs text-ink-3" role="status">
          Showing the first {formatNumber(MAX_SEARCH_ROWS)} matches. Type a little more to narrow it down.
        </p>
      )}
      {searching && matches && matches.length > 0 && (
        <p className="sr-only" role="status" aria-live="polite">
          {matches.length === 1 ? '1 file matches.' : `${formatNumber(matches.length)} files match.`}
        </p>
      )}
    </div>
  )
})
