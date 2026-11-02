import { useMemo } from 'react'
import { cn } from '@/components/ui/cn'
import { LayerDot } from '@/components/ui/icons'
import { stripEmoji } from '@/components/shell/text'
import type { TechItem } from '@/core/types'
import { groupTechByRow, techHint } from './categories'

export interface TechStackDiagramProps {
  tech: TechItem[]
  onSelect?: (id: string) => void
  className?: string
  /** Highlight one chip (e.g. the tech currently explained). */
  selectedId?: string | null
}

const IMPORTANCE_LABEL: Record<TechItem['importance'], string> = {
  core: 'a main ingredient',
  supporting: 'a helper',
  tooling: 'a developer tool',
}

/**
 * "Layer cake" of the tech stack: rows for What you see (frontend/styling/mobile/desktop) → The engine (backend/api/language)
 * → Where data lives (database) → Tools behind the scenes (build/testing/quality/ci/infra/cloud) — each tech is a clickable
 * quiet tag with its name and a tiny plain-English hint. A layer dot ties each row to the "kind of code" colours.
 */
export function TechStackDiagram({ tech, onSelect, className, selectedId }: TechStackDiagramProps) {
  const rows = useMemo(() => groupTechByRow(tech), [tech])
  if (!rows.length) {
    return (
      <div className={cn('rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3', className)} data-testid="tech-stack-diagram">
        We didn’t recognize any specific tools or frameworks in this project
      </div>
    )
  }
  return (
    <div className={cn('w-full', className)} data-testid="tech-stack-diagram">
      <ol
        className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface"
        aria-label="Technology stack, from what people see down to the tools behind the scenes"
      >
        {rows.map(({ row, items }) => (
          <li key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0 sm:w-44">
              <h4 className="flex items-center gap-2 text-sm font-medium text-ink">
                <LayerDot layer={row.layer} />
                {row.label}
              </h4>
              <p className="mt-1 pl-4 text-xs leading-snug text-ink-3">{row.description}</p>
            </div>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-2" aria-label={row.label}>
              {items.map((item) => {
                const hint = stripEmoji(techHint(item))
                const core = item.importance === 'core'
                const selected = selectedId === item.id
                const body = (
                  <>
                    <span className={cn('block truncate text-[13px] font-medium', item.importance === 'tooling' ? 'text-ink-2' : 'text-ink')}>
                      {item.name}
                    </span>
                    {hint && <span className="block truncate text-xs text-ink-3">{hint}</span>}
                    <span className="sr-only">{`, ${IMPORTANCE_LABEL[item.importance] ?? 'a helper'}`}</span>
                  </>
                )
                const cls = cn(
                  'block w-full max-w-[260px] min-w-[120px] rounded-md border px-3 py-2 text-left sm:w-auto',
                  selected ? 'border-accent bg-surface ring-1 ring-accent' : core ? 'border-line-strong bg-surface' : 'border-line bg-surface-2',
                )
                return (
                  <li key={item.id} className="min-w-0 max-sm:w-full">
                    {onSelect ? (
                      <button
                        type="button"
                        className={cn(
                          cls,
                          'cursor-pointer motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-atlas',
                          !selected && 'hover:border-ink-3',
                        )}
                        aria-pressed={selected}
                        title={item.description}
                        onClick={() => onSelect(item.id)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={cls} title={item.description}>
                        {body}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
