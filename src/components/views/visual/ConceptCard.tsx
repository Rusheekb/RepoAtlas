import { Check } from 'lucide-react'
import { conceptCategoryInfo } from '@/components/graphs'
import { RichText } from '@/components/shell/bits'
import { cn } from '@/components/ui/cn'
import { pluralize } from '@/core/format'
import type { Concept } from '@/core/types'

/** Plain-English label for a concept's 1–5 importance. */
export function importanceLabel(importance: number): string {
  if (importance >= 5) return 'A central idea'
  if (importance >= 4) return 'A key idea'
  if (importance >= 3) return 'Worth knowing'
  if (importance >= 2) return 'Good to know'
  return 'A small detail'
}

export interface ConceptCardProps {
  concept: Concept
  selected?: boolean
  seen?: boolean
  onSelect: (concept: Concept) => void
}

/** A card for one key idea: emoji, name, category, one-line summary, how central it is and where it lives. */
export function ConceptCard({ concept: c, selected, seen, onSelect }: ConceptCardProps) {
  const cat = conceptCategoryInfo(c.category)
  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      aria-pressed={selected}
      className={cn(
        'group flex h-full w-full flex-col rounded-2xl border bg-surface p-4 text-left shadow-sm motion-safe:transition-[border-color,box-shadow]',
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-line-strong hover:shadow-md',
      )}
      data-testid="concept-card"
    >
      <span className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl leading-none"
          style={{ background: `color-mix(in oklab, ${cat.color} 18%, var(--surface))` }}
          aria-hidden
        >
          {c.emoji || '💡'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink group-hover:text-brand-text">{c.name}</span>
            {seen && (
              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-good-text" title="You’ve read about this idea">
                <Check className="size-2.5" strokeWidth={3} aria-hidden />
                <span className="sr-only">(read)</span>
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <span className="size-2 shrink-0 rounded-full" style={{ background: cat.color }} aria-hidden />
            {cat.label}
          </span>
        </span>
      </span>
      <RichText text={c.summary} className="mt-3 line-clamp-3 text-sm text-ink-2" />
      <span className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-3 text-[11px] font-medium text-ink-3">
        <span>{importanceLabel(c.importance)}</span>
        {c.files.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>Lives in {pluralize(c.files.length, 'file')}</span>
          </>
        )}
      </span>
    </button>
  )
}
