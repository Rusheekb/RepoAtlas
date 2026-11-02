import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { ChevronRight, House } from 'lucide-react'
import { Button, EmptyState, LayerLegend } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { Icon, ViewIcon } from '@/components/ui/icons'
import { YouAreHerePin } from '@/components/ui/YouAreHere'
import { formatBytes, formatCompact, formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import { LAYERS, type AnalyzedFile, type LanguageStat, type Layer } from '@/core/types'
import { safeColor } from './bars'
import { GraphTooltip, type GraphTooltipHandle, type TooltipContent } from './GraphTooltip'
import { useElementSize } from './hooks'
import {
  buildTreemapTree,
  FOLDER_HEADER,
  fitLabel,
  focusOrder,
  folderTrail,
  layoutTreemap,
  normalizeFolder,
  linesMatchArea,
  parentFolder,
  tileSizeText,
  type TreemapDatum,
  type TreemapRect,
} from './treemapData'
import './graphs.css'

export interface CodeTreemapProps {
  files: AnalyzedFile[]
  colorBy: 'layer' | 'language'
  /** Folder currently zoomed into ('' = repo root). Controlled. */
  rootPath: string
  onRootChange: (path: string) => void
  selectedPath?: string | null
  onSelectFile?: (path: string) => void
  /** Size tiles by lines of code (default) or bytes (files without downloaded contents fall back to bytes/40). */
  sizeBy?: 'lines' | 'bytes'
  className?: string
  /** Language colors (e.g. RepoAnalysis.languages) used when colorBy = 'language'. */
  languages?: LanguageStat[]
  /** Extra / overriding language → hex color map. */
  languageColors?: Record<string, string>
  /** Show the color legend under the map (default true). */
  showLegend?: boolean
}

// % of the identity color mixed into the surface: strong enough that neighboring layers stay tellable apart, light
// enough that ink labels keep at least 5:1 contrast on every layer color in both themes.
const TILE_TINT = 65
const NEUTRAL = 'var(--layer-other)'

function tint(color: string): string {
  return `color-mix(in oklab, ${color} ${TILE_TINT}%, var(--surface))`
}

const SIZE_FORMAT = { compact: formatCompact, bytes: formatBytes }

/** Label type on the map: names in the interface sans, sizes in mono (average glyph widths for fitting). */
const NAME_FONT = { fontSize: 12, fontWeight: 500, charWidth: 6.6 }
const META_FONT = { fontFamily: 'var(--font-mono)', fontSize: 11, charWidth: 6.6 }
/** The "you are here" pin drawn in the selected tile's corner when the tile has room for it. */
const PIN = 16
const PIN_INSET = 4

function sizeText(d: TreemapDatum, sizeBy: 'lines' | 'bytes'): string {
  return tileSizeText(d, sizeBy, SIZE_FORMAT)
}

const CRUMB_BASE = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2'
const CRUMB_LINK = cn(
  CRUMB_BASE,
  'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-atlas',
)
const CRUMB_HERE = cn(CRUMB_BASE, 'font-medium text-ink')
/** Folder-name crumbs truncate, so they are blocks rather than flex boxes. */
const CRUMB_TEXT = 'block h-8 min-w-0 truncate rounded-md px-2 leading-8 font-medium'
const CRUMB_TEXT_LINK = cn(
  CRUMB_TEXT,
  'text-ink-2 hover:bg-surface-2 hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-atlas',
)

function itemLabel(d: TreemapDatum, sizeBy: 'lines' | 'bytes'): string {
  if (d.kind === 'file' && d.file) {
    const role = (ROLE_INFO[d.file.role] ?? ROLE_INFO.other).label
    return `${d.name}: ${role}, ${sizeText(d, sizeBy)}. Press Enter to open.`
  }
  const files = pluralize(d.fileCount, 'file')
  const size = sizeText(d, sizeBy)
  return `Folder ${d.name}: ${size === files ? files : `${files}, ${size}`}. Press Enter to zoom in.`
}

/**
 * Zoomable treemap ("city map") of the codebase: nested folders → file tiles sized by code amount and colored by layer
 * or language, with direct labels on tiles large enough, a breadcrumb for the zoomed folder, hover tooltip
 * (path, role, lines), click folder to zoom in, click file to select. SVG, responsive (ResizeObserver).
 */
export function CodeTreemap({
  files,
  colorBy,
  rootPath,
  onRootChange,
  selectedPath,
  onSelectFile,
  sizeBy = 'lines',
  className,
  languages,
  languageColors,
  showLegend = true,
}: CodeTreemapProps) {
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<GraphTooltipHandle>(null)
  const hoverIdx = useRef(-1)
  const pendingFocus = useRef(false)
  const helpId = useId()
  const root = normalizeFolder(rootPath)

  const tree = useMemo(() => buildTreemapTree(files, root, sizeBy), [files, root, sizeBy])
  const layout = useMemo(() => layoutTreemap(tree, size.width, size.height), [tree, size.width, size.height])
  const order = useMemo(() => focusOrder(layout), [layout])

  const colorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of languages ?? []) m.set(l.name, safeColor(l.color, NEUTRAL))
    for (const [name, c] of Object.entries(languageColors ?? {})) m.set(name, safeColor(c, NEUTRAL))
    return m
  }, [languages, languageColors])

  const colorOf = useCallback(
    (d: TreemapDatum): string =>
      colorBy === 'layer' ? (LAYER_INFO[d.layer] ?? LAYER_INFO.other).color : (d.language && colorMap.get(d.language)) || NEUTRAL,
    [colorBy, colorMap],
  )

  // Roving tab stop: one tile is tabbable; arrow keys move between tiles.
  const [rovingKey, setRovingKey] = useState<string | null>(null)
  const rovingIdx = useMemo(() => {
    const i = rovingKey == null ? -1 : order.findIndex((r) => r.datum.key === rovingKey)
    return i === -1 ? 0 : i
  }, [order, rovingKey])

  const selectedIdx = useMemo(() => {
    if (!selectedPath) return -1
    return order.findIndex(
      (r) =>
        (r.datum.kind === 'file' && r.datum.key === selectedPath) ||
        (r.datum.kind === 'aggregate' && selectedPath.startsWith(`${r.datum.key}/`)),
    )
  }, [order, selectedPath])

  const focusIdx = useCallback(
    (i: number) => {
      const el = svgRef.current?.querySelector<SVGElement>(`[data-idx="${i}"]`)
      const r = order[i]
      if (r) setRovingKey(r.datum.key)
      el?.focus()
    },
    [order],
  )

  useEffect(() => {
    if (pendingFocus.current && order.length) {
      pendingFocus.current = false
      focusIdx(0)
    }
  }, [order, focusIdx])

  const zoomTo = useCallback(
    (path: string, viaKeyboard: boolean) => {
      tipRef.current?.hide()
      hoverIdx.current = -1
      pendingFocus.current = viaKeyboard
      setRovingKey(null)
      onRootChange(path)
    },
    [onRootChange],
  )

  const activate = useCallback(
    (i: number, viaKeyboard: boolean) => {
      const r = order[i]
      if (!r) return
      if (r.datum.kind === 'file') onSelectFile?.(r.datum.key)
      else zoomTo(r.datum.key, viaKeyboard)
    },
    [order, onSelectFile, zoomTo],
  )

  const tooltipFor = useCallback(
    (d: TreemapDatum): TooltipContent => {
      if (d.kind === 'file' && d.file) {
        const f = d.file
        const role = ROLE_INFO[f.role] ?? ROLE_INFO.other
        const rows: TooltipContent['rows'] = [{ value: role.label }]
        if (f.lines != null) rows.push({ value: formatNumber(f.lines), label: f.lines === 1 ? 'line of code' : 'lines of code' })
        else rows.push({ value: formatBytes(f.size), label: 'in size (not downloaded)' })
        if (colorBy === 'layer') rows.push({ value: (LAYER_INFO[f.layer] ?? LAYER_INFO.other).label, color: colorOf(d) })
        else rows.push({ value: f.language ?? 'Not code', label: f.language ? 'language' : undefined, color: colorOf(d) })
        const summary = f.summary.length > 180 ? `${f.summary.slice(0, 177)}…` : f.summary
        return {
          title: d.name,
          subtitle: f.dir || 'Top level of the project',
          color: colorOf(d),
          rows,
          description: summary || role.description,
          hint: onSelectFile ? 'Click to open this file' : undefined,
        }
      }
      const mostly = colorBy === 'layer' ? (LAYER_INFO[d.layer] ?? LAYER_INFO.other).label : (d.language ?? 'Not code')
      return {
        title: `${d.name}/`,
        subtitle: d.key,
        color: colorOf(d),
        rows: [
          { value: pluralize(d.fileCount, 'file') },
          ...(linesMatchArea(d)
            ? [{ value: formatNumber(d.lines), label: d.lines === 1 ? 'line of code' : 'lines of code' }]
            : [
                { value: formatBytes(d.bytes), label: 'in size' },
                ...(d.lines > 0 ? [{ value: formatNumber(d.lines), label: 'lines in the files we read' }] : []),
              ]),
          { value: `Mostly ${mostly}`, color: colorOf(d) },
        ],
        hint: 'Click to zoom in',
      }
    },
    [colorBy, colorOf, onSelectFile],
  )

  const idxFrom = (target: EventTarget | null): number => {
    if (!(target instanceof Element)) return -1
    const el = target.closest('[data-idx]')
    return el ? Number(el.getAttribute('data-idx')) : -1
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = idxFrom(e.target)
    const at = { clientX: e.clientX, clientY: e.clientY }
    if (i === -1) {
      if (hoverIdx.current !== -1) tipRef.current?.hide()
      hoverIdx.current = -1
      return
    }
    if (i !== hoverIdx.current) {
      hoverIdx.current = i
      const r = order[i]
      if (r) tipRef.current?.show(tooltipFor(r.datum), at)
    } else {
      tipRef.current?.move(at)
    }
  }
  const onPointerLeave = () => {
    hoverIdx.current = -1
    tipRef.current?.hide()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Escape' || e.key === 'Backspace') && root) {
      e.preventDefault()
      zoomTo(parentFolder(root), true)
      return
    }
    const i = idxFrom(e.target)
    if (i === -1) return
    let next = -1
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = Math.min(order.length - 1, i + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = Math.max(0, i - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = order.length - 1
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(i, true)
        return
      default:
        return
    }
    e.preventDefault()
    focusIdx(next)
  }

  const onFocus = (e: FocusEvent<SVGSVGElement>) => {
    const i = idxFrom(e.target)
    const r = order[i]
    if (!r) return
    if (r.datum.key !== rovingKey) setRovingKey(r.datum.key)
    if (e.target instanceof Element) tipRef.current?.show(tooltipFor(r.datum), { rect: e.target.getBoundingClientRect() })
  }

  // The tiles themselves. Memoized so hovering (tooltip only) never re-renders thousands of rects.
  const tiles = useMemo(
    () =>
      order.map((r, i) => {
        const d = r.datum
        const w = r.x1 - r.x0
        const h = r.y1 - r.y0
        const folder = d.kind === 'folder'
        return (
          <rect
            key={d.kind + d.key}
            data-idx={i}
            className={cn('tm-item', folder ? 'tm-folder' : 'tm-tile', i === selectedIdx && 'tm-selected')}
            x={r.x0}
            y={r.y0}
            width={w}
            height={h}
            rx={folder ? 6 : Math.min(4, w / 2, h / 2)}
            style={folder ? undefined : { fill: tint(colorOf(d)) }}
            tabIndex={i === rovingIdx ? 0 : -1}
            role="button"
            aria-label={itemLabel(d, sizeBy)}
            aria-current={i === selectedIdx ? 'true' : undefined}
          />
        )
      }),
    [order, selectedIdx, rovingIdx, colorOf, sizeBy],
  )

  const pinned = selectedIdx === -1 ? null : order[selectedIdx]
  const pinFits = !!pinned && pinned.datum.kind !== 'folder' && pinned.x1 - pinned.x0 >= 40 && pinned.y1 - pinned.y0 >= 28

  const labels = useMemo(() => {
    const out: ReactElement[] = []
    const { charWidth: nameCw, ...nameStyle } = NAME_FONT
    const { charWidth: metaCw, ...metaStyle } = META_FONT
    const renderFolderHeader = (r: TreemapRect) => {
      const w = r.x1 - r.x0
      if (w < 32 || r.y1 - r.y0 < FOLDER_HEADER - 4) return
      const size = sizeText(r.datum, sizeBy)
      const sizeW = size.length * metaCw + 12
      const showSize = w > sizeW + 72
      const name = fitLabel(`${r.datum.name}/`, w - 16 - (showSize ? sizeW : 0), nameCw)
      if (!name) return
      out.push(
        <text key={`fh:${r.datum.key}`} x={r.x0 + 8} y={r.y0 + 14} className="tm-label" style={{ ...nameStyle, fill: 'var(--ink-2)' }}>
          {name}
        </text>,
      )
      if (showSize)
        out.push(
          <text key={`fs:${r.datum.key}`} x={r.x1 - 8} y={r.y0 + 14} textAnchor="end" className="tm-label" style={{ ...metaStyle, fill: 'var(--ink-3)' }}>
            {size}
          </text>,
        )
    }
    const renderLeaf = (r: TreemapRect) => {
      const w = r.x1 - r.x0
      const h = r.y1 - r.y0
      if (w < 36 || h < 18) return
      const d = r.datum
      // Leave room for the pin in the selected tile's corner.
      const room = w - 10 - (pinFits && r === pinned ? PIN + PIN_INSET : 0)
      const name = fitLabel(d.kind === 'aggregate' ? `${d.name}/` : d.name, room, nameCw)
      if (!name) return
      out.push(
        <text key={`ln:${d.kind}${d.key}`} x={r.x0 + 5} y={r.y0 + 14} className="tm-label" style={{ ...nameStyle, fill: 'var(--ink)' }}>
          {name}
        </text>,
      )
      if (h >= 34 && w >= 56) {
        const sub = fitLabel(d.kind === 'aggregate' ? pluralize(d.fileCount, 'file') : sizeText(d, sizeBy), w - 10, metaCw)
        if (sub)
          out.push(
            <text key={`ls:${d.kind}${d.key}`} x={r.x0 + 5} y={r.y0 + 28} className="tm-label" style={{ ...metaStyle, fill: 'var(--ink)' }}>
              {sub}
            </text>,
          )
      }
    }
    for (const r of order) (r.datum.kind === 'folder' ? renderFolderHeader : renderLeaf)(r)
    if (pinFits && pinned)
      out.push(
        <g key="pin" transform={`translate(${pinned.x1 - PIN - PIN_INSET},${pinned.y0 + PIN_INSET})`}>
          <YouAreHerePin size={PIN} className="pointer-events-none" />
        </g>,
      )
    return out
  }, [order, sizeBy, pinned, pinFits])

  const legend = useMemo(() => {
    if (!showLegend) return null
    const leaves = layout.leaves
    if (colorBy === 'layer') {
      const present = new Set<Layer>(leaves.map((r) => r.datum.layer))
      const layers = LAYERS.filter((l) => present.has(l))
      return layers.length >= 2 ? <LayerLegend layers={layers} /> : null
    }
    const weights = new Map<string, number>()
    for (const r of leaves) {
      const k = r.datum.language && colorMap.has(r.datum.language) ? r.datum.language : ''
      weights.set(k, (weights.get(k) ?? 0) + (r.datum.value || 0))
    }
    const named = [...weights.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1])
    const top = named.slice(0, 8)
    const hasOther = weights.has('') || named.length > top.length
    if (top.length + (hasOther ? 1 : 0) < 2) return null
    return (
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2" aria-label="Color legend">
        {top.map(([name]) => (
          <li key={name} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: colorMap.get(name) }} aria-hidden />
            {name}
          </li>
        ))}
        {hasOther && (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: NEUTRAL }} aria-hidden />
            Other / not code
          </li>
        )}
      </ul>
    )
  }, [showLegend, layout.leaves, colorBy, colorMap])

  const trail = folderTrail(root)
  const empty = !tree.children?.length

  return (
    <div className={cn('atlas-treemap flex h-full w-full min-w-0 flex-col gap-3', className)} data-testid="code-treemap">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <nav aria-label="Folder you are viewing" className="-ml-2 min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
            <li className="flex items-center">
              {root ? (
                <button type="button" className={CRUMB_LINK} onClick={() => zoomTo('', false)}>
                  <Icon as={House} className="text-ink-3" />
                  All files
                </button>
              ) : (
                <span className={CRUMB_HERE} aria-current="location">
                  <Icon as={House} className="text-ink-3" />
                  All files
                </span>
              )}
            </li>
            {trail.map((p, i) => {
              const name = p.slice(p.lastIndexOf('/') + 1)
              const last = i === trail.length - 1
              return (
                <li key={p} className="flex min-w-0 items-center">
                  <Icon as={ChevronRight} size={14} className="text-ink-3" />
                  {last ? (
                    <span className={cn(CRUMB_TEXT, 'text-ink')} aria-current="location">
                      {name}
                    </span>
                  ) : (
                    <button type="button" className={CRUMB_TEXT_LINK} onClick={() => zoomTo(p, false)}>
                      {name}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
        {!empty && (
          <p className="text-meta">
            {pluralize(tree.fileCount, 'file')} · {tree.lines > 0 ? `${formatNumber(tree.lines)} lines` : formatBytes(tree.bytes)}
          </p>
        )}
      </div>

      <div ref={boxRef} className="relative min-h-[280px] w-full min-w-0 flex-1 overflow-hidden rounded-xl" onKeyDown={onKeyDown}>
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line">
            <EmptyState
              icon={<ViewIcon view="codemap" size={20} />}
              title={root ? 'This folder has no files we can show' : 'No files to show yet'}
              actions={
                root ? (
                  <Button size="sm" onClick={() => zoomTo('', false)}>
                    Back to all files
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          size.width > 0 &&
          size.height > 0 && (
            <svg
              ref={svgRef}
              width={size.width}
              height={size.height}
              className="absolute inset-0 block"
              role="group"
              aria-label={`Map of the files in ${root || 'the whole project'}. Bigger tiles hold more code.`}
              aria-describedby={helpId}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
              onClick={(e) => {
                const i = idxFrom(e.target)
                if (i !== -1) activate(i, false)
              }}
              onFocus={onFocus}
              onBlur={() => tipRef.current?.hide()}
            >
              {tiles}
              <g aria-hidden>{labels}</g>
            </svg>
          )
        )}
        <p id={helpId} className="sr-only">
          Use the arrow keys to move between tiles, Enter to open a file or zoom into a folder, and Escape to go back up one
          folder.
        </p>
        <GraphTooltip ref={tipRef} containerRef={boxRef} />
      </div>
      {legend}
    </div>
  )
}
