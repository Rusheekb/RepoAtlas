import { forwardRef, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MessageCircleQuestion, X } from 'lucide-react'
import { AiAnswer } from '@/components/AiAnswer'
import { NeighborhoodGraph } from '@/components/graphs'
import { RichText } from '@/components/shell/bits'
import { LayerBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { Icon, RoleIcon } from '@/components/ui/icons'
import { formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import type { AnalyzedFile, ModuleInfo } from '@/core/types'
import { describeRange, SYMBOL_KIND_LABEL, type LineRange } from './explorer'

export interface AboutFilePanelProps {
  file: AnalyzedFile
  allFiles: Record<string, AnalyzedFile>
  module: ModuleInfo | undefined
  /** Lines the reader asked Claude about (shows an explanation at the top). */
  explainRange: LineRange | null
  onCloseExplain: () => void
  onOpenFile: (path: string) => void
  onJumpToLine: (line: number) => void
  onOpenModule: (id: string) => void
  /** Link to "Ask a Question" with a question about this file filled in. */
  askHref: string
  className?: string
}

/** Outline entries shown before "Show all". */
const OUTLINE_PREVIEW = 25

/** A quiet section of the panel: a hairline card with a plain heading (no icon) and a one-line note on how to use it. */
function Section({ title, subtitle, children, className }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-4', className)} aria-label={title}>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-3">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Quiet inline link style for this panel: ink text with a hairline underline that darkens on hover. */
const LINK = 'text-ink underline decoration-line-strong underline-offset-2 transition-[text-decoration-color] duration-150 ease-atlas hover:decoration-ink'

/** A row in the outline or the list of web addresses: jumps to a line in the code. */
const JUMP_ROW = 'flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors duration-150 ease-atlas hover:bg-surface-2'

/** The right-hand pane of "Read the Code": what this file is for, in plain English, plus what's inside and what it connects to. */
export const AboutFilePanel = forwardRef<HTMLDivElement, AboutFilePanelProps>(function AboutFilePanel(props, ref) {
  const { file, allFiles, module, explainRange, onCloseExplain, onOpenFile, onJumpToLine, onOpenModule, askHref, className } = props
  const [showAllSymbols, setShowAllSymbols] = useState(false)
  const plainRole = ROLE_INFO[file.role] ?? ROLE_INFO.other
  const layer = LAYER_INFO[file.layer] ?? LAYER_INFO.other
  const symbols = useMemo(() => file.symbols.slice().sort((a, b) => a.line - b.line), [file.symbols])
  const shownSymbols = showAllSymbols ? symbols : symbols.slice(0, OUTLINE_PREVIEW)
  const hasLinks = file.imports.length > 0 || file.importedBy.length > 0 || file.externalImports.length > 0

  return (
    <div ref={ref} className={cn('flex min-w-0 flex-col gap-4', className)} data-testid="about-file">
      {explainRange && (
        <div data-testid="selection-explain">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            {/* The small accent mark matches the one beside the selected lines in the code. */}
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <span className="h-3 w-0.5 shrink-0 rounded-full bg-accent" aria-hidden />
              Your selection, {describeRange(explainRange)}
            </p>
            <button
              type="button"
              onClick={onCloseExplain}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
            >
              <Icon as={X} size={14} />
              Close
            </button>
          </div>
          <AiAnswer
            key={`${file.path}:${explainRange.start}-${explainRange.end}`}
            task={{ kind: 'selection', path: file.path, startLine: explainRange.start, endLine: explainRange.end }}
            title={explainRange.start === explainRange.end ? `What line ${explainRange.start} does` : `What lines ${explainRange.start}–${explainRange.end} do`}
            cta={`Explain ${describeRange(explainRange)}`}
            pitch="Claude will read these lines in context and explain what they do, step by step."
            autoRun
            compact
          />
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby="about-file-title">
        <h2 id="about-file-title" className="flex min-w-0 items-center gap-2 text-lg font-medium text-ink">
          <span className="sr-only">About this file:</span>{' '}
          <RoleIcon role={file.isEntry ? 'entry' : file.role} size={18} className="text-ink-3" />
          <span className="min-w-0 truncate" title={file.path}>
            {file.name}
          </span>
        </h2>
        {file.summary && (
          <p className="mt-2 text-sm leading-relaxed text-ink">
            <RichText text={file.summary} />
          </p>
        )}
        {file.isEntry && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink-2">
            <span className="font-medium text-ink">A starting point. </span>
            <RichText text={file.entryReason ?? ROLE_INFO.entry.description} />
          </p>
        )}
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-3">Its job</dt>
            <dd className="mt-1 text-ink">
              <span className="font-medium">{plainRole.label}</span>
              <span className="text-ink-2">: {plainRole.description}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Kind of code</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <LayerBadge layer={file.layer} />
              <span className="text-xs text-ink-2">{layer.description}</span>
            </dd>
          </div>
          {module && (
            <div>
              <dt className="text-xs text-ink-3">Part of</dt>
              <dd className="mt-1">
                <button
                  type="button"
                  onClick={() => onOpenModule(module.id)}
                  className={cn('max-w-full truncate rounded-sm text-left font-medium', LINK)}
                  title="Learn about this part of the project"
                >
                  {module.name}
                </button>
                {module.role && module.role !== module.name && <span className="text-ink-2"> · {module.role}</span>}
              </dd>
            </div>
          )}
        </dl>
        <Link
          to={askHref}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink underline-offset-2 hover:underline"
        >
          <Icon as={MessageCircleQuestion} className="text-ink-3" />
          Ask a question about this file
        </Link>
      </section>

      <AiAnswer
        key={file.path}
        task={{ kind: 'file', path: file.path }}
        title="Explained by Claude"
        cta="Explain this file in plain English"
        pitch="Claude will read this file and explain what it does and why it matters, in everyday words."
        compact
      />

      <Section
        title="How it connects"
        subtitle={hasLinks ? 'Files that use this one, and the files and tools it uses. Click one to open it.' : undefined}
      >
        {hasLinks ? (
          <NeighborhoodGraph file={file} allFiles={allFiles} onSelect={onOpenFile} maxPerSide={6} />
        ) : (
          <p className="text-sm text-ink-2">We didn’t spot any other files that this one uses, or that use it. It may work on its own, like a settings file or a guide.</p>
        )}
      </Section>

      {symbols.length > 0 && (
        <Section
          title="What’s inside"
          subtitle={`${pluralize(symbols.length, 'named piece')} of code, in order. Click one to jump to it.`}
        >
          <ul className="-mx-2 space-y-0.5" data-testid="outline">
            {shownSymbols.map((s, i) => {
              const kind = SYMBOL_KIND_LABEL[s.kind] ?? { label: s.kind }
              return (
                <li key={`${s.name}:${s.line}:${i}`}>
                  <button type="button" onClick={() => onJumpToLine(s.line)} className={JUMP_ROW} title={s.signature ?? s.name}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] leading-5 text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {kind.label}
                        {s.exported ? ' · shared with other files' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-meta">line {formatNumber(s.line)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {symbols.length > OUTLINE_PREVIEW && (
            <button type="button" onClick={() => setShowAllSymbols((v) => !v)} className={cn('mt-3 rounded-sm text-sm font-medium', LINK)}>
              {showAllSymbols ? 'Show fewer' : `Show all ${formatNumber(symbols.length)}`}
            </button>
          )}
        </Section>
      )}

      {file.routes.length > 0 && (
        <Section
          title="Web addresses it answers"
          subtitle="When someone visits one of these addresses, this file decides what happens. Click one to see the code."
        >
          <ul className="-mx-2 space-y-0.5">
            {file.routes.map((r, i) => (
              <li key={`${r.method}:${r.path}:${r.line}:${i}`}>
                <button type="button" onClick={() => onJumpToLine(r.line)} className={cn(JUMP_ROW, 'h-8 py-0')}>
                  <span className="w-12 shrink-0 rounded-sm bg-surface-2 py-0.5 text-center font-mono text-xs font-medium text-ink-2">{r.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{r.path}</span>
                  <span className="shrink-0 text-meta">line {formatNumber(r.line)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
})
