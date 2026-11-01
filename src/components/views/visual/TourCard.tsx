import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'
import { RichText } from '@/components/shell/bits'
import { cn } from '@/components/ui/cn'
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

/** A tour in the list: emoji, title, the question it answers, how long it is and how far the reader got. */
export function TourCard({ tour, to, status, seenSteps, className }: TourCardProps) {
  const total = tour.steps.length
  const pct = total ? Math.round((Math.min(seenSteps, total) / total) * 100) : 0
  const showQuestion = tour.question && tour.question.trim().toLowerCase() !== tour.title.trim().toLowerCase()
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm motion-safe:transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md',
        className,
      )}
      data-testid="tour-card"
    >
      <span className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl leading-none" aria-hidden>
          {tour.emoji || '🧭'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-semibold text-ink group-hover:text-brand-text">{tour.title}</span>
          {showQuestion && <span className="mt-0.5 block text-sm text-ink-2 italic">“{tour.question}”</span>}
        </span>
        {status === 'done' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-good-text">
            <Check className="size-3" strokeWidth={3} aria-hidden /> Finished
          </span>
        )}
      </span>
      {tour.summary && <RichText text={tour.summary} className="mt-3 line-clamp-2 text-sm text-ink-2" />}
      <span className="mt-auto block pt-4">
        <span className="flex items-center justify-between gap-3 text-xs text-ink-3">
          <span>
            {pluralize(total, 'step')}
            {status === 'started' && ` · ${seenSteps} seen`}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-brand-text">
            {CTA[status]}
            <ArrowRight className="size-3.5 motion-safe:transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
        <span
          className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label={`Progress through “${tour.title}”`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status === 'done' ? 100 : pct}
          aria-valuetext={status === 'done' ? 'Finished' : `${Math.min(seenSteps, total)} of ${total} steps seen`}
        >
          <span className="block h-full rounded-full bg-brand" style={{ width: `${status === 'done' ? 100 : pct}%` }} />
        </span>
      </span>
    </Link>
  )
}
