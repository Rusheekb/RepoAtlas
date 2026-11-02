import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { READING_LEVELS } from '@/core/labels'
import type { ReadingLevel } from '@/core/types'
import { useSettings } from '@/state/settings'
import { useHasClaudeKey } from './media'

export const READING_LEVEL_ORDER: ReadingLevel[] = ['eli5', 'beginner', 'intermediate', 'expert']

/** Short labels that fit in the header. The full label and description are in each option's tooltip. */
export const COMPACT_LEVEL_LABELS: Record<ReadingLevel, string> = {
  eli5: 'New',
  beginner: 'Beginner',
  intermediate: 'Familiar',
  expert: 'Developer',
}

const GROUP_LABEL = 'How technical should Claude’s explanations be?'
/** The level only changes what Claude writes; the built-in explanations are the same for everyone. */
export const NO_KEY_LEVEL_HINT = 'This only changes Claude’s answers. Add a Claude key in Settings to use it.'

/**
 * Pick how technical Claude's explanations are. `segmented` = compact radio group for the header;
 * `select` = a native dropdown for narrow spaces (mobile drawer).
 */
export function ReadingLevelPicker({ variant = 'segmented', className }: { variant?: 'segmented' | 'select'; className?: string }) {
  const level = useSettings((s) => s.readingLevel)
  const set = useSettings((s) => s.set)
  const hasKey = useHasClaudeKey()
  const id = useId()
  const hintId = `${id}-hint`

  if (variant === 'select') {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-xs text-ink-3">
          Claude explains things for
        </label>
        <div className="relative">
          <select
            id={id}
            value={level}
            aria-describedby={hintId}
            onChange={(e) => set({ readingLevel: e.target.value as ReadingLevel })}
            className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface pr-9 pl-3 text-sm text-ink"
          >
            {READING_LEVEL_ORDER.map((l) => (
              <option key={l} value={l}>
                {READING_LEVELS[l].label}
              </option>
            ))}
          </select>
          <Icon as={ChevronDown} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
        </div>
        <p id={hintId} className="text-xs text-ink-3">
          {READING_LEVELS[level].description}
          {!hasKey && ` ${NO_KEY_LEVEL_HINT}`}
        </p>
      </div>
    )
  }

  const note = hasKey ? '' : ` ${NO_KEY_LEVEL_HINT}`
  return (
    <div className={cn('flex items-center gap-2', className)} title={hasKey ? undefined : NO_KEY_LEVEL_HINT}>
      <span className="text-xs whitespace-nowrap text-ink-3" aria-hidden>
        Claude explains for:
      </span>
      <Segmented<ReadingLevel>
        label={GROUP_LABEL}
        describedBy={hasKey ? undefined : hintId}
        size="sm"
        value={level}
        onChange={(v) => set({ readingLevel: v })}
        options={READING_LEVEL_ORDER.map((l) => ({
          value: l,
          label: COMPACT_LEVEL_LABELS[l],
          title: `${READING_LEVELS[l].label}: ${READING_LEVELS[l].description}${note}`,
        }))}
      />
      {!hasKey && (
        <span id={hintId} className="sr-only">
          {NO_KEY_LEVEL_HINT}
        </span>
      )}
    </div>
  )
}
