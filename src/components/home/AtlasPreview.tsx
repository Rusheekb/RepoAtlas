import type { CSSProperties } from 'react'
import { INLINE_CODE_CLASS } from '@/components/shell/bits'
import { cn } from '@/components/ui/cn'
import { LayerDot } from '@/components/ui/icons'
import { RouteLine, YouAreHerePin } from '@/components/ui/YouAreHere'
import type { Layer } from '@/core/types'

/*
 * The home page's "moment": a calm atlas sheet of pallets/flask's real map, drawn in static HTML + SVG (no React Flow
 * on the landing page). Each box is one part of the project, its dot the kind of code it holds; arrows point from a part
 * to the parts it uses. The "you are here" pin marks flask, and the dashed route leads to its plain-English note.
 *
 * Geometry: x and widths are in thousandths of the sheet's width (so it stretches), y and heights in px (fixed sheet
 * height), so edges drawn in a `0 0 1000 H` viewBox with preserveAspectRatio="none" meet the boxes exactly.
 */

interface Part {
  id: string
  name: string
  layer: Layer
  files: number
  x: number
  y: number
  w: number
}

interface Edge {
  from: [number, number]
  to: [number, number]
  /** Which way the arrowhead points at `to`. */
  dir: 'right' | 'left' | 'down'
}

interface Sheet {
  height: number
  shown: string
  parts: Part[]
  edges: Edge[]
  /** The pin's tip, on the top edge of the selected part. */
  pin: [number, number]
}

const BOX_H = 56
const SELECTED = 'flask'

const WIDE: Sheet = {
  height: 456,
  shown: '6 of 9 parts',
  parts: [
    { id: 'tests', name: 'tests', layer: 'test', files: 61, x: 24, y: 72, w: 272 },
    { id: 'examples', name: 'examples', layer: 'docs', files: 42, x: 24, y: 168, w: 272 },
    { id: 'flask', name: 'flask', layer: 'logic', files: 19, x: 364, y: 120, w: 272 },
    { id: 'sansio', name: 'sansio', layer: 'logic', files: 4, x: 704, y: 72, w: 272 },
    { id: 'json', name: 'json', layer: 'logic', files: 3, x: 704, y: 168, w: 272 },
    { id: 'docs', name: 'docs', layer: 'docs', files: 87, x: 24, y: 296, w: 272 },
  ],
  edges: [
    { from: [296, 100], to: [364, 140], dir: 'right' },
    { from: [296, 196], to: [364, 156], dir: 'right' },
    { from: [636, 140], to: [704, 100], dir: 'right' },
    { from: [636, 156], to: [704, 196], dir: 'right' },
    { from: [840, 128], to: [840, 168], dir: 'down' },
  ],
  pin: [500, 120],
}

const COMPACT: Sheet = {
  height: 268,
  shown: '3 of 9 parts',
  parts: [
    { id: 'tests', name: 'tests', layer: 'test', files: 61, x: 40, y: 56, w: 420 },
    { id: 'examples', name: 'examples', layer: 'docs', files: 42, x: 40, y: 136, w: 420 },
    { id: 'flask', name: 'flask', layer: 'logic', files: 19, x: 540, y: 96, w: 420 },
  ],
  edges: [
    { from: [460, 84], to: [540, 116], dir: 'right' },
    { from: [460, 164], to: [540, 132], dir: 'right' },
  ],
  pin: [750, 96],
}

const LEGEND: { layer: Layer; label: string }[] = [
  { layer: 'logic', label: 'Core logic' },
  { layer: 'test', label: 'Tests' },
  { layer: 'docs', label: 'Documentation' },
]

const pct = (thousandths: number) => `${thousandths / 10}%`

function edgePath({ from: [sx, sy], to: [tx, ty], dir }: Edge): string {
  if (dir === 'down') return `M${sx} ${sy}L${tx} ${ty}`
  const k = (tx - sx) / 2
  return `M${sx} ${sy}C${sx + k} ${sy} ${tx - k} ${ty} ${tx} ${ty}`
}

/** A closed, slightly uneven loop: one contour line. */
function contour(cx: number, cy: number, left: number, right: number, top: number, bottom: number): string {
  const k = 0.55
  return [
    `M${cx - left} ${cy}`,
    `C${cx - left} ${cy - top * k} ${cx - left * k} ${cy - top} ${cx} ${cy - top}`,
    `C${cx + right * k} ${cy - top} ${cx + right} ${cy - top * k} ${cx + right} ${cy}`,
    `C${cx + right} ${cy + bottom * k} ${cx + right * k} ${cy + bottom} ${cx} ${cy + bottom}`,
    `C${cx - left * k} ${cy + bottom} ${cx - left} ${cy + bottom * k} ${cx - left} ${cy}Z`,
  ].join('')
}

const CONTOURS = [contour(660, 262, 380, 290, 108, 78), contour(616, 274, 270, 236, 76, 60), contour(574, 290, 160, 150, 44, 38)]

