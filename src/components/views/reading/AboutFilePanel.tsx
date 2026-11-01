import { forwardRef, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MessageCircleQuestion, X } from 'lucide-react'
import { AiAnswer } from '@/components/AiAnswer'
import { NeighborhoodGraph } from '@/components/graphs'
import { RichText } from '@/components/shell/bits'
import { LayerBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
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

function Section({ emoji, title, subtitle, children, className }: { emoji: string; title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-4 shadow-sm', className)} aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden>{emoji}</span>
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** The right-hand pane of "Read the Code": what this file is for, in plain English, plus what's inside and what it connects to. */
export const AboutFilePanel = forwardRef<HTMLDivElement, AboutFilePanelProps>(function AboutFilePanel(props, ref) {
  const { file, allFiles, module, explainRange, onCloseExplain, onOpenFile, onJumpToLine, onOpenModule, askHref, className } = props
  const [showAllSymbols, setShowAllSymbols] = useState(false)
  const role = file.isEntry ? ROLE_INFO.entry : (ROLE_INFO[file.role] ?? ROLE_INFO.other)
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
            <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Your selection · {describeRange(explainRange)}</p>
            <button type="button" onClick={onCloseExplain} className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-ink-2 hover:text-ink">
              <X className="size-3.5" aria-hidden />
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
            className="shadow-md ring-2 ring-brand/25"
          />
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby="about-file-title">
        <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">About this file</p>
        <h2 id="about-file-title" className="mt-1 flex min-w-0 items-center gap-2 text-lg font-semibold text-ink">
          <span className="shrink-0 text-xl leading-none" aria-hidden>
            {role.emoji}
          </span>
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
          <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm leading-relaxed text-ink">
            <span className="font-semibold text-brand-text">🚀 A starting point. </span>
            <RichText text={file.entryReason ?? ROLE_INFO.entry.description} />
          </p>
        )}
        <dl className="mt-3 space-y-2.5 text-sm">
          <div>
            <dt className="text-xs font-medium text-ink-3">Its job</dt>
            <dd className="mt-0.5 text-ink">
              <span className="font-medium">
                <span aria-hidden>{plainRole.emoji} </span>
                {plainRole.label}
              </span>
              <span className="text-ink-2">: {plainRole.description}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-3">Kind of code</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <LayerBadge layer={file.layer} />
              <span className="text-xs text-ink-2">{layer.description}</span>
            </dd>
          </div>
          {module && (
            <div>
              <dt className="text-xs font-medium text-ink-3">Part of</dt>
              <dd className="mt-0.5">
                <button
                  type="button"
                  onClick={() => onOpenModule(module.id)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md text-left font-medium text-brand-text hover:underline"
                  title="Learn about this part of the project"
                >
                  <span aria-hidden>{module.emoji}</span>
                  <span className="truncate">{module.name}</span>
                </button>
                {module.role && module.role !== module.name && <span className="text-ink-2"> · {module.role}</span>}
              </dd>
            </div>
          )}
        </dl>
        <Link
          to={askHref}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-text underline-offset-2 hover:underline"
        >
          <MessageCircleQuestion className="size-4" aria-hidden />
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
        emoji="🔗"
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
          emoji="🗂️"
          title="What’s inside"
          subtitle={`${pluralize(symbols.length, 'named piece')} of code, in order. Click one to jump to it.`}
        >
          <ul className="-mx-1.5 space-y-0.5" data-testid="outline">
            {shownSymbols.map((s, i) => {
              const kind = SYMBOL_KIND_LABEL[s.kind] ?? { label: s.kind, emoji: '•' }
              return (
                <li key={`${s.name}:${s.line}:${i}`}>
                  <button
                    type="button"
                    onClick={() => onJumpToLine(s.line)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-2"
                    title={s.signature ?? s.name}
                  >
                    <span className="shrink-0 text-sm leading-none" aria-hidden>
                      {kind.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] text-ink">{s.name}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {kind.label}
                        {s.exported ? ' · shared with other files' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">line {formatNumber(s.line)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {symbols.length > OUTLINE_PREVIEW && (
            <button type="button" onClick={() => setShowAllSymbols((v) => !v)} className="mt-2 text-sm font-medium text-brand-text hover:underline">
              {showAllSymbols ? 'Show fewer' : `Show all ${formatNumber(symbols.length)}`}
            </button>
          )}
        </Section>
      )}

      {file.routes.length > 0 && (
        <Section
          emoji="🧭"
          title="Web addresses it answers"
          subtitle="When someone visits one of these addresses, this file decides what happens. Click one to see the code."
        >
          <ul className="-mx-1.5 space-y-0.5">
            {file.routes.map((r, i) => (
              <li key={`${r.method}:${r.path}:${r.line}:${i}`}>
                <button
                  type="button"
                  onClick={() => onJumpToLine(r.line)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="w-12 shrink-0 rounded-md bg-surface-2 py-0.5 text-center font-mono text-[11px] font-semibold text-ink-2">{r.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{r.path}</span>
                  <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">line {formatNumber(r.line)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
})
