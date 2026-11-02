import { useMemo } from 'react'
import { cn } from '@/components/ui/cn'
import { formatNumber, formatPercent } from '@/core/format'
import type { Layer } from '@/core/types'
import { layerSegments } from './bars'
import { StackedBar } from './StackedBar'

export interface LayerBarProps {
  breakdown: Partial<Record<Layer, number>>
  className?: string
  showLegend?: boolean
  /** What the numbers count (default "lines"). */
  unit?: string
}

/** Horizontal stacked bar of lines-of-code per layer (fixed layer color order) + legend. */
export function LayerBar({ breakdown, className, showLegend = true, unit = 'lines' }: LayerBarProps) {
  const segments = useMemo(() => layerSegments(breakdown), [breakdown])
  const ariaLabel = segments.length
    ? `Kinds of code: ${segments.map((s) => `${s.label} ${formatPercent(s.percent)}`).join(', ')}`
    : 'No code measured yet'
  return (
    <div className={className} data-testid="layer-bar">
      <StackedBar
        segments={segments}
        ariaLabel={ariaLabel}
        emptyLabel="No code measured yet"
        shareLabel="of the code"
        showLegend={showLegend}
        formatValue={(s) => `${formatNumber(s.value)} ${unit}`}
      />
    </div>
  )
}

/** A tiny 4px layer bar for cards (decorative; the card's text carries the meaning). */
export function MiniLayerBar({ breakdown, className }: { breakdown: Partial<Record<Layer, number>>; className?: string }) {
  const segments = useMemo(() => layerSegments(breakdown), [breakdown])
  if (!segments.length) return <div className={cn('h-1 w-full rounded-full bg-surface-3', className)} aria-hidden />
  return (
    <div className={cn('flex h-1 w-full gap-0.5', className)} aria-hidden>
      {segments.map((s, i) => (
        <span
          key={s.key}
          className={cn('h-full min-w-0.5', i === 0 && 'rounded-l-full', i === segments.length - 1 && 'rounded-r-full')}
          style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
        />
      ))}
    </div>
  )
}
