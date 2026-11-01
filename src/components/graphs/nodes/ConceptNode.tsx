import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import type { Concept } from '@/core/types'
import { conceptCategoryInfo } from '../categories'
import { nodeVisual, useFlowHighlight } from '../flow/highlight'
import { HiddenHandles } from './common'

/** Card sizes per importance (1 = minor … 5 = central). */
const SIZES = [
  { width: 148, height: 50, bubble: 30, emoji: 'text-base', text: 'text-[12.5px]' },
  { width: 158, height: 54, bubble: 32, emoji: 'text-base', text: 'text-[13px]' },
  { width: 172, height: 58, bubble: 36, emoji: 'text-lg', text: 'text-[13.5px]' },
  { width: 190, height: 66, bubble: 42, emoji: 'text-xl', text: 'text-sm' },
  { width: 212, height: 74, bubble: 48, emoji: 'text-2xl', text: 'text-[15px]' },
] as const

export function importanceLevel(importance: number): number {
  if (!Number.isFinite(importance)) return 3
  return Math.min(5, Math.max(1, Math.round(importance)))
}

export function conceptNodeSize(importance: number): { width: number; height: number } {
  const s = SIZES[importanceLevel(importance) - 1]
  return { width: s.width, height: s.height }
}

export type ConceptNodeData = { concept: Concept }
export type ConceptFlowNode = Node<ConceptNodeData, 'concept'>

/** Concept card: emoji in a category-colored bubble + name; bigger and bolder the more central the idea is. */
export const ConceptNode = memo(function ConceptNode({ id, data }: NodeProps<ConceptFlowNode>) {
  const h = useFlowHighlight()
  const v = nodeVisual(h, id)
  const c = data.concept
  const level = importanceLevel(c.importance)
  const s = SIZES[level - 1]
  const cat = conceptCategoryInfo(c.category)
  return (
    <div
      className={cn(
        'atlas-node relative flex h-full w-full items-center gap-2.5 rounded-xl border bg-surface px-2.5 text-left shadow-sm motion-safe:transition-[opacity,box-shadow,border-color] motion-safe:duration-150',
        v.selected ? 'border-brand ring-2 ring-brand' : 'border-line hover:border-line-strong hover:shadow-md',
        v.dimmed && 'opacity-30',
      )}
    >
      <span
        className={cn('flex shrink-0 items-center justify-center rounded-full leading-none', s.emoji)}
        style={{
          width: s.bubble,
          height: s.bubble,
          background: `color-mix(in oklab, ${cat.color} 16%, var(--surface))`,
          boxShadow: `inset 0 0 0 2px ${cat.color}`,
        }}
        aria-hidden
      >
        {c.emoji || '💡'}
      </span>
      <span className={cn('line-clamp-2 min-w-0 flex-1 leading-tight text-ink', s.text, level >= 4 ? 'font-semibold' : 'font-medium')}>
        {c.name}
      </span>
      {v.seen && (
        <span className="shrink-0 text-good-text" title="You’ve read about this idea">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
          <span className="sr-only">Read</span>
        </span>
      )}
      <HiddenHandles />
    </div>
  )
})
