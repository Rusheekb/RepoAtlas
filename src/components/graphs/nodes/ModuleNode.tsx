import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { formatBytes, formatCompact, pluralize } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import type { ModuleInfo } from '@/core/types'
import { nodeVisual, useFlowHighlight } from '../flow/highlight'
import { MiniLayerBar } from '../LayerBar'
import { HiddenHandles } from './common'

export const MODULE_NODE_WIDTH = 236
export const MODULE_NODE_HEIGHT = 104

export type ModuleNodeData = { module: ModuleInfo }
export type ModuleFlowNode = Node<ModuleNodeData, 'module'>

/** "12 files · 1.2k lines" (falls back to size when no contents were downloaded). */
export function moduleSizeLabel(m: Pick<ModuleInfo, 'fileCount' | 'lines' | 'bytes'>): string {
  const files = pluralize(m.fileCount, 'file')
  if (m.lines > 0) return `${files} · ${formatCompact(m.lines)} lines`
  if (m.bytes > 0) return `${files} · ${formatBytes(m.bytes)}`
  return files
}

/** Architecture map card: layer strip, emoji + name, plain-English role, size, mini layer bar, "explored" check. */
export const ModuleNode = memo(function ModuleNode({ id, data }: NodeProps<ModuleFlowNode>) {
  const h = useFlowHighlight()
  const v = nodeVisual(h, id)
  const m = data.module
  const layer = LAYER_INFO[m.layer] ?? LAYER_INFO.other
  return (
    <div
      className={cn(
        'atlas-node relative flex h-full w-full overflow-hidden rounded-xl border bg-surface text-left shadow-sm motion-safe:transition-[opacity,box-shadow,border-color] motion-safe:duration-150',
        v.selected ? 'border-brand ring-2 ring-brand' : v.highlighted ? 'border-brand' : 'border-line hover:border-line-strong hover:shadow-md',
        v.dimmed && 'opacity-35',
      )}
    >
      <span className="w-1.5 shrink-0" style={{ background: layer.color }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col px-3 pt-2.5 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg leading-none" aria-hidden>
            {m.emoji || layer.emoji}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.name}</span>
          {v.seen && (
            <span
              className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-good-text"
              title="You’ve explored this part"
            >
              <Check className="size-3" strokeWidth={3} aria-hidden />
              <span className="sr-only">Explored</span>
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-ink-2">{m.role}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-3">{moduleSizeLabel(m)}</p>
        <MiniLayerBar breakdown={m.layerBreakdown} className="mt-auto" />
      </div>
      <HiddenHandles />
    </div>
  )
})
