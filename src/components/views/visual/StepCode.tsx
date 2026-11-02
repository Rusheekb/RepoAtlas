import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ExternalLink, FileCode2 } from 'lucide-react'
import { CodeViewer } from '@/components/code/CodeViewer'
import { cn } from '@/components/ui/cn'
import { useRepoNav } from '@/components/shell/hooks'
import { formatNumber } from '@/core/format'
import { githubFileUrl } from '@/github'
import { useRepoStore } from '@/state/repo'
import { EXCERPT_RADIUS, snippetExcerpt } from './snippet'

export interface StepCodeProps {
  /** Repo path of the file. Render with `key={path}` so a new file starts fresh. */
  path: string
  /** The line of code the step quotes (found and highlighted in the file). */
  snippet: string | null
  language: string | null
  owner: string
  repo: string
  /** Commit or branch for the GitHub link. */
  gitRef: string
  className?: string
}

type Load = { status: 'loading' } | { status: 'ready'; content: string } | { status: 'error' }

/**
 * The bit of code a tour step talks about: loads the file, finds the quoted line (exactly, then ignoring spacing),
 * and shows a few lines either side with that line highlighted and real line numbers. Links to the full file.
 */
export function StepCode({ path, snippet, language, owner, repo, gitRef, className }: StepCodeProps) {
  const getFileContent = useRepoStore((s) => s.getFileContent)
  const { href } = useRepoNav()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    getFileContent(path).then(
      (content) => alive && setLoad({ status: 'ready', content }),
      () => alive && setLoad({ status: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [getFileContent, path])

  const excerpt = useMemo(() => (load.status === 'ready' ? snippetExcerpt(load.content, snippet, EXCERPT_RADIUS) : null), [load, snippet])
  const line = excerpt?.line ?? null
  const ghUrl = githubFileUrl(owner, repo, gitRef, path, line ?? undefined)

  return (
    <figure className={cn('overflow-hidden rounded-xl border border-line bg-surface-2', className)} data-testid="step-code">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line bg-surface px-3 py-2">
        <Link
          to={href('explore', { file: path, line: line ? String(line) : undefined })}
          className="inline-flex min-w-0 items-center gap-2 rounded-md text-[13px] text-ink decoration-line-strong underline-offset-2 hover:underline"
          title="Open this file in Read the code"
        >
          <FileCode2 className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
          <span className="truncate font-mono">{path}</span>
        </Link>
        <span className="flex items-center gap-3 text-xs text-ink-3">
          {excerpt && excerpt.totalLines > 0 && (
            <span className="text-meta">
              {line ? `Line ${formatNumber(line)}` : `Lines ${excerpt.start}–${excerpt.end}`} of {formatNumber(excerpt.totalLines)}
            </span>
          )}
          <a
            href={ghUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium text-ink-2 transition-colors duration-150 ease-atlas hover:text-ink"
          >
            GitHub <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </span>
      </figcaption>
      {load.status === 'loading' && (
        // Live: the file is downloading, so the placeholder lines pulse until it arrives.
        <div className="space-y-2 p-4" aria-label="Loading the code" role="status">
          {[72, 54, 88, 40, 66].map((w, i) => (
            <div key={i} className="h-3 rounded bg-surface-3 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {load.status === 'error' && (
        <p className="p-4 text-sm text-ink-2">
          We couldn’t download this file right now. You can still{' '}
          <a href={ghUrl} target="_blank" rel="noreferrer noopener" className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
            read it on GitHub
          </a>
          .
        </p>
      )}
      {excerpt &&
        (excerpt.totalLines === 0 || !excerpt.code.trim() ? (
          <p className="p-4 text-sm text-ink-2">This file is empty</p>
        ) : (
          <>
            <CodeViewer
              code={excerpt.code}
              firstLineNumber={excerpt.start}
              highlight={line ? { start: line, end: line } : null}
              language={language}
              path={path}
              maxHeight={320}
            />
            {snippet && !line && (
              <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
                We couldn’t spot the exact line this step mentions, so here’s the start of the file
              </p>
            )}
          </>
        ))}
    </figure>
  )
}
