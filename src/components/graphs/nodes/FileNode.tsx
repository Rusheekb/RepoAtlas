import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import { dirname } from '@/core/paths'
import type { AnalyzedFile } from '@/core/types'
import { nodeVisual, useFlowHighlight } from '../flow/highlight'
import { HiddenHandles } from './common'

export const FILE_NODE_WIDTH = 212
export const FILE_NODE_HEIGHT = 56

export type FileNodeData = {
  file: AnalyzedFile
  /** Lives outside the files being shown (drawn faded with a dashed border). */
  neighbor: boolean
}
export type FileFlowNode = Node<FileNodeData, 'file'>

/** File card: layer strip, role emoji, file name, role label (or "Elsewhere: folder" for outside files). */
export const FileNode = memo(function FileNode({ id, data }: NodeProps<FileFlowNode>) {
  const h = useFlowHighlight()
  const v = nodeVisual(h, id)
  const f = data.file
  const role = ROLE_INFO[f.role] ?? ROLE_INFO.other
  const layer = LAYER_INFO[f.layer] ?? LAYER_INFO.other
  const dir = dirname(f.path)
  return (
    <div
      className={cn(
        'atlas-node relative flex h-full w-full overflow-hidden rounded-[10px] border bg-surface text-left motion-safe:transition-[opacity,box-shadow,border-color] motion-safe:duration-150',
        data.neighbor ? 'border-dashed border-line-strong bg-surface-2 shadow-none' : 'shadow-sm',
        v.selected ? 'border-brand ring-2 ring-brand' : !data.neighbor && 'border-line hover:border-line-strong hover:shadow-md',
        v.dimmed ? 'opacity-30' : data.neighbor && 'opacity-75',
      )}
    >
      <span className={cn('w-1 shrink-0', data.neighbor && 'opacity-60')} style={{ background: layer.color }} aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {f.isEntry ? ROLE_INFO.entry.emoji : role.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{f.name}</p>
          <p className="truncate text-[11px] text-ink-3">{data.neighbor ? `Elsewhere: ${dir || 'top level'}` : role.label}</p>
        </div>
        {v.seen && (
          <span className="shrink-0 text-good-text" title="You’ve read this file">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
            <span className="sr-only">Read</span>
          </span>
        )}
      </div>
      <HiddenHandles />
    </div>
  )
})