function Arrowhead({ at: [x, y], dir }: { at: [number, number]; dir: Edge['dir'] }) {
  const style: CSSProperties = {
    left: pct(x),
    top: y,
    transform: dir === 'down' ? 'translate(-50%, -100%) rotate(90deg)' : dir === 'left' ? 'translate(0, -50%) rotate(180deg)' : 'translate(-100%, -50%)',
  }
  return (
    <svg width="7" height="8" viewBox="0 0 7 8" className="absolute" style={style}>
      <path d="M0 0 7 4 0 8Z" fill="var(--edge)" />
    </svg>
  )
}

function PartBox({ part }: { part: Part }) {
  const selected = part.id === SELECTED
  return (
    <div
      className={cn(
        'absolute flex h-14 flex-col justify-center rounded-lg border bg-surface px-3 shadow-sm dark:bg-surface-2',
        selected ? 'border-ink-3' : 'border-line-strong',
      )}
      style={{ left: pct(part.x), top: part.y, width: pct(part.w), height: BOX_H }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <LayerDot layer={part.layer} />
        <span className="truncate text-[13px] leading-5 font-medium text-ink">{part.name}</span>
      </span>
      <span className="pl-4 text-meta">{part.files} files</span>
    </div>
  )
}

function SheetMap({ sheet, className, routeTo }: { sheet: Sheet; className?: string; routeTo: number }) {
  const selected = sheet.parts.find((p) => p.id === SELECTED)!
  const [pinX, pinY] = sheet.pin
  const routeTop = selected.y + BOX_H + 6
  return (
    <div className={cn('relative', className)} style={{ height: sheet.height }}>
      <div className="absolute inset-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <svg className="absolute inset-0 size-full" viewBox={`0 0 1000 ${sheet.height}`} preserveAspectRatio="none">
          {CONTOURS.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {sheet.edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={edgePath(e)} fill="none" stroke="var(--edge)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {sheet.edges.map((e) => (
          <Arrowhead key={`${e.from}-${e.to}`} at={e.to} dir={e.dir} />
        ))}

        <p className="absolute top-4 left-5 font-mono text-xs leading-4 text-ink-2">pallets/flask</p>
        <p className="absolute top-4 right-5 text-meta">{sheet.shown}</p>

        {sheet.parts.map((p) => (
          <PartBox key={p.id} part={p} />
        ))}

        <ul className="absolute bottom-4 left-5 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 text-xs leading-4 text-ink-2 sm:max-w-none sm:flex-col">
          {LEGEND.map((l) => (
            <li key={l.layer} className="flex items-center gap-2">
              <LayerDot layer={l.layer} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      {/* The signature: the pin on the selected part, and the route from it to its note. */}
      <span className="absolute z-10" style={{ left: pct(pinX), top: pinY - 23, transform: 'translateX(-50%)' }}>
        <YouAreHerePin size={24} />
      </span>
      <span className="absolute z-10" style={{ left: pct(pinX), top: routeTop, height: routeTo - routeTop, transform: 'translateX(-50%)' }}>
        <RouteLine className="h-full" />
      </span>
    </div>
  )
}

function NoteCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface p-5 shadow-lg dark:border-line-strong dark:bg-surface-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] leading-5 font-medium text-ink">flask</p>
        <p className="text-meta">src/flask</p>
      </div>
      <p className="mt-1 flex items-center gap-2 text-[13px] leading-5 text-ink-2">
        <LayerDot layer="logic" />
        Core logic
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        Holds the project’s core logic, including <code className={INLINE_CODE_CLASS}>__init__.py</code> and{' '}
        <code className={INLINE_CODE_CLASS}>cli.py</code>. The tests and the examples both use it.
      </p>
      <p className="mt-3 text-meta">19 files · 6.3k lines · Python</p>
    </div>
  )
}

/** Decorative preview of a real RepoAtlas map (pallets/flask) for the home hero, with a text description for screen readers. */
export function AtlasPreview({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div aria-hidden>
        {/* Wide: six parts, the note overlapping the sheet's lower edge. */}
        <div className="relative hidden pb-6 sm:block">
          <SheetMap sheet={WIDE} routeTo={WIDE.height - 96} />
          <NoteCard className="absolute right-[2.4%] bottom-0 left-[36.4%] z-20" />
        </div>
        {/* Small screens: three parts, the note below the sheet. */}
        <div className="relative sm:hidden">
          <SheetMap sheet={COMPACT} routeTo={COMPACT.height + 12} />
          <NoteCard className="relative z-20 mt-3" />
        </div>
      </div>
      <p className="sr-only">
        A preview of the RepoAtlas map of Flask (pallets/flask), a Python web framework. It shows six of its nine parts: flask, sansio,
        json, tests, examples and docs, with arrows from each part to the parts it uses. The flask part is marked “you are here” and
        explained: it holds the project’s core logic, in 19 files and about 6.3k lines of Python.
      </p>
    </div>
  )
}
