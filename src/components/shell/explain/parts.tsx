import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { ROLE_INFO } from '@/core/labels'
import type { AnalyzedFile } from '@/core/types'
import { RichText } from '../bits'

/** Building blocks for the explain panel's bodies. */

export function PanelHero({
  emoji,
  title,
  subtitle,
  children,
}: {
  emoji: string
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-[26px] leading-none" aria-hidden>
        {emoji}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 data-explain-heading tabIndex={-1} className="text-xl leading-tight font-semibold tracking-tight break-words text-ink outline-none">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-1.5">{children}</div>}
      </div>
    </div>
  )
}

export function PanelSection({ title, children, className, count }: { title: ReactNode; children: ReactNode; className?: string; count?: number }) {
  return (
    <section className={cn('mt-6', className)}>
      <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-semibold text-ink">
        {title}
        {count != null && <span className="text-xs font-medium text-ink-3 tabular-nums">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Monospace path that wraps nicely (breaks after slashes). */
export function PathText({ path, className }: { path: string; className?: string }) {
  return <span className={cn('font-mono text-xs break-all text-ink-3', className)}>{path || '(top level)'}</span>
}

/** Two-column facts list. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-ink-3">{it.label}</dt>
          <dd className="min-w-0 text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MiniStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <p className="truncate text-lg font-semibold text-ink tabular-nums">{value}</p>
      <p className="truncate text-[11px] font-medium text-ink-3">{label}</p>
    </div>
  )
}

/** A clickable file row: role emoji, name, folder and one-line summary. */
export function FileRow({ file, onOpen, note }: { file: AnalyzedFile; onOpen: (path: string) => void; note?: string }) {
  const role = file.isEntry ? ROLE_INFO.entry : (ROLE_INFO[file.role] ?? ROLE_INFO.other)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(file.path)}
        className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
        title={file.path}
      >
        <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-none" aria-hidden>
          {role.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono text-[13px] font-medium text-ink group-hover:text-brand-text">{file.name}</span>
            <span className="truncate font-mono text-[11px] text-ink-3">{file.dir}</span>
          </span>
          <RichText text={note ?? file.summary} className="mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-2" />
        </span>
        <ChevronRight className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </button>
    </li>
  )
}

/** "We couldn't find …" state for stale targets. */
export function Missing({ what }: { what: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-3xl" aria-hidden>
        🧐
      </p>
      <h2 data-explain-heading tabIndex={-1} className="mt-3 text-lg font-semibold text-ink outline-none">
        We couldn’t find that {what}
      </h2>
      <p className="mt-1 text-sm text-ink-2">It may belong to a different project, or to a version of this one that has since changed.</p>
    </div>
  )
}

/** A small "this is how it works" callout with an everyday analogy. */
export function Analogy({ text, label = 'Think of it like this' }: { text: string; label?: string }) {
  return (
    <div className="mt-4 rounded-xl border border-transparent bg-brand-soft px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-text uppercase">
        <span aria-hidden>💡</span>
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{text}</p>
    </div>
  )
}
