import type { ReactNode } from 'react'
import { ChevronRight, Lightbulb, SearchX } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Icon, RoleIcon } from '@/components/ui/icons'
import type { AnalyzedFile } from '@/core/types'
import { RichText } from '../bits'

/** Building blocks for the explain panel's bodies. One rhythm: 16 between a block's parts, 24 between sections. */

export function PanelHero({
  icon,
  title,
  subtitle,
  children,
}: {
  /** A lucide icon (RoleIcon, KindIcon, ConceptIcon …) shown in a small tile. */
  icon?: ReactNode
  /** Kept for compatibility; no longer rendered (the interface shows no emoji). */
  emoji?: string
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 data-explain-heading tabIndex={-1} className="text-xl leading-7 font-medium break-words text-ink outline-none">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-1.5">{children}</div>}
      </div>
    </div>
  )
}

export function PanelSection({ title, children, className, count }: { title: ReactNode; children: ReactNode; className?: string; count?: number }) {
  return (
    <section className={cn('mt-6', className)}>
      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-medium text-ink">
        {title}
        {count != null && <span className="text-meta">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Monospace path that wraps nicely (breaks after slashes). */
export function PathText({ path, className }: { path: string; className?: string }) {
  return <span className={cn('font-mono text-xs break-all text-ink-3', className)}>{path || '(top level)'}</span>
}

/** Facts as a quiet list: muted labels in one column, values beside them, hairlines between rows. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line text-sm">
      {items.map((it) => (
        <div key={it.label} className="flex gap-4 py-2">
          <dt className="w-24 shrink-0 text-ink-3">{it.label}</dt>
          <dd className="min-w-0 flex-1 text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A figure with a quiet mono label under a hairline. */
export function MiniStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0 border-t border-line pt-2">
      <p className="truncate text-lg leading-7 font-medium text-ink tabular-nums">{value}</p>
      <p className="truncate text-meta">{label}</p>
    </div>
  )
}

/** A clickable file row: role icon, name, folder and one-line summary. */
export function FileRow({ file, onOpen, note }: { file: AnalyzedFile; onOpen: (path: string) => void; note?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(file.path)}
        className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-atlas hover:bg-surface-2"
        title={file.path}
      >
        <RoleIcon role={file.isEntry ? 'entry' : file.role} className="mt-0.5 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono text-[13px] text-ink">{file.name}</span>
            <span className="truncate font-mono text-xs text-ink-3">{file.dir}</span>
          </span>
          <RichText text={note ?? file.summary} className="mt-0.5 line-clamp-2 block text-xs leading-4 text-ink-2" />
        </span>
        <Icon as={ChevronRight} className="mt-0.5 text-ink-3 opacity-0 transition-opacity duration-150 ease-atlas group-hover:opacity-100" />
      </button>
    </li>
  )
}

/** "We couldn't find …" state for stale targets. */
export function Missing({ what }: { what: string }) {
  return (
    <div className="py-12 text-center">
      <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2" aria-hidden>
        <Icon as={SearchX} size={18} />
      </span>
      <h2 data-explain-heading tabIndex={-1} className="mt-4 text-lg font-medium text-ink outline-none">
        We couldn’t find that {what}
      </h2>
      <p className="mt-1 text-sm text-ink-2">It may belong to a different project, or to a version of this one that has since changed.</p>
    </div>
  )
}

/** A small "this is how it works" note with an everyday analogy. */
export function Analogy({ text, label = 'Think of it like this' }: { text: string; label?: string }) {
  return (
    <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs leading-4 text-ink-3">
        <Icon as={Lightbulb} size={14} />
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{text}</p>
    </div>
  )
}
