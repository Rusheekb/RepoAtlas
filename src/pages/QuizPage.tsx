import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useHasAiKey, useQuiz } from '@/ai'
import { useRepoNav } from '@/components/shell/hooks'
import { EmptyState, Segmented } from '@/components/ui'
import { AiAssist } from '@/components/views/visual/AiAssist'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { QuizRunner } from '@/components/views/reading/QuizRunner'
import { buildStarterQuiz, validQuestions } from '@/components/views/reading/starterQuiz'
import { VIEW_INFO } from '@/core/labels'
import { useProgress } from '@/state/progress'
import { useAnalysis } from '@/state/repo'
import '@/components/views/reading/reading.css'

type Source = 'ai' | 'starter'

const HINT = 'A few quick questions to check what you’ve picked up. No pressure: you can try again as often as you like.'

/**
 * "Test Yourself": a quiz about this project. A starter quiz is built instantly from the analysis (no AI needed); with a
 * Claude key, "Generate a quiz with Claude" writes one from the actual code. One question at a time, instant feedback
 * with an explanation, then a score, a review, "Try again" and "New quiz".
 */
export default function QuizPage() {
  const analysis = useAnalysis()
  const hasKey = useHasAiKey()
  const ai = useQuiz()
  const { href } = useRepoNav()
  const markSeen = useProgress((s) => s.markSeen)
  const [seed, setSeed] = useState(1)
  const [choice, setChoice] = useState<Source | null>(null)
  const [round, setRound] = useState(0)
  const info = VIEW_INFO.quiz

  const starter = useMemo(() => buildStarterQuiz(analysis, { seed }).questions, [analysis, seed])
  const aiQuestions = useMemo(() => validQuestions(ai.data), [ai.data])
  const hasAi = aiQuestions.length > 0
  const source: Source = choice ?? (hasAi ? 'ai' : 'starter')
  const questions = source === 'ai' && hasAi ? aiQuestions : starter
  const busy = ai.state === 'loading' || ai.state === 'streaming'

  // When Claude finishes a fresh quiz, switch to it.
  const prevData = useRef(ai.data)
  useEffect(() => {
    if (ai.data && ai.data !== prevData.current && !ai.fromCache) {
      setChoice('ai')
      setRound((r) => r + 1)
    }
    prevData.current = ai.data
  }, [ai.data, ai.fromCache])

  const newQuiz = useCallback(() => {
    if (source === 'ai' && hasKey) {
      ai.run()
      return
    }
    setChoice('starter')
    setSeed((s) => s + 1)
    setRound((r) => r + 1)
  }, [source, hasKey, ai])

  const onFinish = useCallback(() => markSeen(analysis.meta.fullName, `quiz:${source}`), [markSeen, analysis.meta.fullName, source])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6" data-testid="quiz-page">
      <ViewHeader emoji={info.emoji} title={info.label} hint={HINT} />

      <AiAssist
        hasKey={hasKey}
        busy={busy}
        state={ai.state}
        aiStatus={ai.aiStatus}
        progressChars={ai.progressChars}
        error={ai.error}
        errorKind={ai.errorKind}
        hasData={hasAi}
        stale={Boolean(ai.stale)}
        onGenerate={ai.run}
        onCancel={ai.cancel}
        generateLabel="Generate a quiz with Claude"
        regenerateLabel="Write a new quiz with Claude"
        busyLabel="Claude is writing your quiz"
        pitch="This starter quiz was put together from how the project is organized. Claude can read the actual code and ask about how it really works."
        doneNote="Claude wrote a quiz from the actual code."
        promptTask={{ kind: 'quiz' }}
      />

      {hasAi && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-2">{source === 'ai' ? 'Questions written by Claude.' : 'Questions put together from the project’s structure.'}</p>
          <Segmented<Source>
            label="Which quiz"
            size="sm"
            value={source}
            onChange={(v) => {
              setChoice(v)
              setRound((r) => r + 1)
            }}
            options={[
              { value: 'ai', label: '✨ Claude’s quiz' },
              { value: 'starter', label: '🧭 Starter quiz' },
            ]}
          />
        </div>
      )}

      {questions.length === 0 ? (
        <EmptyState icon="🎓" title="No questions yet">
          We couldn’t find enough in this project to ask about on our own.
          {hasKey ? ' Ask Claude to write a quiz with the button above.' : ' Add a Claude key in Settings and Claude can write one for you.'}
        </EmptyState>
      ) : (
        <QuizRunner
          key={`${source}:${source === 'starter' ? seed : 'ai'}:${round}`}
          questions={questions}
          onNewQuiz={newQuiz}
          newQuizLabel={source === 'ai' && hasKey ? 'New quiz from Claude' : 'New quiz'}
          onFinish={onFinish}
          afterScore={
            <p>
              Want to learn more? Take a{' '}
              <Link to={href('tours')} className="font-medium text-brand-text underline underline-offset-2">
                guided tour
              </Link>{' '}
              or{' '}
              <Link to={href('explore')} className="font-medium text-brand-text underline underline-offset-2">
                read the code
              </Link>{' '}
              with notes alongside.
            </p>
          }
        />
      )}
    </div>
  )
}
