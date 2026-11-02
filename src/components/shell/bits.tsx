import { Fragment, useMemo, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { safeHttpUrl } from './urls'

/**
 * Small presentational pieces shared by the shell, the overview, the glossary and the explain panel.
 * Everything here is stateless.
 */

/** The GitHub "octocat" mark (lucide no longer ships brand icons). Decorative; uses currentColor. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-4 shrink-0', className)} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/**
 * A link to another website. Only http(s) URLs render as links (anything else renders as plain text), and they always
 * open in a new tab with a screen-reader hint.
 */
export function OutboundLink({
  href,
  children,
  className,
  icon = true,
  title,
}: {
  href: string | null | undefined
  children: ReactNode
  className?: string
  /** Show the little ↗ arrow (default true). */
  icon?: boolean
  title?: string
}) {
  const url = safeHttpUrl(href)
  if (!url) return <span className={className}>{children}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      className={cn(
        'inline-flex items-center gap-1 font-medium text-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-150 ease-atlas hover:decoration-ink-3',
        className,
      )}
    >
      {children}
      {icon && <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/**
 * A page section with a heading, an optional subtitle and optional actions on the right.
 * (`emoji` is kept for compatibility and is no longer rendered: the interface shows no emoji.)
 */
export function PageSection({
  id,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  id: string
  emoji?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = `${id}-title`
  return (
    <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-6', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-medium text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-1 max-w-3xl text-[15px] leading-6 text-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** A soft, rounded notice. `tone` only changes the icon tint and border; the text always carries the meaning. */
export function Callout({
  icon,
  title,
  children,
  tone = 'neutral',
  className,
}: {
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  tone?: 'neutral' | 'brand' | 'warn' | 'bad' | 'good'
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-surface-2',
    brand: 'border-transparent bg-brand-soft',
    warn: 'border-line bg-surface-2',
    bad: 'border-line bg-surface-2',
    good: 'border-line bg-surface-2',
  }
  const iconTones = {
    neutral: 'text-ink-2',
    brand: 'text-brand-text',
    warn: 'text-warn-text',
    bad: 'text-bad-text',
    good: 'text-good-text',
  }
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3', tones[tone], className)}>
      {icon && <div className={cn('mt-0.5 shrink-0 leading-none', iconTones[tone])}>{icon}</div>}
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5 text-ink-2' : 'text-ink')}>{children}</div>}
      </div>
    </div>
  )
}

/** A figure with a quiet mono label under a hairline, e.g. "236" over "files". */
export function StatTile({ value, label, hint, className }: { value: ReactNode; label: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn('min-w-0 border-t border-line pt-3', className)} title={hint}>
      <p className="text-2xl leading-8 font-medium text-ink tabular-nums">{value}</p>
      <p className="mt-1 truncate text-meta">{label}</p>
    </div>
  )
}

/** A small tag-shaped button used for "Uses …", related terms, filters and the like. */
export function ChipButton({
  children,
  onClick,
  title,
  className,
  active,
  size = 'md',
}: {
  children: ReactNode
  onClick: () => void
  title?: string
  className?: string
  active?: boolean
  /** `sm` = 24px tall (inside cards), `md` = 28px (default). */
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors duration-150 ease-atlas',
        size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[13px]',
        active ? 'border-transparent bg-brand text-brand-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Split text on `backtick` spans. Odd indexes are code. */
export function splitCode(text: string): { text: string; code: boolean; start: number }[] {
  const out: { text: string; code: boolean; start: number }[] = []
  const re = /`([^`\n]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), code: false, start: last })
    out.push({ text: m[1], code: true, start: m.index })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), code: false, start: last })
  return out
}

export const INLINE_CODE_CLASS = 'rounded border border-line bg-surface-2 px-[0.35em] py-[0.05em] font-mono text-[0.86em] text-ink'

/** Plain text where `backticked` bits render as inline code. No links, safe inside buttons. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitCode(text), [text])
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.code ? (
          <code key={i} className={INLINE_CODE_CLASS}>
            {p.text}
          </code>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </span>
  )
}
