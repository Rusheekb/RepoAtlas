import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Info } from 'lucide-react'
import { buildFileGraphLayout, FileGraph } from '@/components/graphs'
import { FILE_GRAPH_CAP } from '@/components/graphs/fileGraphData'
import { useElementSize } from '@/components/graphs/hooks'
import { Button, Segmented } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { LayerDot } from '@/components/ui/icons'
import { formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import type { AnalyzedFile, FileEdge, ModuleInfo } from '@/core/types'
import { betterDirection, moduleFiles, outsideNeighborCount } from './architecture'

/** Outside connections show straight away only while the picture stays small enough to read. */
export const NEIGHBORS_BY_DEFAULT = { maxFiles: 12, maxOutside: 8 }
/** Big parts start with their best-connected files only; the rest are one click away. */
export const DRILL_DOWN_CAP = 40

type Direction = 'LR' | 'TB'

export interface ModuleDrillDownProps {
  module: ModuleInfo
  files: Record<string, AnalyzedFile>
  fileEdges: FileEdge[]
  /** Which way arrows flow; null picks whichever lets the map be drawn biggest in the space available. */
  direction: Direction | null
  /** When given, the drill-down shows its own "which way the arrows flow" toggle. */
  onDirectionChange?: (direction: Direction) => void
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
  direction: directionChoice,
  onDirectionChange,
  selectedPath,
  seenPaths,
  onBack,
  onExplainModule,
  onSelectFile,
  onOpenFile,
  className,
}: ModuleDrillDownProps) {
  const list = useMemo(() => moduleFiles(module, files), [module, files])
  const layerId = LAYER_INFO[module.layer] ? module.layer : 'other'
  // Outside files help in small parts; in big ones they crowd the picture, so they start hidden there.
  const [neighborChoice, setNeighborChoice] = useState<'inside' | 'around' | null>(null)
  const outside = useMemo(() => outsideNeighborCount(list, files), [list, files])
  const smallEnough = list.length <= NEIGHBORS_BY_DEFAULT.maxFiles && outside <= NEIGHBORS_BY_DEFAULT.maxOutside
  const neighbors = neighborChoice ?? (smallEnough ? 'around' : 'inside')
  const [showEverything, setShowEverything] = useState(false)
  const cap = showEverything ? undefined : DRILL_DOWN_CAP
  const hiddenCount = cap ? Math.max(0, list.length - cap) : 0
  const [boxRef, box] = useElementSize<HTMLDivElement>()
  // Coarse canvas shape: re-pick the direction when the space changes shape, not on every pixel.
  const shapeW = box.width > 0 && box.height > 0 ? Math.max(40, Math.round(box.width / 40) * 40) : 0
  const shapeH = box.width > 0 && box.height > 0 ? Math.max(40, Math.round(box.height / 40) * 40) : 0
  const aspect = shapeW && shapeH ? shapeW / shapeH : undefined
  const autoDirection = useMemo<Direction>(() => {
    if (!shapeW || !shapeH) return 'LR'
    const opts = { allFiles: files, showNeighbors: neighbors === 'around', maxNodes: cap, aspect: shapeW / shapeH }
    const sizeOf = (d: Direction) => buildFileGraphLayout(list, fileEdges, { ...opts, direction: d }).layout
    return betterDirection({ width: shapeW, height: shapeH }, sizeOf, shapeW >= 640 ? 'LR' : 'TB')
  }, [shapeW, shapeH, list, fileEdges, files, neighbors, cap])
  const direction = directionChoice ?? autoDirection
  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav aria-label="Where you are" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <li>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-7 items-center rounded-md px-2 text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
              >
                All parts
              </button>
            </li>
            <li className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
              <span className="flex min-w-0 items-center gap-2 px-1 font-medium text-ink" aria-current="location">
                <LayerDot layer={layerId} />
                <span className="truncate">{module.name}</span>
              </span>
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onExplainModule} icon={<Info className="size-4" strokeWidth={1.5} aria-hidden />}>
            What is this part?
          </Button>
          <Button size="sm" variant="secondary" onClick={onBack} icon={<ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />}>
            Back to all parts
          </Button>
        </div>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-ink-2">
        <span className="font-medium text-ink">{module.role}.</span> {pluralize(module.fileCount, 'file')}
        {module.path ? (
          <>
            {' '}
            in <code className="rounded border border-line bg-surface-2 px-1 font-mono text-[13px] text-ink">{module.path}/</code>
          </>
        ) : (
          ' at the top level of the project'
        )}
        . Each card is a file; arrows point from a file to the file it uses. Click a file to learn about it, double-click to read it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'inside' | 'around'>
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
        {onDirectionChange && (
          <Segmented<Direction>
            label="Which way the arrows flow"
            size="sm"
            value={direction}
            onChange={onDirectionChange}
            options={[
              { value: 'LR', label: 'Sideways', title: 'Arrows flow from left to right' },
              { value: 'TB', label: 'Top-down', title: 'Arrows flow from top to bottom' },
            ]}
          />
        )}
        {(hiddenCount > 0 || showEverything) && list.length > DRILL_DOWN_CAP && (
          <Button size="sm" variant="ghost" onClick={() => setShowEverything((v) => !v)} aria-pressed={showEverything}>
            {showEverything
              ? `Just the ${DRILL_DOWN_CAP} best-connected files`
              : list.length <= FILE_GRAPH_CAP
                ? `Show all ${formatNumber(list.length)} files`
                : `Show the ${FILE_GRAPH_CAP} best-connected files`}
          </Button>
        )}
      </div>
      <div ref={boxRef} className="relative min-h-90 flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
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
          maxNodes={cap}
          aspect={aspect}
        />
      </div>
    </div>
  )
}
