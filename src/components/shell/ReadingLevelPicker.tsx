import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Segmented } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { READING_LEVELS } from '@/core/labels'
import type { ReadingLevel } from '@/core/types'
import { useSettings } from '@/state/settings'

export const READING_LEVEL_ORDER: ReadingLevel[] = ['eli5', 'beginner', 'intermediate', 'expert']

/** Short labels that fit in the header. The full label and description are in each option's tooltip. */
export const COMPACT_LEVEL_LABELS: Record<ReadingLevel, string> = {
  eli5: 'New',
  beginner: 'Beginner',
  intermediate: 'Familiar',
  expert: 'Developer',
}

const GROUP_LABEL = 'How technical should explanations be?'

/**
 * Pick how technical explanations are. `segmented` = compact radio group for the header;
 * `select` = a native dropdown for narrow spaces (mobile drawer).
 */
export function ReadingLevelPicker({ variant = 'segmented', className }: { variant?: 'segmented' | 'select'; className?: string }) {
  const level = useSettings((s) => s.readingLevel)
  const set = useSettings((s) => s.set)
  const id = useId()

  if (variant === 'select') {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-xs font-medium text-ink-3">
          Explain things for
        </label>
        <div className="relative">
          <select
            id={id}
            value={level}
            onChange={(e) => set({ readingLevel: e.target.value as ReadingLevel })}
            className="h-10 w-full appearance-none rounded-xl border border-line-strong bg-surface pr-9 pl-3 text-sm text-ink"
          >
            {READING_LEVEL_ORDER.map((l) => (
              <option key={l} value={l}>
                {READING_LEVELS[l].label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        </div>
        <p className="text-xs text-ink-3">{READING_LEVELS[level].description}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs font-medium whitespace-nowrap text-ink-3" aria-hidden>
        Explain for
      </span>
      <Segmented<ReadingLevel>
        label={GROUP_LABEL}
        size="sm"
        value={level}
        onChange={(v) => set({ readingLevel: v })}
        options={READING_LEVEL_ORDER.map((l) => ({
          value: l,
          label: COMPACT_LEVEL_LABELS[l],
          title: `${READING_LEVELS[l].label}: ${READING_LEVELS[l].description}`,
        }))}
      />
    </div>
  )
}
