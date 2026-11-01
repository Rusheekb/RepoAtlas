import { useMemo, useState, type ReactNode } from 'react'
import { RefreshCw, Sparkles, X } from 'lucide-react'
import { CodeViewer, MAX_HIGHLIGHT_LINES } from '@/components/code/CodeViewer'
import { grammarFor } from '@/components/code/languages'
import { GitHubMark, OutboundLink } from '@/components/shell/bits'
import { useMediaQuery } from '@/components/shell/hooks'
import { makeReadmeResolver } from '@/components/shell/urls'
import { Badge, Button, Markdown, Segmented } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatBytes, formatNumber } from '@/core/format'
import { ROLE_INFO } from '@/core/labels'
import type { AnalyzedFile } from '@/core/types'
import { githubFileUrl, rawFileUrl } from '@/github'
import { breadcrumbs, describeRange, isImagePath, isMarkdownPath, skipNote, type LineRange } from './explorer'
import type { FileLoad } from './useFileContent'

export interface CodePaneProps {
  file: AnalyzedFile
  load: FileLoad
  onRetry: () => void
  owner: string
  repo: string
  /** Commit or branch for links and raw downloads. */
  gitRef: string
  isPrivate: boolean
  highlight: LineRange | null
  onSelectLines: (range: LineRange | null) => void
  onExplainLines: (range: LineRange) => void
  /** Open a folder of the breadcrumb in the file list. */
  onRevealFolder: (path: string) => void
  scrollKey: number
  className?: string
}

type MarkdownMode = 'formatted' | 'raw'

function Skeleton() {
  return (
    <div className="space-y-2.5 p-5" role="status" aria-label="Loading the code">
      {[62, 80, 45, 90, 70, 38, 84, 56].map((w, i) => (
        <div key={i} className="h-3 rounded-full bg-surface-3 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
      ))}
      <p className="pt-2 text-sm text-ink-3">Downloading this file from GitHub…</p>
    </div>
  )
}

