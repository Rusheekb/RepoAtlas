import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Wand2 } from 'lucide-react'
import { useHasAiKey, useTours } from '@/ai'
import { useRepoNav } from '@/components/shell/hooks'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { AiAssist } from '@/components/views/visual/AiAssist'
import { TourCard } from '@/components/views/visual/TourCard'
import { TourPlayer } from '@/components/views/visual/TourPlayer'
import { mergeTours, resumeStepIndex, seenStepCount, stepIndexFromParam, tourStatus } from '@/components/views/visual/tours'
import { useRepoSeen } from '@/components/views/visual/useSeen'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { VIEW_INFO } from '@/core/labels'
import type { Tour } from '@/core/types'
import { useAnalysis } from '@/state/repo'

const HINT = 'Each tour answers one question by walking you through the real code, one small step at a time. Pick one to begin.'

/** How long to wait for Claude's saved tours to load before saying a tour link doesn't exist. */
const MISSING_TOUR_GRACE_MS = 1500

function AskForTour({ onAsk, disabled }: { onAsk: (q: string) => void; disabled: boolean }) {
  const [question, setQuestion] = useState('')
  const id = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    onAsk(q)
    setQuestion('')
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink">
        <span aria-hidden>🙋 </span>
        <label htmlFor={`${id}-input`}>Ask for a tour</label>
      </p>
      <p id={`${id}-help`} className="mt-0.5 text-xs text-ink-3">
        Wondering how something works? Ask, and Claude will build a step-by-step tour that answers it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id={`${id}-input`}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="How does ___ work?"
          aria-describedby={`${id}-help`}
          maxLength={300}
          className="h-10 min-w-0 flex-[1_1_16rem] rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
        />
        <Button type="submit" variant="secondary" disabled={disabled || !question.trim()} icon={<Wand2 className="size-4" aria-hidden />}>
          Make this tour
        </Button>
      </div>
    </form>
  )
}

