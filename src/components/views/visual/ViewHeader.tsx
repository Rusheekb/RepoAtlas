import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

export interface ViewHeaderProps {
  emoji: string
  title: ReactNode
  /** One plain-English line on how to read the view. */
  hint: ReactNode
  /** Controls shown to the right (wrapping underneath on narrow screens). */
  actions?: ReactNode
  className?: string
}

/** The title block every visual view starts with: emoji, a clear title, and a one-line "how to read this" hint. */
export function ViewHeader({ emoji, title, hint, actions, className }: ViewHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 flex-[1_1_22rem]">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          <span className="text-[0.85em] leading-none" aria-hidden>
            {emoji}
          </span>
          <span className="min-w-0">{title}</span>
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-2 sm:text-[15px]">{hint}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
