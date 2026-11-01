import { memo, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, RotateCcw, Settings } from 'lucide-react'
import type { AiStatus } from '@/ai'
import { RichText } from '@/components/shell/bits'
import { Button, Markdown } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import type { ChatMessage } from '@/core/types'

export interface ChatBubbleProps {
  message: ChatMessage
  /** This is the reply being written right now. */
  live: boolean
  aiStatus: AiStatus | null
  isCodeLink: (code: string) => boolean
  onCodeClick: (code: string) => boolean
  /** Shown on a failed reply. */
  onRetry?: () => void
  onOpenSettings?: () => void
  /** The failure is about the key (missing or rejected). */
  keyProblem?: boolean
}

function waitingText(status: AiStatus | null): string {
  if (status === 'thinking') return 'Claude is reading the code and thinking it through…'
  if (status === 'writing') return 'Claude is writing…'
  return 'Asking Claude…'
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-brand motion-safe:animate-[atlas-dot_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  if (!text.trim() || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return null
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
          },
          () => undefined,
        )
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      {copied ? <Check className="size-3.5 text-good-text" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? 'Copied' : 'Copy answer'}
    </button>
  )
}

/** One message in the "Ask a Question" chat: the reader's question on the right, Claude's markdown answer on the left. */
export const ChatBubble = memo(function ChatBubble({ message, live, aiStatus, isCodeLink, onCodeClick, onRetry, onOpenSettings, keyProblem }: ChatBubbleProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end motion-safe:animate-[atlas-pop_180ms_ease-out]" data-role="user">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-brand-ink shadow-sm sm:max-w-[75%]">
          <span className="sr-only">You asked: </span>
          <RichText text={message.content} />
        </div>
      </li>
    )
  }

  const empty = !message.content.trim()
  return (
    <li className="flex gap-3" data-role="assistant">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base" aria-hidden>
        ✨
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-sm', message.error && empty && 'bg-surface-2')}>
          <span className="sr-only">Claude answered: </span>
          {empty && live ? (
            <p className="flex items-center gap-2.5 text-sm text-ink-2" role="status">
              <TypingDots />
              {waitingText(aiStatus)}
            </p>
          ) : empty && !message.error ? (
            <p className="text-sm text-ink-3 italic">No answer was written.</p>
          ) : (
            !empty && (
              <Markdown isCodeLink={isCodeLink} onCodeClick={onCodeClick} streaming={live}>
                {message.content}
              </Markdown>
            )
          )}
          {message.error && (
            <div className={cn('flex flex-wrap items-center gap-2', !empty && 'mt-3 border-t border-line pt-3')} role="alert">
              <AlertTriangle className="size-4 shrink-0 text-warn-text" aria-hidden />
              <p className="min-w-0 flex-[1_1_12rem] text-sm text-ink">{message.error}</p>
              {keyProblem && onOpenSettings ? (
                <Button size="sm" variant="primary" onClick={onOpenSettings} icon={<Settings className="size-4" aria-hidden />}>
                  Open Settings
                </Button>
              ) : (
                onRetry && (
                  <Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCcw className="size-3.5" aria-hidden />}>
                    Ask again
                  </Button>
                )
              )}
            </div>
          )}
        </div>
        {!live && !empty && (
          <div className="mt-1 flex">
            <CopyAnswer text={message.content} />
          </div>
        )}
      </div>
    </li>
  )
})
