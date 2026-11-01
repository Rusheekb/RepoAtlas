import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, Map as MapIcon, RotateCcw } from 'lucide-react'
import { ArchitectureGraph, buildArchitectureLayout, TourDiagram } from '@/components/graphs'
import { useRepoNav } from '@/components/shell/hooks'
import { RichText } from '@/components/shell/bits'
import { Button, Markdown } from '@/components/ui'
import { pluralize } from '@/core/format'
import { dirname } from '@/core/paths'
import type { RepoAnalysis, Tour } from '@/core/types'
import { useExplain } from '@/state/explain'
import { bestFitDirection, moduleNeighborhood } from './architecture'
import { makeCodeRefResolver } from './codeRefs'
import { StepCode } from './StepCode'
import { pickNextTour, resumeStepIndex, stepModuleId, tourKey, tourStepKey } from './tours'
import { useMarkSeen, useRepoSeen } from './useSeen'

export interface TourPlayerProps {
  analysis: RepoAnalysis
  tour: Tour
  /** Every tour on offer (to suggest the next one). */
  tours: Tour[]
  /** 0-based; `tour.steps.length` shows the "Tour complete" card. */
  stepIndex: number
  onStepChange: (index: number) => void
  /** Address of the tour list. */
  listHref: string
  /** Address of a tour at a 0-based step. */
  tourHref: (tourId: string, stepIndex: number) => string
}

/** Approximate size of the "Where this happens" map (used to pick the arrow direction that reads best). */
const MINI_MAP_BOX = { width: 360, height: 400 }

/** Arrow keys shouldn't turn pages while the reader is typing, using a menu, or moving around a map. */
function keyBelongsToSomethingElse(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return true
  const t = e.target
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return true
  return Boolean(t.closest('.react-flow, [role="radiogroup"], [role="dialog"], dialog, [role="slider"], [role="tablist"], [role="listbox"], [role="menu"]'))
}

/** Where the nearest scrolling ancestor starts on screen (0 when the page itself scrolls). */
function scrollAreaTop(el: HTMLElement): number {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return p.getBoundingClientRect().top
  }
  return 0
}

/**
 * Plays one guided tour: the step flow diagram on top, then the current step's explanation and the exact code it
 * talks about, a small map showing where in the project it happens, and Previous / Next (also ← / →).
 * Each step viewed is remembered; finishing shows a "Tour complete" card that suggests the next tour.
 */
