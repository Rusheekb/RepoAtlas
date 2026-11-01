import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, KeyRound, RefreshCw, Settings, Sparkles, X } from 'lucide-react'
import { useCopyPrompt, type AiRunState, type AiStatus, type PromptTask } from '@/ai'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatCompact } from '@/core/format'
import { useUi } from '@/state/ui'

export const CLAUDE_NEW_CHAT_URL = 'https://claude.ai/new'

/** Friendly status line for a Claude call in progress. */
export function aiStatusText(status: AiStatus | null): string {
  switch (status) {
    case 'connecting':
      return 'Connecting to Claude…'
    case 'thinking':
      return 'Claude is reading the code and thinking it through…'
    case 'writing':
      return 'Claude is writing it up…'
    case 'done':
      return 'Almost done…'
    default:
      return 'Getting started…'
  }
}

/** Error kinds that are fixed in Settings (a missing or rejected key). */
export function isKeyProblem(kind: string | null | undefined): boolean {
  return kind === 'invalid-key' || kind === 'no-key'
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy a ready-made prompt (for readers without an API key)
// ─────────────────────────────────────────────────────────────────────────────

export function CopyPromptButton({
  task,
  label = 'Copy a prompt for claude.ai',
  shortLabel = 'Copy a prompt',
  size = 'sm',
  variant = 'secondary',
}: {
  task: PromptTask
  label?: string
  /** Shown instead of `label` on phones. */
  shortLabel?: string
  size?: 'sm' | 'md'
  variant?: 'secondary' | 'ghost'
}) {
  const copyPrompt = useCopyPrompt()
  const [status, setStatus] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle')
  const [manual, setManual] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const onClick = async () => {
    setStatus('working')
    let text: string
    try {
      text = await copyPrompt(task)
    } catch {
      setStatus('failed')
      return
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus('idle'), 2500)
    } catch {
      // The browser blocked the clipboard: show the prompt so it can be copied by hand.
      setStatus('idle')
      setManual(text)
    }
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => void onClick()}
        loading={status === 'working'}
        icon={status === 'copied' ? <Check className="size-4 text-good-text" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
      >
        {status === 'copied' ? (
          'Copied! Now paste it into Claude'
        ) : (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="max-sm:hidden">{label}</span>
          </>
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {status === 'copied' ? 'Prompt copied to your clipboard.' : status === 'failed' ? 'Sorry, we could not build the prompt.' : ''}
      </span>
      {status === 'failed' && <span className="text-xs text-bad-text">Sorry, something went wrong building the prompt.</span>}
      <Modal
        open={manual != null}
        onClose={() => setManual(null)}
        title="Copy this prompt"
        description="Your browser didn’t let us copy automatically. Select all the text below, copy it, then paste it into a new chat on claude.ai."
        footer={
          <>
            <a
              href={CLAUDE_NEW_CHAT_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-brand-text hover:bg-brand-soft"
            >
              Open claude.ai <ExternalLink className="size-4" aria-hidden />
            </a>
            <Button variant="primary" onClick={() => setManual(null)}>
              Done
            </Button>
          </>
        }
      >
        <label className="sr-only" htmlFor="atlas-manual-prompt">
          Prompt for Claude
        </label>
        <textarea
          id="atlas-manual-prompt"
          readOnly
          value={manual ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          className="h-72 w-full resize-none rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs text-ink"
        />
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress while Claude works
// ─────────────────────────────────────────────────────────────────────────────

export function AiProgress({
  label,
  status,
  progressChars,
  onCancel,
  className,
}: {
  label: string
  status: AiStatus | null
  progressChars: number
  onCancel: () => void
  className?: string
}) {
  // Output length is unknown up front, so the bar eases towards full as text streams in (never claiming "done").
  const fraction = progressChars > 0 ? 0.12 + 0.83 * (1 - Math.exp(-progressChars / 4000)) : 0.06
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-brand-soft px-4 py-3.5', className)}
      data-testid="ai-progress"
    >
      <Sparkles className="size-5 shrink-0 text-brand-text motion-safe:animate-pulse" aria-hidden />
      <div className="min-w-0 flex-[1_1_14rem]">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-2" aria-live="polite">
          {aiStatusText(status)}
          {progressChars > 0 && <span className="tabular-nums"> · {formatCompact(progressChars)} characters written so far</span>}
        </p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuetext={aiStatusText(status)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full rounded-full bg-brand motion-safe:transition-[width] motion-safe:duration-700"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onCancel} icon={<X className="size-4" aria-hidden />}>
        Cancel
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The callout: add a key / generate / progress / error
// ─────────────────────────────────────────────────────────────────────────────

export interface AiAssistProps {
  hasKey: boolean
  /** True while Claude is working on this. */
  busy: boolean
  state: AiRunState
  aiStatus: AiStatus | null
  progressChars: number
  error: string | null
  errorKind: string | null
  /** Whether Claude's version already exists. */
  hasData: boolean
  onGenerate: () => void
  onCancel: () => void
  /** e.g. "Generate a smarter map with Claude" */
  generateLabel: string
  /** e.g. "Regenerate with Claude" */
  regenerateLabel?: string
  /** Shown while working, e.g. "Claude is drawing a smarter map". */
  busyLabel: string
  /** Why Claude helps here, in one or two plain sentences. */
  pitch: ReactNode
  /** Shown next to "Regenerate" once Claude's version exists. */
  doneNote?: ReactNode
  /** The ready-made prompt readers without a key can paste into claude.ai. */
  promptTask: PromptTask
  /** Extra controls under the callout when a key is set (e.g. "Ask for a tour"). */
  children?: ReactNode
  className?: string
}

/**
 * Everything AI around a visual view, in one calm card: an invitation to add a key (or copy a prompt) when there is
 * none, a "Generate … with Claude" button, live progress with Cancel while Claude works, and friendly errors
 * (a bad key gets an "Open Settings" button).
 */
export function AiAssist({
  hasKey,
  busy,
  aiStatus,
  progressChars,
  error,
  errorKind,
  hasData,
  onGenerate,
  onCancel,
  generateLabel,
  regenerateLabel = 'Regenerate with Claude',
  busyLabel,
  pitch,
  doneNote,
  promptTask,
  children,
  className,
}: AiAssistProps) {
  const openSettings = useUi((s) => s.openSettings)

  if (busy) return <AiProgress className={className} label={busyLabel} status={aiStatus} progressChars={progressChars} onCancel={onCancel} />

  const errorBox = error ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-sm"
      data-testid="ai-error"
    >
      <AlertTriangle className="size-5 shrink-0 text-warn-text" aria-hidden />
      <p className="min-w-0 flex-[1_1_16rem] text-sm text-ink">{error}</p>
      <div className="flex flex-wrap gap-2">
        {isKeyProblem(errorKind) ? (
          <Button size="sm" variant="primary" onClick={() => openSettings('ai')} icon={<Settings className="size-4" aria-hidden />}>
            Open Settings
          </Button>
        ) : (
          hasKey && (
            <Button size="sm" variant="secondary" onClick={onGenerate} icon={<RefreshCw className="size-4" aria-hidden />}>
              Try again
            </Button>
          )
        )}
      </div>
    </div>
  ) : null

  if (!hasKey) {
    return (
      <div className={cn('space-y-3', className)}>
        {errorBox}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-sm" data-testid="ai-callout">
          <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg sm:flex" aria-hidden>
            ✨
          </span>
          <div className="min-w-0 flex-[1_1_18rem] text-sm text-ink-2">
            <p className="font-medium text-ink">
              <span className="sm:hidden" aria-hidden>
                ✨{' '}
              </span>
              Want Claude’s take?
            </p>
            <p className="mt-0.5">
              {pitch}{' '}
              <span className="max-sm:hidden">Add your own Claude key (it stays in this browser), or copy a ready-made prompt and paste it into </span>
              <span className="sm:hidden">Add a key, or copy a prompt for </span>
              <a href={CLAUDE_NEW_CHAT_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-text underline underline-offset-2">
                claude.ai
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => openSettings('ai')} icon={<KeyRound className="size-4" aria-hidden />}>
              Add a Claude key
            </Button>
            <CopyPromptButton task={promptTask} />
          </div>
        </div>
      </div>
    )
  }

  // A failed first attempt: the error (with "Try again") says it all.
  if (errorBox && !hasData) {
    return (
      <div className={cn('space-y-3', className)}>
        {errorBox}
        {children}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {errorBox}
      {hasData ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
            <Sparkles className="size-4 shrink-0 text-brand-text" aria-hidden />
            {doneNote ?? 'Made by Claude from the actual code.'}
          </p>
          <Button size="sm" variant="ghost" onClick={onGenerate} icon={<RefreshCw className="size-4" aria-hidden />}>
            {regenerateLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-sm" data-testid="ai-callout">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg" aria-hidden>
            ✨
          </span>
          <p className="min-w-0 flex-[1_1_18rem] text-sm text-ink-2">
            <span className="font-medium text-ink">Claude is ready to help. </span>
            {pitch}
          </p>
          <Button variant="primary" size="sm" onClick={onGenerate} icon={<Sparkles className="size-4" aria-hidden />}>
            {generateLabel}
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}
