import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FolderOpen } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { LayerDot } from '@/components/ui/icons'
import { formatNumber } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import {
  defaultSortDirection,
  nameList,
  sortModuleRows,
  type ModuleRow,
  type ModuleSortKey,
  type SortDirection,
} from './architecture'

export interface ModuleTableProps {
  rows: ModuleRow[]
  selectedId?: string | null
  /** Module ids the reader already explored. */
  seenIds?: ReadonlySet<string>
  /** Learn about a part (opens the explanation). */
  onExplain: (id: string) => void
  /** See the files inside a part. */
  onOpen: (id: string) => void
  className?: string
}

interface Column {
  key: ModuleSortKey
  label: string
  numeric?: boolean
  className?: string
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Part' },
  { key: 'role', label: 'What it does', className: 'hidden md:table-cell' },
  { key: 'files', label: 'Files', numeric: true, className: 'hidden sm:table-cell' },
  { key: 'lines', label: 'Lines', numeric: true, className: 'hidden sm:table-cell' },
  { key: 'uses', label: 'Uses', numeric: true },
  { key: 'usedBy', label: 'Used by', numeric: true },
]

function Connections({ names, count }: { names: string[]; count: number }) {
  if (!count) return <span className="text-ink-3">—</span>
  return (
    <span className="inline-flex flex-col items-end">
      <span className="text-ink tabular-nums">{formatNumber(count)}</span>
      <span className="hidden max-w-56 truncate text-xs text-ink-3 lg:block" title={names.join(', ')}>
        {nameList(names, 2)}
      </span>
      <span className="sr-only lg:hidden">: {nameList(names, 6)}</span>
    </span>
  )
}

/**
 * The architecture as an accessible, sortable table: each part with its role, size, and which parts it uses and is
 * used by. Clicking a part's name explains it; the folder button shows the files inside.
 */
export function ModuleTable({ rows, selectedId, seenIds, onExplain, onOpen, className }: ModuleTableProps) {
  const [sort, setSort] = useState<{ key: ModuleSortKey; dir: SortDirection }>({ key: 'lines', dir: 'desc' })
  const sorted = useMemo(() => sortModuleRows(rows, sort.key, sort.dir), [rows, sort])

  const toggleSort = (key: ModuleSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultSortDirection(key) }))

  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm', className)} data-testid="module-table">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          The main parts of the project, what each one does, how big it is, and which other parts it uses or is used by.
          Use the column buttons to sort.
        </caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-xs text-ink-2">
            {COLUMNS.map((c) => {
              const active = sort.key === c.key
              const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('px-2 py-2 font-medium first:pl-3 sm:px-3', c.numeric ? 'text-right' : 'text-left', c.className)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded-md px-1 whitespace-nowrap transition-colors duration-150 ease-atlas hover:text-ink',
                      active && 'text-ink',
                      c.numeric && 'flex-row-reverse',
                    )}
                  >
                    {c.label}
                    <Icon className={cn('size-3.5', !active && 'opacity-50')} strokeWidth={1.5} aria-hidden />
                    <span className="sr-only">{active ? `, sorted ${sort.dir === 'asc' ? 'A to Z / smallest first' : 'Z to A / biggest first'}` : ', sort'}</span>
                  </button>
                </th>
              )
            })}
            <th scope="col" className="hidden w-12 px-3 py-2 pr-4 sm:table-cell">
              <span className="sr-only">Files inside</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-sm text-ink-2">
                No parts to list yet
              </td>
            </tr>
          )}
          {sorted.map(({ module: m, uses, usedBy }) => {
            const layer = LAYER_INFO[m.layer] ?? LAYER_INFO.other
            const selected = selectedId === m.id
            const seen = seenIds?.has(m.id) ?? false
            return (
              <tr
                key={m.id}
                className={cn(
                  'border-b border-line transition-colors duration-150 ease-atlas last:border-b-0',
                  selected ? 'bg-brand-soft' : 'hover:bg-surface-2',
                )}
                aria-current={selected ? 'true' : undefined}
              >
                <th
                  scope="row"
                  // The selected part: a surface step plus a thin survey-red mark on its leading edge.
                  className={cn('max-w-72 py-3 pr-3 pl-4 text-left font-normal', selected && 'shadow-[inset_2px_0_0_var(--accent)]')}
                >
                  <button type="button" onClick={() => onExplain(m.id)} className="group flex min-w-0 items-start gap-2 rounded-md text-left">
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                      <LayerDot layer={layer === LAYER_INFO.other ? 'other' : m.layer} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-ink decoration-line-strong underline-offset-2 group-hover:underline">{m.name}</span>
                        {seen && (
                          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-good-text" title="You’ve explored this part">
                            <Check className="size-2.5" strokeWidth={2.5} aria-hidden />
                            <span className="sr-only">(explored)</span>
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{layer.label}</span>
                      {m.role !== layer.label && <span className="mt-0.5 block text-xs text-ink-2 md:hidden">{m.role}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(m.id)}
                    className="mt-1 ml-6 inline-flex items-center gap-1 rounded-md text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline sm:hidden"
                  >
                    <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    See its {m.fileCount === 1 ? 'file' : `${formatNumber(m.fileCount)} files`}
                  </button>
                </th>
                <td className="hidden max-w-64 px-3 py-3 text-ink-2 md:table-cell">{m.role}</td>
                <td className="hidden px-3 py-3 text-right text-ink tabular-nums sm:table-cell">{formatNumber(m.fileCount)}</td>
                <td className="hidden px-3 py-3 text-right text-ink-2 tabular-nums sm:table-cell">{m.lines > 0 ? formatNumber(m.lines) : '—'}</td>
                <td className="px-2 py-3 text-right sm:px-3">
                  <Connections names={uses.map((u) => u.name)} count={uses.length} />
                </td>
                <td className="px-2 py-3 pr-4 text-right sm:px-3">
                  <Connections names={usedBy.map((u) => u.name)} count={usedBy.length} />
                </td>
                <td className="hidden py-1.5 pr-3 pl-1 text-right sm:table-cell">
                  <button
                    type="button"
                    aria-label={`See the files in ${m.name}`}
                    title="See the files inside"
                    onClick={() => onOpen(m.id)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-3 hover:text-ink"
                  >
                    <FolderOpen className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