export function TourPlayer({ analysis, tour, tours, stepIndex, onStepChange, listHref, tourHref }: TourPlayerProps) {
  const { href, go } = useRepoNav()
  const openExplain = useExplain((s) => s.open)
  const fullName = analysis.meta.fullName
  const seen = useRepoSeen(fullName)
  const markSeen = useMarkSeen(fullName)
  const total = tour.steps.length
  const index = Math.max(0, Math.min(stepIndex, total))
  const done = index >= total
  const step = done ? null : tour.steps[index]
  const moduleId = step ? stepModuleId(step, analysis.files) : null
  const module = moduleId ? analysis.modules.find((m) => m.id === moduleId) : undefined
  const file = step?.file ? analysis.files[step.file] : undefined
  const highlightIds = useMemo(() => (moduleId ? [moduleId] : []), [moduleId])
  // The step's part and its closest neighbors: few enough boxes to read in a narrow column.
  const slice = useMemo(() => {
    const near = moduleId ? moduleNeighborhood(moduleId, analysis.modules, analysis.moduleEdges, 3) : null
    const picked = near && near.modules.length ? near : { modules: analysis.modules, edges: analysis.moduleEdges }
    // Roughly the side column's shape (it is wider and shorter on phones, where it sits under the step).
    const direction = bestFitDirection(picked.modules, picked.edges, MINI_MAP_BOX, buildArchitectureLayout)
    return { ...picked, direction }
  }, [moduleId, analysis.modules, analysis.moduleEdges])
  const topRef = useRef<HTMLDivElement>(null)

  // Remember progress: each step as it's viewed, and the whole tour once finished.
  useEffect(() => {
    if (total === 0) return
    if (done) markSeen(tourKey(tour.id))
    else markSeen(tourStepKey(tour.id, index + 1))
  }, [tour.id, index, done, total, markSeen])

  const goTo = useCallback((i: number) => onStepChange(Math.max(0, Math.min(i, total))), [onStepChange, total])

  // ← / → turn the pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || keyBelongsToSomethingElse(e)) return
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'ArrowRight' && index < total) {
        e.preventDefault()
        goTo(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, index, total])

  // On a new step, bring the top of the player back into view if the reader scrolled past it.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const el = topRef.current
    if (el && el.getBoundingClientRect().top < scrollAreaTop(el) - 1 && typeof el.scrollIntoView === 'function') {
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [index])

  // File names mentioned in the explanation become links to "Read the Code".
  const resolveRef = useMemo(() => makeCodeRefResolver(Object.keys(analysis.files)), [analysis.files])
  const nearDir = step?.file ? dirname(step.file) : null
  const isCodeLink = useCallback((code: string) => resolveRef(code, nearDir) != null, [resolveRef, nearDir])
  const onCodeClick = useCallback(
    (code: string) => {
      const p = resolveRef(code, nearDir)
      if (!p) return false
      go('explore', { file: p })
      return true
    },
    [resolveRef, nearDir, go],
  )

  const next = done ? pickNextTour(tours, tour.id, seen) : null

  return (
    <div ref={topRef} className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6" data-testid="tour-player">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={listHref} className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-medium text-brand-text hover:bg-brand-soft">
          <ArrowLeft className="size-4" aria-hidden /> All tours
        </Link>
        <p className="text-xs font-medium text-ink-3 tabular-nums">
          {done ? `All ${pluralize(total, 'step')} done` : pluralize(total, 'step')}
        </p>
      </div>

      <header className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-2xl shadow-sm" aria-hidden>
          {tour.emoji || '🧭'}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{tour.title}</h1>
          {tour.summary && <RichText text={tour.summary} className="mt-1 block text-sm text-ink-2 sm:text-[15px]" />}
        </div>
      </header>

      <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
        <TourDiagram tour={tour} activeStep={index} onStepClick={goTo} modules={analysis.modules} files={analysis.files} orientation="horizontal" />
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {done ? `Tour complete: ${tour.title}` : `Step ${index + 1} of ${total}: ${step?.title ?? ''}`}
      </p>

      {done ? (
        <section className="rounded-2xl border border-line bg-surface px-5 py-10 text-center shadow-sm sm:px-10" data-testid="tour-complete" aria-labelledby="tour-complete-title">
          <div className="text-5xl motion-safe:animate-bounce" aria-hidden>
            🏁
          </div>
          <h2 id="tour-complete-title" className="mt-4 text-2xl font-semibold text-ink">
            Tour complete! 🎉
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-2 sm:text-[15px]">
            You followed “{tour.title}” from start to finish, all {pluralize(total, 'step')}. That’s a real piece of this project you now understand.
          </p>
          {next ? (
            <div className="mx-auto mt-7 max-w-lg rounded-2xl border border-line bg-surface-2 p-4 text-left">
              <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Up next</p>
              <div className="mt-2 flex items-start gap-3">
                <span className="text-2xl leading-none" aria-hidden>
                  {next.emoji || '🧭'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{next.title}</p>
                  {next.summary && <RichText text={next.summary} className="mt-0.5 block text-sm text-ink-2" />}
                </div>
              </div>
              <Link
                to={tourHref(next.id, resumeStepIndex(next, seen))}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover"
              >
                Start the next tour <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="mx-auto mt-6 max-w-lg text-sm text-ink-2">
              You’ve finished every tour on offer.{' '}
              <Link to={href('quiz')} className="font-medium text-brand-text underline underline-offset-2">
                Test yourself with a quick quiz
              </Link>{' '}
              to see how much stuck.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => goTo(0)} icon={<RotateCcw className="size-4" aria-hidden />}>
              Take this tour again
            </Button>
            <Link to={listHref} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
              Back to all tours
            </Link>
          </div>
        </section>
      ) : (
        step && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="tour-step-title" data-testid="tour-step">
              <p className="text-xs font-semibold tracking-wide text-brand-text uppercase">
                Step {index + 1} of {total}
              </p>
              <h2 id="tour-step-title" className="mt-1 text-xl font-semibold text-ink">
                {step.title}
              </h2>
              {step.explanation.trim() && (
                <Markdown className="mt-3" isCodeLink={isCodeLink} onCodeClick={onCodeClick}>
                  {step.explanation}
                </Markdown>
              )}
              {step.file ? (
                <StepCode
                  key={step.file}
                  className="mt-5"
                  path={step.file}
                  snippet={step.snippet}
                  language={file?.language ?? null}
                  owner={analysis.meta.owner}
                  repo={analysis.meta.repo}
                  gitRef={analysis.commitSha || analysis.ref}
                />
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
                  <span className="text-lg leading-none" aria-hidden>
                    💡
                  </span>
                  <p>This step is about the big picture, so there’s no code to read here. Just take the idea with you to the next step.</p>
                </div>
              )}
              <nav aria-label="Tour steps" className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={index === 0} icon={<ArrowLeft className="size-4" aria-hidden />}>
                  Previous
                </Button>
                <span className="hidden text-xs text-ink-3 sm:inline">Tip: use the ← and → keys</span>
                <Button variant="primary" onClick={() => goTo(index + 1)} iconRight={index === total - 1 ? undefined : <ArrowRight className="size-4" aria-hidden />}>
                  {index === total - 1 ? 'Finish the tour 🎉' : 'Next'}
                </Button>
              </nav>
            </article>

            <aside className="min-w-0 space-y-3" aria-label="Where this step happens">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <div className="px-4 pt-4">
                  <h3 className="text-sm font-semibold text-ink">
                    <span aria-hidden>📍 </span>Where this happens
                  </h3>
                  {module ? (
                    <>
                      <p className="mt-1 text-sm text-ink-2">
                        In <span className="font-medium text-ink">{module.emoji} {module.name}</span>
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                        {module.role}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-3">Shown with the parts it works with most.</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-ink-2">This step is about the project as a whole, not one part of it.</p>
                  )}
                </div>
                <div className="relative mt-3 h-[340px] border-t border-line lg:h-[420px]">
                  <ArchitectureGraph
                    modules={slice.modules}
                    edges={slice.edges}
                    direction={slice.direction}
                    highlightIds={highlightIds}
                    selectedId={moduleId}
                    onSelect={(id) => {
                      if (id) openExplain({ type: 'module', id })
                    }}
                    showLegend={false}
                    showMiniMap={false}
                  />
                </div>
                {moduleId && (
                  <div className="border-t border-line px-4 py-2.5">
                    <Link
                      to={href('map', { select: moduleId })}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline"
                    >
                      <MapIcon className="size-4" aria-hidden /> Show on the full map
                    </Link>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )
      )}
    </div>
  )
}
