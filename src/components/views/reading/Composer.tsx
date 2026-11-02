import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  /** Enter (or the send button). Not called for an empty question. */
  onSubmit: (value: string) => void
  /** While Claude is answering: show a Stop button instead of Send. */
  busy?: boolean
  onStop?: () => void
  placeholder?: string
  /** Replaces the send button (e.g. "Copy prompt" when there's no key). */
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
  const { value, onChange, onSubmit, busy, onStop, placeholder = 'Ask about this project', action, hint, disabled, className } = props
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
      {/* Outer radius 16 with 8 of padding, so the buttons inside are 8 (nested radius). */}
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-sm transition-colors duration-150 ease-atlas focus-within:border-ink-3 dark:bg-surface-2">
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
          className="max-h-50 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-ink placeholder:text-ink-3 focus-visible:outline-hidden"
        />
        {busy ? (
          <Button variant="secondary" onClick={onStop} icon={<Icon as={Square} size={14} className="fill-current" />}>
            Stop
          </Button>
        ) : (
          (action ?? (
            <Button
              type="submit"
              variant="primary"
              square
              disabled={disabled || !value.trim()}
              aria-label="Send your question"
              title="Send (Enter)"
              icon={<Icon as={ArrowUp} size={18} />}
            />
          ))
        )}
      </div>
      {hint && <div className="mt-2 px-2 text-xs text-ink-3">{hint}</div>}
    </form>
  )
})
