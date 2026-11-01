import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Info } from 'lucide-react'
import { FileGraph } from '@/components/graphs'
import { Button, Segmented } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { pluralize } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import type { AnalyzedFile, FileEdge, ModuleInfo } from '@/core/types'
import { moduleFiles, outsideNeighborCount } from './architecture'

/** Outside connections show straight away only while the picture stays small enough to read. */
export const NEIGHBORS_BY_DEFAULT = { maxFiles: 12, maxOutside: 8 }

export interface ModuleDrillDownProps {
  module: ModuleInfo
  files: Record<string, AnalyzedFile>
  fileEdges: FileEdge[]
  direction: 'LR' | 'TB'
  selectedPath: string | null
  seenPaths: string[]
  onBack: () => void
  onExplainModule: () => void
  onSelectFile: (path: string | null) => void
  onOpenFile: (path: string) => void
  className?: string
}

/** One part of the project, opened up: a breadcrumb back to all parts and a map of the files inside and what they use. */
export function ModuleDrillDown({
  module,
  files,
  fileEdges,
  direction,
  selectedPath,
  seenPaths,
  onBack,
  onExplainModule,
  onSelectFile,
  onOpenFile,
  className,
}: ModuleDrillDownProps) {
  const list = useMemo(() => moduleFiles(module, files), [module, files])
  const layer = LAYER_INFO[module.layer] ?? LAYER_INFO.other
  // Outside files help in small parts; in big ones they crowd the picture, so they start hidden there.
  const [neighborChoice, setNeighborChoice] = useState<'inside' | 'around' | null>(null)
  const outside = useMemo(() => outsideNeighborCount(list, files), [list, files])
  const smallEnough = list.length <= NEIGHBORS_BY_DEFAULT.maxFiles && outside <= NEIGHBORS_BY_DEFAULT.maxOutside
  const neighbors = neighborChoice ?? (smallEnough ? 'around' : 'inside')
  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav aria-label="Where you are" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <li>
              <button type="button" onClick={onBack} className="rounded-md px-1.5 py-0.5 font-medium text-brand-text hover:bg-brand-soft">
                All parts
              </button>
            </li>
            <li className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="flex min-w-0 items-center gap-1.5 px-1 font-semibold text-ink" aria-current="location">
                <span aria-hidden>{module.emoji || layer.emoji}</span>
                <span className="truncate">{module.name}</span>
              </span>
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onExplainModule} icon={<Info className="size-4" aria-hidden />}>
            What is this part?
          </Button>
          <Button size="sm" variant="secondary" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back to all parts
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">{module.role}.</span> {pluralize(module.fileCount, 'file')}
        {module.path ? (
          <>
            {' '}
            in <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-ink">{module.path}/</code>
          </>
        ) : (
          ' at the top level of the project'
        )}
        . Each card is a file; arrows point from a file to the file it uses. Click a file to learn about it, double-click to read it.
      </p>
      <Segmented<'inside' | 'around'>
        className="self-start"
        label="Which files to show"
        size="sm"
        value={neighbors}
        onChange={setNeighborChoice}
        options={[
          { value: 'inside', label: 'Only this part', title: 'Show just the files inside this part' },
          {
            value: 'around',
            label: outside ? `Plus ${outside} connected file${outside === 1 ? '' : 's'}` : 'Plus connected files',
            title: 'Also show files from other parts that use, or are used by, these files',
          },
        ]}
      />
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <FileGraph
          files={list}
          edges={fileEdges}
          allFiles={files}
          showNeighbors={neighbors === 'around'}
          direction={direction}
          selectedPath={selectedPath}
          seenPaths={seenPaths}
          onSelect={onSelectFile}
          onOpen={onOpenFile}
        />
      </div>
    </div>
  )
}
