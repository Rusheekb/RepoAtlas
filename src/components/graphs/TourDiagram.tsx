import { Fragment, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { LAYER_INFO } from '@/core/labels'
import { basename } from '@/core/paths'
import type { AnalyzedFile, ModuleInfo, Tour } from '@/core/types'
import { useElementSize, usePrefersReducedMotion } from './hooks'

export interface TourDiagramProps {
  tour: Tour
  activeStep: number
  onStepClick?: (index: number) => void
  modules?: ModuleInfo[]
  files?: Record<string, AnalyzedFile>
  className?: string
  /** 'auto' (default) goes vertical when the space is narrower than ~600px. */
  orientation?: 'auto' | 'horizontal' | 'vertical'
}

const VERTICAL_BELOW = 600

export interface TourStepCard {
  index: number
  title: string
  fileLabel: string
  filePath: string | null
  moduleName: string | null
  color: string | null
  status: 'done' | 'active' | 'todo'
}

/** Resolve what each step card shows (pure). */
export function tourStepCards(
  tour: Tour,
  activeStep: number,
  modules?: readonly ModuleInfo[],
  files?: Record<string, AnalyzedFile>,
): TourStepCard[] {
  const moduleById = new Map((modules ?? []).map((m) => [m.id, m]))
  return tour.steps.map((step, index) => {
    const moduleId = step.moduleId ?? (step.file ? files?.[step.file]?.moduleId : undefined) ?? null
    const mod = moduleId ? moduleById.get(moduleId) : undefined
    return {
      index,
      title: step.title,
      fileLabel: step.file ? basename(step.file) : 'Big-picture idea',
      filePath: step.file,
      moduleName: mod?.name ?? null,
      color: mod ? (LAYER_INFO[mod.layer]?.color ?? null) : step.file && files?.[step.file] ? LAYER_INFO[files[step.file].layer].color : null,
      status: index < activeStep ? 'done' : index === activeStep ? 'active' : 'todo',
    }
  })
}

function Connector({ vertical, done }: { vertical: boolean; done: boolean }) {
  const color = done ? 'var(--brand)' : 'var(--line-strong)'
  return vertical ? (
    <li aria-hidden className="flex h-5 justify-start pl-[20px]">
      <svg width="12" height="20" viewBox="0 0 12 20" className="overflow-visible">
        <path d="M6,0 L6,14" style={{ stroke: color, strokeWidth: 2, fill: 'none' }} strokeLinecap="round" />
        <path d="M2,12 L6,18 L10,12 Z" style={{ fill: color }} />
      </svg>
    </li>
  ) : (
    <li aria-hidden className="flex w-7 shrink-0 items-center self-center">
      <svg width="28" height="12" viewBox="0 0 28 12" className="overflow-visible">
        <path d="M2,6 L21,6" style={{ stroke: color, strokeWidth: 2, fill: 'none' }} strokeLinecap="round" />
        <path d="M19,2 L26,6 L19,10 Z" style={{ fill: color }} />
      </svg>
    </li>
  )
}

/** A flow diagram of the tour's steps (numbered nodes connected by arrows, each showing the step title and file), active step emphasized, completed steps checked. */
export function TourDiagram({ tour, activeStep, onStepClick, modules, files, className, orientation = 'auto' }: TourDiagramProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const reduced = usePrefersReducedMotion()
  const cards = tourStepCards(tour, activeStep, modules, files)
  const vertical = orientation === 'vertical' || (orientation === 'auto' && size.width > 0 && size.width < VERTICAL_BELOW)
  const activeRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null)

  // Keep the active step in view when the chain scrolls sideways (without scrolling the whole page).
  useEffect(() => {
    const scroller = containerRef.current
    const el = activeRef.current
    if (!scroller || !el || vertical) return
    const target = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2
    const left = Math.max(0, target)
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' })
    else scroller.scrollLeft = left
  }, [activeStep, vertical, reduced, containerRef, size.width])

  if (!cards.length) {
    return (
      <div ref={containerRef} className={cn('text-sm text-ink-3', className)} data-testid="tour-diagram">
        This tour has no steps yet.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('atlas-tour relative w-full', !vertical && 'overflow-x-auto pb-2', className)}
      data-testid="tour-diagram"
    >
      <ol
        aria-label={`Steps of the tour “${tour.title}”`}
        className={cn('flex', vertical ? 'flex-col' : 'w-max min-w-full flex-row items-stretch py-1 pr-1')}
      >
        {cards.map((c, i) => {
          const isActive = c.status === 'active'
          const isDone = c.status === 'done'
          const content = (
            <>
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  isActive ? 'bg-brand text-brand-ink' : isDone ? 'border border-line bg-surface-2 text-good-text' : 'border border-line bg-surface-2 text-ink-2',
                )}
                aria-hidden
              >
                {isDone ? <Check className="size-3.5" strokeWidth={3} /> : c.index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('line-clamp-2 text-[13px] leading-snug', isActive ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
                  <span className="sr-only">{`Step ${c.index + 1} of ${cards.length}: `}</span>
                  {c.title}
                  {(isDone || isActive) && <span className="sr-only">{isDone ? ' (done)' : ' (you are here)'}</span>}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3" title={c.filePath ?? undefined}>
                  {c.color && <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />}
                  <span className={cn('truncate', c.filePath && 'font-mono')}>{c.fileLabel}</span>
                  {c.moduleName && <span className="sr-only">in {c.moduleName}</span>}
                </span>
              </span>
            </>
          )
          const cardCls = cn(
            'flex h-full min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left',
            vertical ? 'w-full' : 'w-[200px]',
            isActive ? 'border-brand bg-brand-soft shadow-md ring-2 ring-brand/25' : 'border-line bg-surface shadow-sm',
            !isActive && onStepClick && 'hover:border-line-strong hover:bg-surface-2',
            'motion-safe:transition-colors',
          )
          return (
            <Fragment key={i}>
              {i > 0 && <Connector vertical={vertical} done={i <= activeStep} />}
              <li className={cn('min-w-0', !vertical && 'flex')}>
                {onStepClick ? (
                  <button
                    ref={isActive ? (el) => void (activeRef.current = el) : undefined}
                    type="button"
                    className={cn(cardCls, 'cursor-pointer')}
                    aria-current={isActive ? 'step' : undefined}
                    onClick={() => onStepClick(c.index)}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    ref={isActive ? (el) => void (activeRef.current = el) : undefined}
                    className={cardCls}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {content}
                  </div>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}
