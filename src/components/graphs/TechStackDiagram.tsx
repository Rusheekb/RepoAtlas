import { useMemo } from 'react'
import { cn } from '@/components/ui/cn'
import { LAYER_INFO } from '@/core/labels'
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
 * chip with its name and a tiny plain-English hint.
 */
export function TechStackDiagram({ tech, onSelect, className, selectedId }: TechStackDiagramProps) {
  const rows = useMemo(() => groupTechByRow(tech), [tech])
  if (!rows.length) {
    return (
      <div className={cn('rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3', className)} data-testid="tech-stack-diagram">
        We didn’t recognize any specific tools or frameworks in this project.
      </div>
    )
  }
  return (
    <div className={cn('w-full', className)} data-testid="tech-stack-diagram">
      <ol className="flex flex-col gap-[2px] overflow-hidden rounded-2xl border border-line bg-line" aria-label="Technology stack, from what people see down to the tools behind the scenes">
        {rows.map(({ row, items }) => (
          <li key={row.id} className="relative flex flex-col gap-3 bg-surface px-4 py-3.5 sm:flex-row sm:items-start sm:gap-5">
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: LAYER_INFO[row.layer].color }} aria-hidden />
            <div className="shrink-0 sm:w-44">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden>{row.emoji}</span>
                {row.label}
              </h4>
              <p className="mt-0.5 text-xs leading-snug text-ink-3">{row.description}</p>
            </div>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-2" aria-label={row.label}>
              {items.map((item) => {
                const hint = techHint(item)
                const core = item.importance === 'core'
                const selected = selectedId === item.id
                const body = (
                  <>
                    <span className={cn('block truncate text-[13px]', core ? 'font-semibold text-ink' : 'font-medium text-ink', item.importance === 'tooling' && 'text-ink-2')}>
                      {item.name}
                    </span>
                    {hint && <span className="block truncate text-[11px] text-ink-3">{hint}</span>}
                    <span className="sr-only">{`, ${IMPORTANCE_LABEL[item.importance] ?? 'a helper'}`}</span>
                  </>
                )
                const cls = cn(
                  'block w-full max-w-[260px] min-w-[120px] rounded-xl border px-3 py-2 text-left sm:w-auto',
                  selected ? 'border-brand bg-brand-soft ring-2 ring-brand/25' : core ? 'border-line-strong bg-surface shadow-sm' : 'border-line bg-surface-2',
                )
                return (
                  <li key={item.id} className="min-w-0 max-sm:w-full">
                    {onSelect ? (
                      <button
                        type="button"
                        className={cn(cls, 'cursor-pointer motion-safe:transition-colors', !selected && 'hover:border-line-strong hover:bg-surface-2')}
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
