import { Link } from 'react-router'
import { ArrowRight, Check, Route } from 'lucide-react'
import { RichText } from '@/components/shell/bits'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { pluralize } from '@/core/format'
import type { Tour } from '@/core/types'
import type { TourStatus } from './tours'

export interface TourCardProps {
  tour: Tour
  /** Where the card leads (the step to start or resume at). */
  to: string
  status: TourStatus
  seenSteps: number
  className?: string
}

const CTA: Record<TourStatus, string> = {
  new: 'Start the tour',
  started: 'Pick up where you left off',
  done: 'Take it again',
}

/** A tour in the list: a route mark, title, the question it answers, how long it is and how far the reader got. */
export function TourCard({ tour, to, status, seenSteps, className }: TourCardProps) {
  const total = tour.steps.length
  const pct = total ? Math.round((Math.min(seenSteps, total) / total) * 100) : 0
  const shown = status === 'done' ? 100 : pct
  const showQuestion = tour.question && tour.question.trim().toLowerCase() !== tour.title.trim().toLowerCase()
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors duration-150 ease-atlas hover:border-line-strong',
        className,
      )}
      data-testid="tour-card"
    >
      <span className="flex items-start gap-3">
        <Icon as={Route} size={18} className="mt-0.5 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-medium text-ink">{tour.title}</span>
          {showQuestion && <span className="mt-1 block text-sm text-ink-3">“{tour.question}”</span>}
        </span>
        {status === 'done' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-good-text">
            <Check className="size-3" strokeWidth={2} aria-hidden /> Finished
          </span>
        )}
      </span>
      {tour.summary && <RichText text={tour.summary} className="mt-3 line-clamp-2 text-sm text-ink-2" />}
      <span className="mt-auto block pt-5">
        <span className="flex items-center justify-between gap-3">
          <span className="text-meta">
            {pluralize(total, 'step')}
            {status === 'started' && ` · ${seenSteps} seen`}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-ink">
            {CTA[status]}
            <ArrowRight
              className="size-4 text-ink-2 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-atlas group-hover:translate-x-0.5"
              strokeWidth={1.5}
              aria-hidden
            />
          </span>
        </span>
        <span
          className="mt-3 block h-1 overflow-hidden rounded-xs bg-surface-3"
          role="progressbar"
          aria-label={`Progress through “${tour.title}”`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-valuetext={status === 'done' ? 'Finished' : `${Math.min(seenSteps, total)} of ${total} steps seen`}
        >
          <span className="block h-full rounded-xs bg-ink-3" style={{ width: `${shown}%` }} />
        </span>
      </span>
    </Link>
  )
}
