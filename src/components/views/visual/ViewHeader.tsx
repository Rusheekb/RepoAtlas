import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { ViewIcon } from '@/components/ui/icons'
import { VIEW_INFO } from '@/core/labels'
import type { ViewId } from '@/core/types'

export interface ViewHeaderProps {
  /** Which view this is; picks its icon. */
  view?: ViewId
  /**
   * @deprecated Emoji are no longer shown. Kept so older call sites still compile: when `view` is missing, the view
   * is worked out from this (the emoji in VIEW_INFO) so the right icon still appears.
   */
  emoji?: string
  title: ReactNode
  /** One plain-English line on how to read the view. */
  hint: ReactNode
  /** Controls shown to the right (wrapping underneath on narrow screens). */
  actions?: ReactNode
  className?: string
}

function viewFromEmoji(emoji: string | undefined): ViewId | undefined {
  if (!emoji) return undefined
  return (Object.keys(VIEW_INFO) as ViewId[]).find((v) => VIEW_INFO[v].emoji === emoji)
}

/** The title block every view starts with: the view's icon, its title in the display face, and a "how to read this" hint. */
export function ViewHeader({ view, emoji, title, hint, actions, className }: ViewHeaderProps) {
  const icon = view ?? viewFromEmoji(emoji)
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0 flex-[1_1_22rem]">
        {/* Focus moves here when the reader switches views (see RepoLayout), so screen readers announce the new view. */}
        <h1 tabIndex={-1} className="flex items-baseline gap-3 text-page-title text-ink outline-none">
          {icon && <ViewIcon view={icon} size={18} className="text-ink-3" />}
          <span className="min-w-0">{title}</span>
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">{hint}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
