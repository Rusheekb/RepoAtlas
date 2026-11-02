import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Icon, LayerDot } from '@/components/ui/icons'
import { YouAreHerePin } from '@/components/ui/YouAreHere'
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

/**
 * Architecture map card: thin layer strip, layer dot + name, plain-English role, size in mono, mini layer bar and a
 * quiet "explored" check. The selected card carries the survey-red ring and the "you are here" pin.
 */
export const ModuleNode = memo(function ModuleNode({ id, data }: NodeProps<ModuleFlowNode>) {
  const h = useFlowHighlight()
  const v = nodeVisual(h, id)
  const m = data.module
  const layerKey = m.layer in LAYER_INFO ? m.layer : 'other'
  const layer = LAYER_INFO[layerKey]
  return (
    <>
      <div
        className={cn(
          'atlas-node relative flex h-full w-full overflow-hidden rounded-xl border bg-surface text-left shadow-sm motion-safe:transition-[opacity,border-color] motion-safe:duration-150 motion-safe:ease-atlas',
          v.selected ? 'border-accent ring-1 ring-accent' : v.highlighted ? 'border-line-strong' : 'border-line hover:border-ink-3',
          v.dimmed && 'opacity-35',
        )}
      >
        <span className="w-1 shrink-0" style={{ background: layer.color }} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <LayerDot layer={layerKey} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{m.name}</span>
            {v.seen && (
              <span className="shrink-0 text-ink-3" title="You’ve explored this part">
                <Icon as={Check} size={14} />
                <span className="sr-only">Explored</span>
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[13px] text-ink-2">{m.role}</p>
          <p className="mt-0.5 truncate text-meta">{moduleSizeLabel(m)}</p>
          <MiniLayerBar breakdown={m.layerBreakdown} className="mt-auto" />
        </div>
        <HiddenHandles />
      </div>
      {v.selected && <YouAreHerePin size={20} className="pointer-events-none absolute -top-3.5 right-3" />}
    </>
  )
})
