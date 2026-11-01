import { useMemo } from 'react'
import { formatPercent, pluralize } from '@/core/format'
import type { LanguageStat } from '@/core/types'
import { foldLanguages, OTHER_KEY } from './bars'
import { StackedBar } from './StackedBar'

export interface LanguageBarProps {
  languages: LanguageStat[]
  /** How many languages get their own segment before the rest fold into "Other" (default 6). */
  max?: number
  className?: string
  /** Show the legend list under the bar (default true). */
  showLegend?: boolean
}

/** Horizontal stacked bar of language share + legend list (top N, rest folded into "Other"). Hover tooltips. */
export function LanguageBar({ languages, max = 6, className, showLegend = true }: LanguageBarProps) {
  const segments = useMemo(() => foldLanguages(languages, max), [languages, max])
  const ariaLabel = segments.length
    ? `Languages used: ${segments.map((s) => `${s.label} ${formatPercent(s.percent)}`).join(', ')}`
    : 'No programming languages detected'
  return (
    <div className={className} data-testid="language-bar">
      <StackedBar
        segments={segments}
        ariaLabel={ariaLabel}
        emptyLabel="No programming languages detected"
        shareLabel="of the code"
        showLegend={showLegend}
        formatValue={(s) =>
          s.key === OTHER_KEY ? pluralize(s.description ? s.description.split(', ').length : 0, 'smaller language') : (s.description ?? '')
        }
      />
    </div>
  )
}
