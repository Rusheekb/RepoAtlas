import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react'
import { IconButton } from './IconButton'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import type { LoadProgress, LoadStage } from '@/core/types'
import { BEGINNER_TIPS } from './tips'

type VisibleStage = Exclude<LoadStage, 'done'>

const STAGES: { id: VisibleStage; label: string; detail: string }[] = [
  { id: 'meta', label: 'Looking up the project', detail: 'Who made it, what it’s called, how popular it is' },
  { id: 'tree', label: 'Listing every file', detail: 'Like reading the table of contents first' },
  { id: 'files', label: 'Reading the important files', detail: 'Starting points, settings and the busiest code' },
  { id: 'analyze', label: 'Drawing the map', detail: 'Working out which parts depend on which' },
]

/** Share of the overall bar each stage covers (files takes the longest). */
const SPANS: Record<VisibleStage, [number, number]> = {
  meta: [0, 8],
  tree: [8, 22],
  files: [22, 92],
  analyze: [92, 100],
}

/** Overall percent (0–100) from a progress update. */
export function overallPercent(progress: LoadProgress | null): number {
  if (!progress) return 0
  if (progress.stage === 'done') return 100
  const [from, to] = SPANS[progress.stage]
  const { done, total } = progress
  const fraction = total && total > 0 && done != null ? Math.min(1, Math.max(0, done / total)) : 0.35
  return Math.round(from + (to - from) * fraction)
}

const TIP_INTERVAL_MS = 7000

/**
 * What screen readers hear: one message per stage. Counting messages ("Reading 12 of 223 files…") change for every file,
 * so they are shown on screen only and the stage name is announced instead. Exported for tests.
 */
export function announcement(progress: LoadProgress | null): string {
  if (!progress) return 'Getting started…'
  if (progress.stage === 'done') return progress.message || 'Ready'
  if (progress.done != null && progress.total != null) {
    const stage = STAGES.find((s) => s.id === progress.stage)
    return stage ? `${stage.label}…` : progress.message
  }
  return progress.message
}

/** Shown while a repository downloads and is analyzed: live status, progress bar, stage list and rotating tips. */
export function LoadingScreen({ progress, repoLabel }: { progress: LoadProgress | null; repoLabel: string }) {
  const stage: LoadStage = progress?.stage ?? 'meta'
  const currentIndex = stage === 'done' ? STAGES.length : STAGES.findIndex((s) => s.id === stage)
  const percent = overallPercent(progress)
  const [tip, setTip] = useState(() => Math.floor(Math.random() * BEGINNER_TIPS.length))
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = window.setInterval(() => setTip((i) => (i + 1) % BEGINNER_TIPS.length), TIP_INTERVAL_MS)
    return () => window.clearInterval(t)
  }, [paused])

  const step = (delta: number) => {
    setPaused(true)
    setTip((i) => (i + delta + BEGINNER_TIPS.length) % BEGINNER_TIPS.length)
  }

  return (
    <div className="flex min-h-full items-start justify-center overflow-y-auto bg-canvas px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-page-title text-balance text-ink">
          Getting to know <span className="break-all">{repoLabel}</span>
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">This usually takes a few seconds. Bigger projects take a little longer.</p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="min-h-5 min-w-0 text-sm leading-5 text-ink" aria-hidden data-testid="loading-message">
              {progress?.message ?? 'Getting started…'}
            </p>
            <span className="shrink-0 text-meta" aria-hidden>
              {percent}%
            </span>
          </div>
          <p className="sr-only" role="status" aria-live="polite" data-testid="loading-announcement">
            {announcement(progress)}
          </p>
          <div
            role="progressbar"
            aria-label="Loading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full w-full origin-left rounded-full bg-brand transition-transform duration-500 ease-atlas"
              style={{ transform: `scaleX(${Math.max(4, percent) / 100})` }}
            />
          </div>

          <ol className="mt-6 space-y-3" aria-label="Steps">
            {STAGES.map((s, i) => {
              const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'
              return (
                <li key={s.id} className="flex items-start gap-3" aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden>
                    {state === 'done' ? (
                      <Icon as={Check} className="text-ink-2" />
                    ) : (
                      <span className={cn('size-2 rounded-full', state === 'current' ? 'bg-ink' : 'border border-line-strong')} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className={cn('text-sm leading-5', state === 'current' ? 'font-medium text-ink' : state === 'done' ? 'text-ink-2' : 'text-ink-3')}>
                      {s.label}
                      <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ' (coming up)'}</span>
                    </p>
                    <p className="text-[13px] leading-5 text-ink-3">{s.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <aside className="mt-4 rounded-2xl border border-line bg-surface-2/60 p-5" aria-label="Did you know?">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <Icon as={Lightbulb} className="text-ink-3" />
              Did you know?
            </p>
            <div className="-my-1 -mr-1 flex items-center gap-1">
              <IconButton size="sm" aria-label="Previous tip" onClick={() => step(-1)} icon={<Icon as={ChevronLeft} />} />
              <IconButton size="sm" aria-label="Next tip" onClick={() => step(1)} icon={<Icon as={ChevronRight} />} />
            </div>
          </div>
          <p key={tip} className="mt-3 text-[15px] leading-relaxed text-ink motion-safe:animate-[atlas-fade-in_300ms_cubic-bezier(0.22,1,0.36,1)]">
            {BEGINNER_TIPS[tip]}
          </p>
          <style>{'@keyframes atlas-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }'}</style>
        </aside>
      </div>
    </div>
  )
}
