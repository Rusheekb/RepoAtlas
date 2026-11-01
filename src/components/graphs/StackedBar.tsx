import { useRef } from 'react'
import { cn } from '@/components/ui/cn'
import { formatPercent } from '@/core/format'
import type { BarSegment } from './bars'
import { GraphTooltip, type GraphTooltipHandle } from './GraphTooltip'

export interface StackedBarProps {
  segments: BarSegment[]
  /** e.g. (s) => "1,204 lines" */
  formatValue: (s: BarSegment) => string
  /** Text after the percentage in the tooltip, e.g. "of the code". */
  shareLabel?: string
  ariaLabel: string
  emptyLabel: string
  /** Bar thickness in px (the hover target is taller). */
  thickness?: number
  showLegend?: boolean
  className?: string
}

/**
 * A thin segmented bar (one whole split into parts): 2px surface gaps between parts, 4px rounded ends,
 * a tall invisible hover target per part, one shared tooltip and a legend with names and shares.
 */
export function StackedBar({
  segments,
  formatValue,
  shareLabel = 'of the total',
  ariaLabel,
  emptyLabel,
  thickness = 12,
  showLegend = true,
  className,
}: StackedBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<GraphTooltipHandle>(null)

  if (!segments.length) {
    return (
      <div className={cn('w-full', className)}>
        <div className="w-full rounded-[4px] bg-surface-3" style={{ height: thickness }} role="img" aria-label={emptyLabel} />
        {showLegend && <p className="mt-2 text-xs text-ink-3">{emptyLabel}</p>}
      </div>
    )
  }

  const last = segments.length - 1
  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div role="img" aria-label={ariaLabel} className="flex w-full gap-[2px]" onPointerLeave={() => tipRef.current?.hide()}>
        {segments.map((s, i) => (
          <div
            key={s.key}
            className="group flex min-w-[3px] cursor-default items-center py-1.5"
            style={{ flexGrow: s.value, flexBasis: 0 }}
            onPointerEnter={(e) => {
              const value = formatValue(s)
              tipRef.current?.show(
                {
                  title: s.label,
                  color: s.color,
                  rows: [{ value: formatPercent(s.percent), label: shareLabel }, ...(value ? [{ value }] : [])],
                  description: s.description && s.description !== value ? s.description : undefined,
                },
                { clientX: e.clientX, clientY: e.clientY },
              )
            }}
            onPointerMove={(e) => tipRef.current?.move({ clientX: e.clientX, clientY: e.clientY })}
          >
            <div
              className={cn(
                'w-full motion-safe:transition-[filter] group-hover:brightness-110 dark:group-hover:brightness-125',
                i === 0 && 'rounded-l-[4px]',
                i === last && 'rounded-r-[4px]',
              )}
              style={{ height: thickness, background: s.color }}
            />
          </div>
        ))}
      </div>
      {showLegend && (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Legend">
          {segments.map((s) => (
            <li key={s.key} className="inline-flex min-w-0 items-center gap-1.5" title={s.description}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="truncate text-ink-2">{s.label}</span>
              <span className="text-ink-3 tabular-nums">{formatPercent(s.percent)}</span>
            </li>
          ))}
        </ul>
      )}
      <GraphTooltip ref={tipRef} containerRef={containerRef} placement="above" />
    </div>
  )
}