function TourGrid({ title, subtitle, tours, hrefFor, seen }: { title: string; subtitle: string; tours: Tour[]; hrefFor: (t: Tour) => string; seen: Record<string, number> | undefined }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <p className="text-sm text-ink-2">{subtitle}</p>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tours.map((t) => (
          <li key={t.id}>
            <TourCard tour={t} to={hrefFor(t)} status={tourStatus(t, seen)} seenSteps={seenStepCount(t, seen)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * "Guided Tours": step-by-step walkthroughs that each answer one question. Starter tours work without AI; with a
 * Claude key, Claude can write more (or one for your own question). ?tour=id&step=n (1-based) plays a tour.
 */
export default function ToursPage() {
  const analysis = useAnalysis()
  const fullName = analysis.meta.fullName
  const hasKey = useHasAiKey()
  const ai = useTours()
  const seen = useRepoSeen(fullName)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { href } = useRepoNav()

  const tours = useMemo(() => mergeTours(analysis.starterTours, ai.data), [analysis.starterTours, ai.data])
  const aiTours = useMemo(() => tours.filter((t) => !analysis.starterTours.includes(t)), [tours, analysis.starterTours])
  const starterTours = useMemo(() => tours.filter((t) => analysis.starterTours.includes(t)), [tours, analysis.starterTours])

  const tourId = params.get('tour')
  const tour = tourId ? tours.find((t) => t.id === tourId) : undefined
  const stepIndex = tour ? stepIndexFromParam(params.get('step'), tour.steps.length) : 0

  const tourHref = useCallback((id: string, index: number) => href('tours', { tour: id, step: String(index + 1) }), [href])
  const listHref = href('tours')

  const onStepChange = useCallback(
    (index: number) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('step', String(index + 1))
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  // A link to a tour we can't find yet may be one of Claude's (still loading from this browser's storage).
  const [graceOver, setGraceOver] = useState(false)
  const missing = Boolean(tourId) && !tour
  useEffect(() => {
    if (!missing) return
    setGraceOver(false)
    const t = setTimeout(() => setGraceOver(true), MISSING_TOUR_GRACE_MS)
    return () => clearTimeout(t)
  }, [missing, tourId])

  // After "Ask for a tour" succeeds, jump straight into the new tour.
  const pendingAsk = useRef<{ before: number; started: boolean } | null>(null)
  const { askTour, asking } = ai
  const onAsk = useCallback(
    (q: string) => {
      pendingAsk.current = { before: ai.data?.length ?? 0, started: false }
      askTour(q)
    },
    [ai.data, askTour],
  )
  useEffect(() => {
    const pending = pendingAsk.current
    if (!pending) return
    if (asking) {
      pending.started = true
      return
    }
    if (!pending.started) return
    pendingAsk.current = null
    const data = ai.data ?? []
    if (data.length <= pending.before) return
    const created = data[data.length - 1]
    const merged = aiTours.find((t) => t === created) ?? aiTours[aiTours.length - 1]
    if (merged) navigate(tourHref(merged.id, 0))
  }, [asking, ai.data, aiTours, navigate, tourHref])

  if (tourId) {
    if (tour) {
      return (
        <TourPlayer
          key={tour.id}
          analysis={analysis}
          tour={tour}
          tours={tours}
          stepIndex={stepIndex}
          onStepChange={onStepChange}
          listHref={listHref}
          tourHref={tourHref}
        />
      )
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        {graceOver ? (
          <EmptyState
            icon="🧭"
            title="We couldn’t find that tour"
            actions={
              <Button variant="primary" onClick={() => navigate(listHref)}>
                See all tours
              </Button>
            }
          >
            It may have been one of Claude’s tours that isn’t saved in this browser, or the link is out of date.
          </EmptyState>
        ) : (
          <Spinner label="Looking for the tour" />
        )}
      </div>
    )
  }

  const busy = ai.state === 'loading' || ai.state === 'streaming' || asking
  const hrefFor = (t: Tour) => tourHref(t.id, tourStatus(t, seen) === 'done' ? 0 : resumeStepIndex(t, seen))
  const info = VIEW_INFO.tours

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" data-testid="tours-page">
      <ViewHeader emoji={info.emoji} title={info.label} hint={HINT} />
      <AiAssist
        hasKey={hasKey}
        busy={busy}
        state={ai.state}
        aiStatus={ai.aiStatus}
        progressChars={ai.progressChars}
        error={ai.error}
        errorKind={ai.errorKind}
        hasData={aiTours.length > 0}
        stale={Boolean(ai.stale)}
        onGenerate={ai.run}
        onCancel={ai.cancel}
        generateLabel="Generate tours with Claude"
        regenerateLabel="Write new tours with Claude"
        busyLabel={asking ? 'Claude is building a tour for your question' : 'Claude is writing tours of this project'}
        pitch="These starter tours were put together from the project’s structure. Claude can read the actual code and write richer tours, or one that answers your own question."
        doneNote="Claude’s tours are below, written from the actual code."
        promptTask={{ kind: 'tours' }}
      >
        <AskForTour onAsk={onAsk} disabled={busy} />
      </AiAssist>

      {tours.length === 0 ? (
        <EmptyState icon="🧭" title="No tours yet">
          We couldn’t put together a tour for this project on our own.
          {hasKey ? ' Ask Claude to write some with the button above.' : ' Add a Claude key in Settings and Claude can write some for you.'}
        </EmptyState>
      ) : (
        <>
          {aiTours.length > 0 && (
            <TourGrid
              title="✨ Tours written by Claude"
              subtitle="Claude read the code and wrote these walkthroughs."
              tours={aiTours}
              hrefFor={hrefFor}
              seen={seen}
            />
          )}
          {starterTours.length > 0 && (
            <TourGrid
              title={aiTours.length > 0 ? '🧭 Starter tours' : '🧭 Tours to get you started'}
              subtitle="Put together instantly from how the project is organized."
              tours={starterTours}
              hrefFor={hrefFor}
              seen={seen}
            />
          )}
        </>
      )}
    </div>
  )
}
