import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FolderOpen } from 'lucide-react'
import { cn } from '@/components/ui/cn'
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
      <span className="font-medium text-ink tabular-nums">{formatNumber(count)}</span>
      <span className="hidden max-w-[14rem] truncate text-xs text-ink-3 lg:block" title={names.join(', ')}>
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
                  className={cn('px-2 py-2 font-semibold first:pl-4 sm:px-3', c.numeric ? 'text-right' : 'text-left', c.className)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1 py-0.5 whitespace-nowrap hover:text-ink',
                      active && 'text-ink',
                      c.numeric && 'flex-row-reverse',
                    )}
                  >
                    {c.label}
                    <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
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
                No parts to list yet.
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
                className={cn('border-b border-line last:border-b-0', selected ? 'bg-brand-soft' : 'hover:bg-surface-2')}
                aria-current={selected ? 'true' : undefined}
              >
                <th scope="row" className="max-w-[18rem] py-2.5 pr-3 pl-4 text-left font-normal">
                  <button type="button" onClick={() => onExplain(m.id)} className="group flex min-w-0 items-start gap-2.5 rounded-lg text-left">
                    <span className="mt-0.5 text-lg leading-none" aria-hidden>
                      {m.emoji || layer.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink group-hover:text-brand-text group-hover:underline">{m.name}</span>
                        {seen && (
                          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-good-text" title="You’ve explored this part">
                            <Check className="size-2.5" strokeWidth={3} aria-hidden />
                            <span className="sr-only">(explored)</span>
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: layer.color }} aria-hidden />
                        <span className="truncate">{layer.label}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-2 md:hidden">{m.role}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(m.id)}
                    className="mt-1 ml-7 inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-text hover:underline sm:hidden"
                  >
                    <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                    See its {m.fileCount === 1 ? 'file' : `${formatNumber(m.fileCount)} files`}
                  </button>
                </th>
                <td className="hidden max-w-[16rem] px-3 py-2.5 text-ink-2 md:table-cell">{m.role}</td>
                <td className="hidden px-3 py-2.5 text-right text-ink tabular-nums sm:table-cell">{formatNumber(m.fileCount)}</td>
                <td className="hidden px-3 py-2.5 text-right text-ink-2 tabular-nums sm:table-cell">{m.lines > 0 ? formatNumber(m.lines) : '—'}</td>
                <td className="px-2 py-2.5 text-right sm:px-3">
                  <Connections names={uses.map((u) => u.name)} count={uses.length} />
                </td>
                <td className="px-2 py-2.5 pr-4 text-right sm:px-3">
                  <Connections names={usedBy.map((u) => u.name)} count={usedBy.length} />
                </td>
                <td className="hidden py-1.5 pr-3 pl-1 text-right sm:table-cell">
                  <button
                    type="button"
                    aria-label={`See the files in ${m.name}`}
                    title="See the files inside"
                    onClick={() => onOpen(m.id)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink"
                  >
                    <FolderOpen className="size-4 shrink-0" aria-hidden />
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
