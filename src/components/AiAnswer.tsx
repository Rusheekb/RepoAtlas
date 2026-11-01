import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, ClipboardCopy, KeyRound, RefreshCw, Settings, Sparkles, Square } from 'lucide-react'
import { useCopyPrompt, useExplanation, useHasAiKey, type AiRunState, type AiStatus, type ExplainTask } from '@/ai'
import { Button, Markdown } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { OutboundLink } from '@/components/shell/bits'
import { normalizeCodeRef } from '@/components/shell/urls'
import { useExplain } from '@/state/explain'
import { useRepoStore } from '@/state/repo'
import { useUi } from '@/state/ui'

export interface AiAnswerProps {
  task: ExplainTask
  /** Heading shown above the answer, e.g. "Explained by Claude". */
  title?: string
  /** Label for the run button, e.g. "Explain this file in depth". */
  cta?: string
  /** Run immediately if a key exists and nothing is cached. */
  autoRun?: boolean
  compact?: boolean
  className?: string
  /** One line under the title before anything has been asked (defaults to a friendly pitch). */
  pitch?: string
}

export const CLAUDE_NEW_CHAT_URL = 'https://claude.ai/new'

/** Errors that only the Settings dialog can fix. */
const SETTINGS_ERRORS = new Set(['invalid-key', 'no-key'])

/** Friendly status line for a run. Exported for tests. */
export function statusText(state: AiRunState, aiStatus: AiStatus | null, fromCache: boolean): string | null {
  if (state === 'loading') return aiStatus === 'writing' ? 'Writing…' : 'Claude is reading the code…'
  if (state === 'streaming') return 'Writing…'
  if (state === 'done' && fromCache) return 'Saved answer'
  return null
}

/** The caret that follows streamed text: placed after the last paragraph or list item, not on a new line. */
const STREAM_CARET_CSS = `
.ai-stream > .prose-atlas > :last-child:not(ul):not(ol):not(pre)::after,
.ai-stream > .prose-atlas > :is(ul, ol):last-child > li:last-child::after {
  content: "▍"; margin-left: 2px; color: var(--brand); animation: atlas-caret 1s steps(1) infinite;
}`

/** Copy text to the clipboard. Resolves false when the browser refuses. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  return false
}

/** "Copy a ready-made prompt" button with "Copied!" feedback, and a manual-copy fallback when the clipboard is blocked. */
export function CopyPromptButton({ task, size = 'md' }: { task: ExplainTask; size?: 'sm' | 'md' }) {
  const buildPrompt = useCopyPrompt()
  const [status, setStatus] = useState<'idle' | 'working' | 'copied' | 'manual' | 'error'>('idle')
  const [manualText, setManualText] = useState('')
  const manualId = useId()
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    setStatus('working')
    try {
      const prompt = await buildPrompt(task)
      if (await copyText(prompt)) {
        setStatus('copied')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setStatus('idle'), 2500)
      } else {
        setManualText(prompt)
        setStatus('manual')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <Button
        size={size}
        variant="secondary"
        onClick={() => void copy()}
        loading={status === 'working'}
        icon={status === 'copied' ? <Check className="size-4 text-good-text" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
      >
        {status === 'copied' ? 'Copied!' : 'Copy a ready-made prompt'}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? 'Prompt copied to your clipboard' : ''}
      </span>
      {status === 'error' && <p className="basis-full text-sm text-bad-text">Sorry, we couldn’t build the prompt. Please try again.</p>}
      {status === 'manual' && (
        <div className="basis-full">
          <label className="text-sm text-ink-2" htmlFor={manualId}>
            Your browser didn’t let us copy automatically. Select the text below and copy it yourself:
          </label>
          <textarea
            id={manualId}
            readOnly
            value={manualText}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 h-32 w-full resize-y rounded-xl border border-line-strong bg-surface-2 p-3 font-mono text-xs text-ink"
          />
        </div>
      )}
    </>
  )
}

