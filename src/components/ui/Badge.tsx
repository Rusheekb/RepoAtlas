import type { HTMLAttributes } from 'react'
import { LAYER_INFO } from '@/core/labels'
import type { Layer } from '@/core/types'
import { cn } from './cn'

export function Badge({ className, tone = 'neutral', ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    brand: 'bg-surface-2 text-ink border-line',
    good: 'bg-surface-2 text-good-text border-line',
    warn: 'bg-surface-2 text-warn-text border-line',
    bad: 'bg-surface-2 text-bad-text border-line',
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}
      {...rest}
    />
  )
}

/** A colored dot + label for a layer. Identity is never color-alone: the label is always shown (or set as title). */
export function LayerBadge({ layer, compact, className }: { layer: Layer; compact?: boolean; className?: string }) {
  const info = LAYER_INFO[layer]
  return (
    <span
      title={compact ? info.label : info.description}
      className={cn('inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2', className)}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden />
      {compact ? info.short : info.label}
    </span>
  )
}

/** Legend for layer colors. Pass the layers actually shown. */
export function LayerLegend({ layers, className }: { layers: Layer[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2', className)} aria-label="Color legend">
      {layers.map((l) => (
        <li key={l} className="inline-flex items-center gap-1.5" title={LAYER_INFO[l].description}>
          <span className="size-2.5 rounded-full" style={{ background: LAYER_INFO[l].color }} aria-hidden />
          {LAYER_INFO[l].label}
        </li>
      ))}
    </ul>
  )
}