function Notice({ emoji, title, children, actions }: { emoji: string; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="text-4xl leading-none" aria-hidden>
        {emoji}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{children}</div>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

/** The middle pane of "Read the Code": where the file lives, what it is, and the code itself. */
export function CodePane(props: CodePaneProps) {
  const { file, load, onRetry, owner, repo, gitRef, isPrivate, highlight, onSelectLines, onExplainLines, onRevealFolder, scrollKey, className } = props
  const [mdMode, setMdMode] = useState<MarkdownMode>('formatted')
  const touch = useMediaQuery('(pointer: coarse)', false)
  const [failedPreview, setFailedPreview] = useState<string | null>(null)
  const crumbs = breadcrumbs(file.path)
  const role = file.isEntry ? ROLE_INFO.entry : (ROLE_INFO[file.role] ?? ROLE_INFO.other)
  const ghUrl = githubFileUrl(owner, repo, gitRef, file.path, highlight?.start)
  const isMd = isMarkdownPath(file.path)
  const content = load.status === 'ready' ? load.content : null
  const lineCount = useMemo(() => (content == null ? file.lines : content === '' ? 0 : content.replace(/\n$/, '').split('\n').length), [content, file.lines])
  const showFormatted = isMd && mdMode === 'formatted'
  const resolveUrl = useMemo(() => makeReadmeResolver({ owner, repo, sha: gitRef, readmePath: file.path }), [owner, repo, gitRef, file.path])
  const plainBecauseLong = content != null && lineCount != null && lineCount > MAX_HIGHLIGHT_LINES && grammarFor(file.language, file.path) !== null
  const note = load.status === 'ready' || load.status === 'loading' || load.status === 'error' ? skipNote(load.reason) : null

  const githubButton = (
    <OutboundLink href={ghUrl} className="text-sm">
      <GitHubMark className="size-3.5" /> Open on GitHub
    </OutboundLink>
  )

  let body: ReactNode
  if (load.status === 'loading') body = <Skeleton />
  else if (load.status === 'error') {
    body = (
      <Notice
        emoji="📡"
        title="This file didn’t arrive"
        actions={
          <>
            <Button variant="primary" size="sm" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onRetry}>
              Try again
            </Button>
            <OutboundLink href={ghUrl} className="h-8 px-2 text-sm">
              Read it on GitHub
            </OutboundLink>
          </>
        }
      >
        <p role="alert">{load.message}</p>
      </Notice>
    )
  } else if (load.status === 'binary') {
    const preview = isImagePath(file.path) && !isPrivate && failedPreview !== file.path ? rawFileUrl(owner, repo, gitRef, file.path) : null
    body = preview ? (
      <div className="flex h-full min-h-60 flex-col items-center justify-center gap-4 p-6">
        <img
          src={preview}
          alt={`Preview of ${file.name}`}
          onError={() => setFailedPreview(file.path)}
          className="max-h-[50vh] max-w-full rounded-lg border border-line bg-surface-2 object-contain p-2"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <p className="max-w-md text-center text-sm text-ink-2">This is a picture, not code, so there’s nothing to read line by line. Projects keep images like this for logos, icons and screenshots.</p>
      </div>
    ) : (
      <Notice emoji="🖼️" title="Nothing to read here" actions={githubButton}>
        This file isn’t text: it’s something like an image, a font, or a program that has already been packaged up for computers. People
        don’t read these line by line.
      </Notice>
    )
  } else if (load.status === 'too-large') {
    body = (
      <Notice emoji="📚" title="This file is too big to show here" actions={githubButton}>
        It’s {formatBytes(load.size)}, which would make your browser slow. Very big files are usually data or code made by a tool, not
        something people write by hand.
      </Notice>
    )
  } else if (content != null && content.trim() === '') {
    body = (
      <Notice emoji="🫙" title="This file is empty">
        That’s often on purpose: some tools just need a file to exist. For example, an empty <code className="font-mono text-[0.9em]">__init__.py</code>{' '}
        tells Python that a folder holds code.
      </Notice>
    )
  } else if (content != null && showFormatted) {
    body = (
      <div className="h-full overflow-y-auto px-5 py-5 sm:px-8 sm:py-6" tabIndex={0} role="region" aria-label={`${file.name}, formatted`}>
        <Markdown className="mx-auto max-w-3xl" resolveUrl={resolveUrl}>
          {content}
        </Markdown>
      </div>
    )
  } else if (content != null) {
    body = (
      <CodeViewer
        key={file.path}
        className="h-full"
        path={file.path}
        code={content}
        language={file.language}
        highlight={highlight}
        onSelectLines={onSelectLines}
        scrollKey={scrollKey}
      />
    )
  }

  const canSelect = content != null && content.trim() !== '' && !showFormatted

  return (
    <section
      aria-label={`The file ${file.name}`}
      className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm', className)}
      data-testid="code-pane"
    >
      <header className="border-b border-line px-4 py-3">
        <nav aria-label="Where this file lives" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[13px]">
            {crumbs.map((c, i) => (
              <li key={c.path} className="flex min-w-0 items-center gap-1">
                {i > 0 && (
                  <span className="text-ink-3" aria-hidden>
                    /
                  </span>
                )}
                {c.isFile ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {c.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRevealFolder(c.path)}
                    className="truncate rounded text-ink-2 hover:text-brand-text hover:underline"
                    title={`Show the “${c.path}” folder in the file list`}
                  >
                    {c.name}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          <Badge tone="brand" title={role.description}>
            <span aria-hidden>{role.emoji}</span> {role.label}
          </Badge>
          {file.language && <Badge>{file.language}</Badge>}
          {lineCount != null && lineCount > 0 && <span className="text-xs text-ink-3 tabular-nums">{formatNumber(lineCount)} {lineCount === 1 ? 'line' : 'lines'}</span>}
          <span className="text-xs text-ink-3">{formatBytes(file.size)}</span>
          <span className="ml-auto flex items-center gap-3">
            {isMd && content != null && content.trim() !== '' && (
              <Segmented<MarkdownMode>
                label="Show this document"
                size="sm"
                value={mdMode}
                onChange={setMdMode}
                options={[
                  { value: 'formatted', label: 'Formatted', title: 'Show it the way GitHub displays it' },
                  { value: 'raw', label: 'Raw text', title: 'Show the text exactly as written, with line numbers' },
                ]}
              />
            )}
            {githubButton}
          </span>
        </div>
        {note && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{note}</p>}
      </header>

      <div className="relative min-h-0 flex-1">
        {body}
        {highlight && canSelect && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <div
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-lg motion-safe:animate-[atlas-pop_160ms_ease-out]"
              data-testid="explain-lines"
            >
              <button
                type="button"
                onClick={() => onExplainLines(highlight)}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-ink shadow-sm hover:bg-brand-hover"
              >
                <Sparkles className="size-4" aria-hidden />
                Explain {describeRange(highlight)}
              </button>
              <button
                type="button"
                onClick={() => onSelectLines(null)}
                aria-label="Clear the selected lines"
                title="Clear the selection"
                className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      {canSelect && (
        <footer className="border-t border-line bg-surface-2/60 px-4 py-2 text-xs leading-relaxed text-ink-3 sm:truncate">
          {plainBecauseLong ? (
            <span>This file is very long, so it’s shown without colors to keep things fast. </span>
          ) : null}
          <span>
            <span aria-hidden>💡 </span>
            {touch
              ? 'Tap a line number, then tap another to pick a range. Then ask what those lines do.'
              : 'Click line numbers to pick lines (Shift-click or drag for more), then ask what they do.'}
          </span>
        </footer>
      )}
    </section>
  )
}