/** What to show when there is no Claude key: how to add one, or how to ask Claude yourself. */
function NoKeyCard({ task, compact }: { task: ExplainTask; compact?: boolean }) {
  const openSettings = useUi((s) => s.openSettings)
  return (
    <div data-testid="ai-no-key">
      <p className="text-sm leading-relaxed text-ink-2">
        Claude, an AI assistant, can read the actual code and explain this in depth, at your reading level. Add your own Claude API key
        to ask right here, or copy a ready-made prompt and paste it into Claude yourself.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size={compact ? 'sm' : 'md'} variant="primary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => openSettings('ai')}>
          Add your Claude API key
        </Button>
        <CopyPromptButton task={task} size={compact ? 'sm' : 'md'} />
        <OutboundLink href={CLAUDE_NEW_CHAT_URL} className="px-1 text-sm">
          Open claude.ai
        </OutboundLink>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2.5 pt-1" aria-hidden>
      {[92, 100, 84, 68].map((w, i) => (
        <div key={i} className="h-3 rounded-full bg-surface-3 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

/**
 * Reusable "deep explanation" block: shows a cached answer, or a button to ask Claude, streams the markdown answer
 * with a friendly status line, handles errors (bad key → open Settings), offers "Regenerate", and — when there's no
 * API key — explains how to add one and offers "Copy a ready-made prompt for claude.ai".
 */
export function AiAnswer(props: AiAnswerProps) {
  const { task, title = 'Explained by Claude', cta = 'Explain this in depth', autoRun, compact, className, pitch } = props
  const hasKey = useHasAiKey()
  const { text, state, aiStatus, error, errorKind, fromCache, run, cancel } = useExplanation(task, { autoRun })
  const analysis = useRepoStore((s) => s.analysis)
  const openExplain = useExplain((s) => s.open)
  const openSettings = useUi((s) => s.openSettings)

  const isCodeLink = useCallback((code: string) => Boolean(analysis && normalizeCodeRef(code) in analysis.files), [analysis])
  const onCodeClick = useCallback(
    (code: string) => {
      const path = normalizeCodeRef(code)
      if (!analysis || !(path in analysis.files)) return false
      openExplain({ type: 'file', path })
      return true
    },
    [analysis, openExplain],
  )

  const busy = state === 'loading' || state === 'streaming'
  const status = statusText(state, aiStatus, fromCache)
  const hasText = text.trim().length > 0
  const showNoKey = !hasKey && !busy && (state === 'idle' || errorKind === 'no-key') && !hasText

  return (
    <section
      className={cn('rounded-2xl border border-line bg-surface', compact ? 'p-4' : 'p-5 sm:p-6', className)}
      aria-label={title}
      aria-busy={busy || undefined}
      data-testid="ai-answer"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={cn('flex min-w-0 items-center gap-2 font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text" aria-hidden>
            <Sparkles className="size-4" />
          </span>
          {title}
        </h3>
        <p role="status" aria-live="polite" className="ml-auto flex items-center gap-1.5 text-xs font-medium text-ink-3" data-testid="ai-status">
          {status && (
            <>
              {busy ? (
                <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse" aria-hidden />
              ) : (
                <Check className="size-3.5 text-good-text" aria-hidden />
              )}
              <span title={fromCache && !busy ? 'Saved on this device, so showing it again is instant and free.' : undefined}>{status}</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-3">
        {showNoKey ? (
          <NoKeyCard task={task} compact={compact} />
        ) : state === 'idle' && !hasText ? (
          <div>
            <p className="text-sm leading-relaxed text-ink-2">
              {pitch ?? 'Claude will read the actual code and explain it at your reading level, with links to the files it mentions.'}
            </p>
            <Button className="mt-3" size={compact ? 'sm' : 'md'} variant="primary" icon={<Sparkles className="size-4" aria-hidden />} onClick={run}>
              {cta}
            </Button>
          </div>
        ) : (
          <>
            {state === 'loading' && !hasText && <Skeleton />}
            {hasText && (
              <div className={cn(state === 'streaming' && 'ai-stream')}>
                {state === 'streaming' && <style>{STREAM_CARET_CSS}</style>}
                <Markdown isCodeLink={isCodeLink} onCodeClick={onCodeClick} className={cn(compact && 'text-[0.94rem]')}>
                  {text}
                </Markdown>
              </div>
            )}
            {state === 'error' && error && (
              <div className="mt-3 rounded-xl border border-line bg-surface-2 px-4 py-3" role="alert">
                <p className="text-sm leading-relaxed text-bad-text">{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      {(busy || state === 'done' || (state === 'error' && !showNoKey)) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {busy && (
            <Button size="sm" variant="secondary" icon={<Square className="size-3.5" aria-hidden />} onClick={cancel}>
              Stop
            </Button>
          )}
          {state === 'error' && errorKind && SETTINGS_ERRORS.has(errorKind) && (
            <Button size="sm" variant="primary" icon={<Settings className="size-4" aria-hidden />} onClick={() => openSettings('ai')}>
              Open Settings
            </Button>
          )}
          {state === 'error' && hasKey && (
            <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={run}>
              Try again
            </Button>
          )}
          {state === 'done' && hasKey && (
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={run} title="Ask Claude to write a fresh answer">
              Regenerate
            </Button>
          )}
          {state === 'done' && !hasKey && (
            <button type="button" onClick={() => openSettings('ai')} className="text-xs font-medium text-brand-text hover:underline">
              Add a Claude key to write a fresh answer
            </button>
          )}
        </div>
      )}
    </section>
  )
}
