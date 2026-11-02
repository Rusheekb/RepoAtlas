import { useDeferredValue, useId, useMemo, useState } from 'react'
import { ChevronDown, FolderTree, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { FileTree } from '@/components/code/FileTree'
import { filterFiles, queryTerms } from '@/components/code/fileTree'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { formatNumber } from '@/core/format'
import type { AnalyzedFile } from '@/core/types'

export interface FilesPaneProps {
  files: AnalyzedFile[]
  selectedPath: string | null
  onSelect: (path: string) => void
  revealPath: string | null
  isSeen: (path: string) => boolean
  /** Phones and tablets: the list folds away behind a "Browse files" button. */
  collapsible: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wide screens: fold the list away to give the code more room. */
  onHide?: () => void
  className?: string
}

/** The left pane of "Read the Code": a search box above the project's folder tree. */
export function FilesPane({ files, selectedPath, onSelect, revealPath, isSeen, collapsible, open, onOpenChange, onHide, className }: FilesPaneProps) {
  const [query, setQuery] = useState('')
  // Typing stays instant: the tree catches up with the latest query when the browser has a moment (and a slower
  // search is simply dropped when the next key arrives). The files are filtered once, here, for the tree and the count.
  const searchQuery = useDeferredValue(query)
  const inputId = useId()
  const bodyId = useId()
  const matches = useMemo(() => (queryTerms(searchQuery).length ? filterFiles(files, searchQuery) : null), [files, searchQuery])
  const matchCount = matches ? matches.length : null
  const showBody = !collapsible || open

  return (
    <section
      aria-label="Files in this project"
      className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm', className)}
      data-testid="files-pane"
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-atlas hover:bg-surface-2"
        >
          <Icon as={FolderTree} className="text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Browse files</span>
            <span className="block truncate text-xs text-ink-3">
              <span className="tabular-nums">{formatNumber(files.length)}</span> files{selectedPath ? ` · now reading ${selectedPath.split('/').pop()}` : ''}
            </span>
          </span>
          <Icon as={ChevronDown} className={cn('text-ink-3 transition-transform duration-150 ease-atlas', open && 'rotate-180')} />
        </button>
      ) : (
        <div className="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4">
          <h2 className="text-sm font-medium text-ink">Files</h2>
          <span className="text-meta">{formatNumber(files.length)}</span>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide the file list"
              title="Hide the file list to give the code more room"
              className="ml-auto flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
            >
              <Icon as={PanelLeftClose} />
            </button>
          )}
        </div>
      )}

      {showBody && (
        <div id={bodyId} className={cn('flex min-h-0 flex-1 flex-col', collapsible && 'border-t border-line')}>
          <div className={cn('px-2 pb-2', collapsible && 'pt-2')}>
            <label htmlFor={inputId} className="sr-only">
              Find a file by name
            </label>
            <div className="relative">
              <Icon as={Search} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
              <input
                id={inputId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query) {
                    e.preventDefault()
                    setQuery('')
                  } else if (e.key === 'ArrowDown') {
                    // Hop from the search box into the results.
                    const row = e.currentTarget.closest('section')?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
                    if (row) {
                      e.preventDefault()
                      row.focus()
                    }
                  }
                }}
                placeholder="Find a file"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-8 pl-8 text-sm text-ink transition-colors duration-150 ease-atlas placeholder:text-ink-3 focus:border-ink-3 focus:outline-hidden [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear the search"
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
                >
                  <Icon as={X} size={14} />
                </button>
              )}
            </div>
            {matchCount != null && (
              <p className="mt-2 px-2 text-meta" aria-hidden>
                {matchCount === 0 ? 'No matches' : `${formatNumber(matchCount)} ${matchCount === 1 ? 'match' : 'matches'}`}
              </p>
            )}
          </div>
          <FileTree
            className={cn('min-h-0 flex-1 pb-2', collapsible && 'max-h-[50vh]')}
            files={files}
            selectedPath={selectedPath}
            onSelect={onSelect}
            query={searchQuery}
            matches={matches}
            revealPath={revealPath}
            isSeen={isSeen}
          />
        </div>
      )}
    </section>
  )
}

/** The slim strip shown in place of the file list after "Hide the file list". */
export function FilesRail({ onShow, className }: { onShow: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-line bg-surface py-2 shadow-sm', className)} data-testid="files-rail">
      <button
        type="button"
        onClick={onShow}
        aria-label="Show the file list"
        title="Show the file list"
        className="flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
      >
        <Icon as={PanelLeftOpen} />
      </button>
    </div>
  )
}
