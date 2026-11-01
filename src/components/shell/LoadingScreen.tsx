import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react'
import { IconButton } from './IconButton'
import { cn } from '@/components/ui/cn'
import type { LoadProgress, LoadStage } from '@/core/types'
import { LogoMark } from './Logo'
import { BEGINNER_TIPS } from './tips'

type VisibleStage = Exclude<LoadStage, 'done'>

const STAGES: { id: VisibleStage; label: string; detail: string; emoji: string }[] = [
  { id: 'meta', label: 'Looking up the project', detail: 'Who made it, what it’s called, how popular it is.', emoji: '🔎' },
  { id: 'tree', label: 'Listing every file', detail: 'Like reading the table of contents first.', emoji: '🗂️' },
  { id: 'files', label: 'Reading the important files', detail: 'Starting points, settings and the busiest code.', emoji: '📖' },
  { id: 'analyze', label: 'Drawing the map', detail: 'Working out which parts depend on which.', emoji: '🗺️' },
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

/** Shown while a repository downloads and is analyzed: stage list, live status, progress bar and rotating tips. */
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
        <div className="flex flex-col items-center text-center">
          <LogoMark animated className="size-16 drop-shadow-sm" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Getting to know <span className="break-all text-brand-text">{repoLabel}</span>
          </h1>
          <p className="mt-2 text-sm text-ink-2">This usually takes a few seconds. Bigger projects take a little longer.</p>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div
            role="progressbar"
            aria-label="Loading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, percent)}%` }} />
          </div>
          <p className="mt-3 min-h-5 text-sm font-medium text-ink" aria-live="polite" data-testid="loading-message">
            {progress?.message ?? 'Getting started…'}
          </p>

          <ol className="mt-5 space-y-3" aria-label="Steps">
            {STAGES.map((s, i) => {
              const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'
              return (
                <li key={s.id} className="flex items-start gap-3" aria-current={state === 'current' ? 'step' : undefined}>
                  <span
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-sm',
                      state === 'done' && 'border-transparent bg-brand text-brand-ink',
                      state === 'current' && 'border-brand bg-brand-soft',
                      state === 'todo' && 'border-line bg-surface-2 opacity-70',
                    )}
                    aria-hidden
                  >
                    {state === 'done' ? <Check className="size-4" /> : <span className={cn(state === 'current' && 'animate-atlas-pulse')}>{s.emoji}</span>}
                  </span>
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium', state === 'todo' ? 'text-ink-3' : 'text-ink')}>
                      {s.label}
                      <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ' (coming up)'}</span>
                    </p>
                    <p className="text-xs text-ink-3">{s.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <aside className="mt-6 rounded-2xl border border-line bg-brand-soft/60 p-5" aria-label="Did you know?">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand-text uppercase">
              <Lightbulb className="size-4" aria-hidden />
              Did you know?
            </p>
            <div className="flex items-center gap-1">
              <IconButton size="sm" aria-label="Previous tip" onClick={() => step(-1)} icon={<ChevronLeft className="size-4" />} />
              <IconButton size="sm" aria-label="Next tip" onClick={() => step(1)} icon={<ChevronRight className="size-4" />} />
            </div>
          </div>
          <p key={tip} className="mt-2 text-[15px] leading-relaxed text-ink motion-safe:animate-[atlas-fade-in_400ms_ease-out]">
            {BEGINNER_TIPS[tip]}
          </p>
          <style>{'@keyframes atlas-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }'}</style>
        </aside>
      </div>
    </div>
  )
}
