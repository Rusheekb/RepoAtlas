import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { ConceptIcon, Icon } from '@/components/ui/icons'
import { YouAreHerePin } from '@/components/ui/YouAreHere'
import { stripEmoji } from '@/components/shell/text'
import type { Concept } from '@/core/types'
import { conceptCategoryInfo } from '../categories'
import { nodeVisual, useFlowHighlight } from '../flow/highlight'
import { HiddenHandles } from './common'

/** Card sizes per importance (1 = minor … 5 = central), on the 4px grid. */
const SIZES = [
  { width: 148, height: 48, box: 28, icon: 16, text: 'text-[13px]' },
  { width: 160, height: 52, box: 28, icon: 16, text: 'text-[13px]' },
  { width: 172, height: 56, box: 32, icon: 16, text: 'text-sm' },
  { width: 192, height: 64, box: 36, icon: 18, text: 'text-[15px]' },
  { width: 212, height: 72, box: 40, icon: 20, text: 'text-base' },
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

/**
 * Concept card: a line icon for the kind of idea with its category dot, then the name. The more central the idea, the
 * bigger the card and its type (hierarchy from size, not weight). The selected card carries the "you are here" pin.
 */
export const ConceptNode = memo(function ConceptNode({ id, data }: NodeProps<ConceptFlowNode>) {
  const h = useFlowHighlight()
  const v = nodeVisual(h, id)
  const c = data.concept
  const s = SIZES[importanceLevel(c.importance) - 1]
  const cat = conceptCategoryInfo(c.category)
  return (
    <>
      <div
        className={cn(
          'atlas-node relative flex h-full w-full items-center gap-2.5 rounded-xl border bg-surface px-2.5 text-left shadow-sm motion-safe:transition-[opacity,border-color] motion-safe:duration-150 motion-safe:ease-atlas',
          v.selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-ink-3',
          v.dimmed && 'opacity-30',
        )}
      >
        <span
          className="relative flex shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2"
          style={{ width: s.box, height: s.box }}
          aria-hidden
        >
          <ConceptIcon category={c.category} size={s.icon} />
          <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface" style={{ background: cat.color }} />
        </span>
        <span className={cn('line-clamp-2 min-w-0 flex-1 leading-tight font-medium text-ink', s.text)}>{stripEmoji(c.name).trim() || c.name}</span>
        {v.seen && (
          <span className="shrink-0 text-ink-3" title="You’ve read about this idea">
            <Icon as={Check} size={14} />
            <span className="sr-only">Read</span>
          </span>
        )}
        <HiddenHandles />
      </div>
      {v.selected && <YouAreHerePin size={20} className="pointer-events-none absolute -top-3.5 right-3" />}
    </>
  )
})
