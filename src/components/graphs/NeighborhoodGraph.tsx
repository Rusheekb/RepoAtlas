import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { LayerLegend } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { Icon, LayerDot } from '@/components/ui/icons'
import { YouAreHerePin } from '@/components/ui/YouAreHere'
import { formatBytes, formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import { basename, dirname } from '@/core/paths'
import { LAYERS, type AnalyzedFile } from '@/core/types'
import { useElementSize } from './hooks'

export interface NeighborhoodGraphProps {
  /** The focused file. */
  file: AnalyzedFile
  allFiles: Record<string, AnalyzedFile>
  onSelect?: (path: string) => void
  className?: string
  /** Chips per side before "+N more" (default 8). */
  maxPerSide?: number
}

/** Below this width the three columns stack vertically. */
const STACK_BELOW = 560

/** Most-used files first, then alphabetical. */
export function rankNeighbors(paths: readonly string[], allFiles: Record<string, AnalyzedFile>): string[] {
  const unique = [...new Set(paths)].filter((p) => p in allFiles)
  return unique.sort((a, b) => (allFiles[b].importedBy.length - allFiles[a].importedBy.length) || a.localeCompare(b))
}

interface Connector {
  key: string
  d: string
}

/** The layer key to draw, tolerating unexpected values. */
const layerOf = (file: AnalyzedFile) => (file.layer in LAYER_INFO ? file.layer : 'other')

function Chip({ file, onSelect, chipRef }: { file: AnalyzedFile; onSelect?: (path: string) => void; chipRef?: (el: HTMLElement | null) => void }) {
  const role = ROLE_INFO[file.role] ?? ROLE_INFO.other
  const body = (
    <>
      <LayerDot layer={layerOf(file)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{basename(file.path)}</span>
        <span className="block truncate text-meta">{dirname(file.path) || 'top level'}</span>
      </span>
    </>
  )
  const cls = 'flex w-full min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left'
  if (!onSelect) {
    return (
      <div ref={chipRef} className={cls} title={file.path}>
        {body}
      </div>
    )
  }
  return (
    <button
      ref={chipRef}
      type="button"
      className={cn(
        cls,
        'cursor-pointer hover:border-line-strong hover:bg-surface-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-atlas',
      )}
      title={`${file.path} — ${role.label}`}
      aria-label={`Open ${file.path} (${role.label})`}
      onClick={() => onSelect(file.path)}
    >
      {body}
    </button>
  )
}

function Side({
  title,
  subtitle,
  empty,
  paths,
  allFiles,
  max,
  onSelect,
  registerChip,
  footer,
}: {
  title: string
  subtitle: string
  empty: string
  paths: string[]
  allFiles: Record<string, AnalyzedFile>
  max: number
  onSelect?: (path: string) => void
  registerChip?: (path: string, el: HTMLElement | null) => void
  footer?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? paths : paths.slice(0, max)
  const hidden = paths.length - shown.length
  return (
    <section className="min-w-0" aria-label={title}>
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      <p className="mb-2 text-xs text-ink-3">{subtitle}</p>
      {paths.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p}>
              <Chip file={allFiles[p]} onSelect={onSelect} chipRef={registerChip ? (el) => registerChip(p, el) : undefined} />
            </li>
          ))}
          {(hidden > 0 || expanded) && paths.length > max && (
            <li>
              <button
                type="button"
                className="h-7 rounded-md px-2 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-atlas"
                aria-expanded={expanded}
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Show fewer' : `+${formatNumber(hidden)} more`}
              </button>
            </li>
          )}
        </ul>
      )}
      {footer}
    </section>
  )
}

