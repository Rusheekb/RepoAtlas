import { memo, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, RotateCcw, Settings } from 'lucide-react'
import type { AiStatus } from '@/ai'
import { RichText } from '@/components/shell/bits'
import { Button, Markdown } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
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

/** Waiting for the first words: three dots that move while Claude works (a live indicator, so it may loop). */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-[atlas-dot_1.2s_ease-in-out_infinite]"
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
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-3 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
    >
      <Icon as={copied ? Check : Copy} size={14} />
      {copied ? 'Copied' : 'Copy answer'}
    </button>
  )
}

/**
 * One message in the "Ask a Question" chat: the reader's question on the right in a raised paper bubble, Claude's
 * markdown answer on the left on the surface.
 */
export const ChatBubble = memo(function ChatBubble({ message, live, aiStatus, isCodeLink, onCodeClick, onRetry, onOpenSettings, keyProblem }: ChatBubbleProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end" data-role="user">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink sm:max-w-[75%]">
          <span className="sr-only">You asked: </span>
          <RichText text={message.content} />
        </div>
      </li>
    )
  }

  const empty = !message.content.trim()
  return (
    <li className="flex" data-role="assistant">
      <div className="min-w-0 flex-1">
        <div className={cn('rounded-2xl rounded-tl-md border border-line bg-surface px-5 py-4', message.error && empty && 'bg-surface-2')}>
          <span className="sr-only">Claude answered: </span>
          {empty && live ? (
            <p className="flex items-center gap-3 text-sm text-ink-2" role="status">
              <TypingDots />
              {waitingText(aiStatus)}
            </p>
          ) : empty && !message.error ? (
            <p className="text-sm text-ink-3">No answer was written</p>
          ) : (
            !empty && (
              <Markdown isCodeLink={isCodeLink} onCodeClick={onCodeClick} streaming={live}>
                {message.content}
              </Markdown>
            )
          )}
          {message.error && (
            <div className={cn('flex flex-wrap items-center gap-2', !empty && 'mt-3 border-t border-line pt-3')} role="alert">
              <Icon as={AlertTriangle} className="text-warn-text" />
              <p className="min-w-0 flex-[1_1_12rem] text-sm text-ink">{message.error}</p>
              {keyProblem && onOpenSettings ? (
                <Button size="sm" variant="primary" onClick={onOpenSettings} icon={<Icon as={Settings} />}>
                  Open Settings
                </Button>
              ) : (
                onRetry && (
                  <Button size="sm" variant="secondary" onClick={onRetry} icon={<Icon as={RotateCcw} />}>
                    Ask again
                  </Button>
                )
              )}
            </div>
          )}
        </div>
        {!live && !empty && (
          <div className="mt-1 flex px-1">
            <CopyAnswer text={message.content} />
          </div>
        )}
      </div>
    </li>
  )
})
