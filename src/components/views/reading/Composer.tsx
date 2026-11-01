import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/components/ui/cn'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  /** Enter (or the send button). Not called for an empty question. */
  onSubmit: (value: string) => void
  /** While Claude is answering: show a Stop button instead of Send. */
  busy?: boolean
  onStop?: () => void
  placeholder?: string
  /** Replaces the round send button (e.g. "Copy prompt" when there's no key). */
  action?: ReactNode
  /** Small print under the box. */
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

export interface ComposerHandle {
  focus: () => void
}

const MAX_HEIGHT = 200

/** The question box: grows with the text, Enter sends, Shift+Enter starts a new line. */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(props, ref) {
  const { value, onChange, onSubmit, busy, onStop, placeholder = 'Ask anything about this project…', action, hint, disabled, className } = props
  const area = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), [])

  // Grow with the text, up to a limit (then scroll inside).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || disabled || !value.trim()) return
    onSubmit(value.trim())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className={cn('atlas-composer w-full', className)}>
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-md focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
        <label htmlFor={id} className="sr-only">
          Your question
        </label>
        <textarea
          id={id}
          ref={area}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={4000}
          className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-6 text-ink placeholder:text-ink-3 focus-visible:outline-hidden"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
            Stop
          </button>
        ) : (
          (action ?? (
            <button
              type="submit"
              disabled={disabled || !value.trim()}
              aria-label="Send your question"
              title="Send (Enter)"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink shadow-sm hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowUp className="size-5" aria-hidden />
            </button>
          ))
        )}
      </div>
      {hint && <div className="mt-1.5 px-2 text-xs text-ink-3">{hint}</div>}
    </form>
  )
})