/** Small "who uses this / what it uses" diagram: importers on the left → file in the middle → imports on the right (max ~8 each side, "+N more"). */
export function NeighborhoodGraph({ file, allFiles, onSelect, className, maxPerSide = 8 }: NeighborhoodGraphProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const importers = useMemo(() => rankNeighbors(file.importedBy, allFiles), [file.importedBy, allFiles])
  const imports = useMemo(() => rankNeighbors(file.imports, allFiles), [file.imports, allFiles])
  const stacked = size.width > 0 && size.width < STACK_BELOW
  const role = ROLE_INFO[file.role] ?? ROLE_INFO.other

  const centerRef = useRef<HTMLDivElement>(null)
  const leftChips = useRef(new Map<string, HTMLElement>())
  const rightChips = useRef(new Map<string, HTMLElement>())
  const [connectors, setConnectors] = useState<Connector[]>([])
  const markerId = `nb-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const registerLeft = useMemo(() => (path: string, el: HTMLElement | null) => {
    if (el) leftChips.current.set(path, el)
    else leftChips.current.delete(path)
  }, [])
  const registerRight = useMemo(() => (path: string, el: HTMLElement | null) => {
    if (el) rightChips.current.set(path, el)
    else rightChips.current.delete(path)
  }, [])

  // Draw curved connectors between chips and the center card from their measured positions. Runs after every
  // render (expanding a list moves things) but only updates state when the drawing actually changed.
  useLayoutEffect(() => {
    const root = containerRef.current
    const center = centerRef.current
    const out: Connector[] = []
    if (root && center && !stacked) {
      const rr = root.getBoundingClientRect()
      const cr = center.getBoundingClientRect()
      if (cr.width > 0) {
        const cy = cr.top - rr.top + cr.height / 2
        const r1 = (n: number) => Math.round(n * 10) / 10
        for (const [path, el] of leftChips.current) {
          const r = el.getBoundingClientRect()
          const x1 = r1(r.right - rr.left)
          const y1 = r1(r.top - rr.top + r.height / 2)
          const x2 = r1(cr.left - rr.left - 4)
          const mx = r1((x1 + x2) / 2)
          out.push({ key: `in:${path}`, d: `M${x1},${y1} C${mx},${y1} ${mx},${r1(cy)} ${x2},${r1(cy)}` })
        }
        for (const [path, el] of rightChips.current) {
          const r = el.getBoundingClientRect()
          const x1 = r1(cr.right - rr.left)
          const x2 = r1(r.left - rr.left - 4)
          const y2 = r1(r.top - rr.top + r.height / 2)
          const mx = r1((x1 + x2) / 2)
          out.push({ key: `out:${path}`, d: `M${x1},${r1(cy)} C${mx},${r1(cy)} ${mx},${y2} ${x2},${y2}` })
        }
      }
    }
    setConnectors((prev) =>
      prev.length === out.length && prev.every((c, i) => c.key === out[i].key && c.d === out[i].d) ? prev : out,
    )
  })

  const externals = file.externalImports
  const presentLayers = useMemo(() => {
    const set = new Set([file.layer, ...importers.map((p) => allFiles[p].layer), ...imports.map((p) => allFiles[p].layer)])
    return LAYERS.filter((l) => set.has(l))
  }, [file.layer, importers, imports, allFiles])

  const centerCard = (
    <div
      ref={centerRef}
      className="relative w-full min-w-0 rounded-xl border border-accent bg-surface px-4 py-3 shadow-sm ring-1 ring-accent"
      aria-label={`This file: ${file.path}`}
    >
      <YouAreHerePin size={20} className="pointer-events-none absolute -top-3.5 right-3" />
      <div className="flex items-center gap-2">
        <LayerDot layer={layerOf(file)} />
        <span className="min-w-0 truncate text-sm font-medium text-ink" title={file.path}>
          {file.name}
        </span>
      </div>
      <p className="mt-1 pl-4 text-[13px] text-ink-2">{role.label}</p>
      <p className="mt-0.5 pl-4 break-words text-meta">
        {file.lines != null ? `${formatNumber(file.lines)} lines` : file.size ? formatBytes(file.size) : 'Not downloaded'}
        {' · '}
        {dirname(file.path) || 'top level'}
      </p>
    </div>
  )

  const externalNote =
    externals.length > 0 ? (
      <p className="mt-2 text-xs leading-snug text-ink-3">
        Also uses {pluralize(externals.length, 'outside package')}: {externals.slice(0, 4).join(', ')}
        {externals.length > 4 ? ` +${externals.length - 4} more` : ''}
      </p>
    ) : null

  const left = (
    <Side
      title={`Used by ${pluralize(importers.length, 'file')}`}
      subtitle="These files rely on it"
      empty="No other file in the project uses this one directly"
      paths={importers}
      allFiles={allFiles}
      max={maxPerSide}
      onSelect={onSelect}
      registerChip={stacked ? undefined : registerLeft}
    />
  )
  const right = (
    <Side
      title={`Uses ${pluralize(imports.length, 'file')}`}
      subtitle="It relies on these"
      empty="It doesn’t use any other file in this project"
      paths={imports}
      allFiles={allFiles}
      max={maxPerSide}
      onSelect={onSelect}
      registerChip={stacked ? undefined : registerRight}
      footer={externalNote}
    />
  )

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', className)}
      data-testid="neighborhood-graph"
    >
      {stacked ? (
        <div className="flex flex-col gap-3">
          {left}
          <Icon as={ArrowDown} className="mx-auto text-ink-3" />
          {centerCard}
          <Icon as={ArrowDown} className="mx-auto text-ink-3" />
          {right}
        </div>
      ) : (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden focusable="false">
            <defs>
              <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,1 L10,5 L0,9 Z" style={{ fill: 'var(--edge)' }} />
              </marker>
            </defs>
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                fill="none"
                style={{ stroke: 'var(--edge)', strokeWidth: 1.5 }}
                markerEnd={`url(#${markerId})`}
              />
            ))}
          </svg>
          <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(160px,0.9fr)_minmax(0,1fr)] items-center gap-x-14">
            <div className="self-start">{left}</div>
            <div>{centerCard}</div>
            <div className="self-start">{right}</div>
          </div>
        </>
      )}
      {presentLayers.length >= 2 && <LayerLegend layers={presentLayers} className="mt-4" />}
    </div>
  )
}
