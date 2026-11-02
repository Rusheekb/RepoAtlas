import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, RotateCcw, Shuffle, X } from 'lucide-react'
import { RichText } from '@/components/shell/bits'
import { Button, Markdown } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import type { QuizQuestion } from '@/core/types'

export interface QuizRunnerProps {
  questions: QuizQuestion[]
  /** "New quiz" on the score screen. */
  onNewQuiz: () => void
  newQuizLabel: string
  /** Called once when the reader reaches the score screen. */
  onFinish?: (score: number, total: number) => void
  /** Shown under the score (e.g. links to keep learning). */
  afterScore?: ReactNode
  className?: string
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** Keyboard keys in the small print, drawn as keycaps. */
const KEYCAP = 'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-surface px-1 font-mono text-xs text-ink-2'

/**
 * A calm line for the score screen. `emoji` is kept for compatibility but is no longer shown: the score itself is the
 * figure on that screen.
 */
export function scoreMessage(score: number, total: number): { emoji: string; title: string; text: string } {
  const p = total ? score / total : 0
  if (p >= 0.99) return { emoji: '🏆', title: 'Full marks', text: 'You know your way around this project.' }
  if (p >= 0.7) return { emoji: '🎉', title: 'A solid picture', text: 'You’ve got a clear sense of how this project fits together.' }
  if (p >= 0.4) return { emoji: '👍', title: 'Getting there', text: 'Have a look at the explanations below, then try again.' }
  return { emoji: '🌱', title: 'A good start', text: 'Everyone starts somewhere. The explanations below are a good way to learn, then give it another go.' }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** One question at a time with big answer buttons, instant feedback and an explanation, then a score and a review. */
export function QuizRunner({ questions, onNewQuiz, newQuizLabel, onFinish, afterScore, className }: QuizRunnerProps) {
  const total = questions.length
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [finished, setFinished] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const shown = useRef({ index, finished })

  const q = questions[index]
  const chosen = answers[index]
  const answered = chosen != null
  const score = answers.reduce<number>((n, a, i) => n + (a != null && a === questions[i]?.answerIndex ? 1 : 0), 0)

  // Move focus to the new question or the score (not on first load, so the page doesn't jump).
  useEffect(() => {
    if (shown.current.index === index && shown.current.finished === finished) return
    shown.current = { index, finished }
    headingRef.current?.focus({ preventScroll: false })
  }, [index, finished])

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true })
  }, [answered])

  const choose = (i: number) => {
    if (answered || !q || i < 0 || i >= q.options.length) return
    setAnswers((prev) => prev.map((a, k) => (k === index ? i : a)))
  }

  const next = () => {
    if (index + 1 < total) setIndex(index + 1)
    else {
      setFinished(true)
      onFinish?.(score, total)
    }
  }

  const restart = () => {
    setAnswers(questions.map(() => null))
    setIndex(0)
    setFinished(false)
  }

  // Keyboard: 1–4 or A–D picks an answer; Enter moves on.
  useEffect(() => {
    if (finished) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const key = e.key.toUpperCase()
      const byNumber = /^[1-6]$/.test(key) ? Number(key) - 1 : -1
      const byLetter = LETTERS.indexOf(key)
      const pickIdx = byNumber >= 0 ? byNumber : byLetter
      if (!answered && pickIdx >= 0 && q && pickIdx < q.options.length) {
        e.preventDefault()
        setAnswers((prev) => prev.map((a, k) => (k === index ? pickIdx : a)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finished, answered, q, index])

  if (!total || !q) return null

  if (finished) {
    const msg = scoreMessage(score, total)
    return (
      <div className={cn('space-y-5', className)} data-testid="quiz-score">
        <section className="rounded-2xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8" aria-labelledby="quiz-score-title">
          {/* The score is the figure on this screen: big, tabular, in ink. */}
          <p className="flex items-baseline justify-center gap-1 leading-none font-medium text-ink tabular-nums" aria-hidden>
            <span className="text-6xl tracking-tight">{score}</span>
            <span className="text-2xl text-ink-3">/ {total}</span>
          </p>
          <h2 id="quiz-score-title" ref={headingRef} tabIndex={-1} className="atlas-focus-target mt-4 text-xl font-medium text-ink outline-none">
            {msg.title}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
            You got <span className="tabular-nums">{score}</span> out of <span className="tabular-nums">{total}</span> right. {msg.text}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={<Icon as={RotateCcw} />} onClick={restart}>
              Try again
            </Button>
            <Button variant="secondary" icon={<Icon as={Shuffle} />} onClick={onNewQuiz}>
              {newQuizLabel}
            </Button>
          </div>
          {afterScore && <div className="mt-6 border-t border-line pt-4 text-sm text-ink-2">{afterScore}</div>}
        </section>

        <section aria-labelledby="quiz-review-title">
          <h3 id="quiz-review-title" className="text-sm font-medium text-ink">
            Your answers
          </h3>
          <ol className="mt-3 space-y-2">
            {questions.map((item, i) => {
              const right = answers[i] === item.answerIndex
              return (
                <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                      right ? 'bg-brand text-brand-ink' : 'border border-line-strong bg-surface-2 text-bad-text',
                    )}
                  >
                    <Icon as={right ? Check : X} size={14} />
                    <span className="sr-only">{right ? 'Correct' : 'Not correct'}</span>
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">
                      <RichText text={item.question} />
                    </p>
                    <p className="mt-0.5 text-ink-2">
                      Answer: <RichText text={item.options[item.answerIndex]} />
                    </p>
                    {!right && answers[i] != null && (
                      <p className="mt-0.5 text-ink-3">
                        You picked: <RichText text={item.options[answers[i] ?? 0]} />
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    )
  }

  const right = answered && chosen === q.answerIndex
  return (
    <div className={cn('space-y-4', className)} data-testid="quiz-runner">
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-2 tabular-nums">
          Question {index + 1} of {total}
        </p>
        <ol className="ml-auto flex items-center gap-2" aria-label="Your progress">
          {questions.map((item, i) => {
            const a = answers[i]
            const state = a == null ? (i === index ? 'current' : 'todo') : a === item.answerIndex ? 'right' : 'wrong'
            return (
              <li
                key={i}
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border transition-colors duration-150 ease-atlas',
                  // The question you're on is the one marked in the accent.
                  state === 'current' && 'border-accent bg-accent-soft',
                  state === 'todo' && 'border-line-strong bg-surface',
                  state === 'right' && 'border-transparent bg-brand text-brand-ink',
                  state === 'wrong' && 'border-line-strong bg-surface-2 text-bad-text',
                )}
                title={`Question ${i + 1}`}
              >
                {state === 'right' && <Icon as={Check} size={14} />}
                {state === 'wrong' && <Icon as={X} size={14} />}
                <span className="sr-only">
                  Question {i + 1}: {state === 'right' ? 'correct' : state === 'wrong' ? 'not correct' : state === 'current' ? 'current' : 'not answered yet'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="quiz-question">
        <h2 id="quiz-question" ref={headingRef} tabIndex={-1} className="atlas-focus-target text-xl leading-snug font-medium text-ink outline-none sm:text-2xl">
          <RichText text={q.question} />
        </h2>

        <ul className="mt-6 grid gap-2" aria-label="Answers">
          {q.options.map((opt, i) => {
            const isRight = i === q.answerIndex
            const isChosen = i === chosen
            const reveal = answered && (isRight || isChosen)
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  disabled={answered}
                  aria-pressed={isChosen}
                  className={cn(
                    // The kit's secondary button, sized up for reading: surface, hairline, a surface step on hover.
                    'flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition-colors duration-150 ease-atlas',
                    !answered && 'border-line-strong bg-surface text-ink hover:bg-surface-2',
                    answered && isRight && 'border-ink-3 bg-surface-2 text-ink',
                    answered && isChosen && !isRight && 'border-line-strong bg-surface-2 text-ink',
                    answered && !reveal && 'border-line bg-surface text-ink-3',
                    answered && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs',
                      answered && isRight ? 'bg-brand text-brand-ink' : answered && isChosen ? 'bg-surface-3 text-bad-text' : 'bg-surface-2 text-ink-2',
                    )}
                    aria-hidden
                  >
                    {answered && isRight ? <Icon as={Check} /> : answered && isChosen ? <Icon as={X} /> : LETTERS[i]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <RichText text={opt} />
                  </span>
                  {answered && isRight && <span className="shrink-0 text-xs font-medium text-ink-2">Correct answer</span>}
                  {answered && isChosen && !isRight && <span className="shrink-0 text-xs font-medium text-bad-text">Your answer</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {!answered && (
          <p className="mt-4 flex items-center gap-1 text-xs text-ink-3 max-sm:hidden">
            Press <kbd className={KEYCAP}>1</kbd>–<kbd className={KEYCAP}>{q.options.length}</kbd> on your keyboard to answer
          </p>
        )}

        {answered && (
          <div className="mt-6 rounded-xl bg-surface-2 p-4 motion-safe:animate-[atlas-pop_180ms_cubic-bezier(0.22,1,0.36,1)]" role="status" aria-live="polite" data-testid="quiz-feedback">
            <p className="font-medium text-ink">{right ? 'Correct' : 'Not this one'}</p>
            {q.explanation && <Markdown className="mt-1 text-[15px] text-ink-2">{q.explanation}</Markdown>}
          </div>
        )}

        {answered && (
          <div className="mt-6 flex justify-end">
            <Button ref={nextRef} variant="primary" size="lg" iconRight={<Icon as={ArrowRight} />} onClick={next}>
              {index + 1 < total ? 'Next question' : 'See my score'}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
