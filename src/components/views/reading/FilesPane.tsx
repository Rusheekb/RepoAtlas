import { useId, useMemo, useState } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { FileTree } from '@/components/code/FileTree'
import { filterFiles, queryTerms } from '@/components/code/fileTree'
import { cn } from '@/components/ui/cn'
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
  const inputId = useId()
  const bodyId = useId()
  const matchCount = useMemo(() => (queryTerms(query).length ? filterFiles(files, query).length : null), [files, query])
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
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <span aria-hidden>📂</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Browse files</span>
            <span className="block truncate text-xs text-ink-3">
              {formatNumber(files.length)} files{selectedPath ? ` · now reading ${selectedPath.split('/').pop()}` : ''}
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-3 motion-safe:transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      ) : (
        <div className="flex items-center gap-2 pt-2.5 pr-2 pl-4">
          <h2 className="text-sm font-semibold text-ink">
            <span aria-hidden>📂 </span>Files
          </h2>
          <span className="text-xs text-ink-3 tabular-nums">{formatNumber(files.length)}</span>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide the file list"
              title="Hide the file list to give the code more room"
              className="ml-auto flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftClose className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      {showBody && (
        <div id={bodyId} className={cn('flex min-h-0 flex-1 flex-col', collapsible && 'border-t border-line')}>
          <div className="px-3 pt-3 pb-2">
            <label htmlFor={inputId} className="sr-only">
              Find a file by name
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
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
                placeholder="Find a file…"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-xl border border-line-strong bg-surface pr-8 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear the search"
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
            {matchCount != null && (
              <p className="mt-1.5 px-1 text-xs text-ink-3" aria-hidden>
                {matchCount === 0 ? 'No matches' : `${formatNumber(matchCount)} ${matchCount === 1 ? 'match' : 'matches'}`}
              </p>
            )}
          </div>
          <FileTree
            className={cn('min-h-0 flex-1 pb-2', collapsible && 'max-h-[50vh]')}
            files={files}
            selectedPath={selectedPath}
            onSelect={onSelect}
            query={query}
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
        className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <PanelLeftOpen className="size-4" aria-hidden />
      </button>
      <span className="mt-2 text-base leading-none" aria-hidden>
        📂
      </span>
    </div>
  )
}
