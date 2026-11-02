import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

/**
 * A segmented control (a radio group drawn as buttons). Works like native radio buttons from the keyboard: Tab reaches
 * the chosen option only, and the arrow keys (plus Home and End) move to another option and choose it.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  describedBy,
  size = 'md',
  className,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  label: string
  /** id of an element with extra help for screen readers. */
  describedBy?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const checkedIndex = options.findIndex((o) => o.value === value)
  // With nothing chosen yet, the first option is the one Tab reaches.
  const tabIndexFor = (i: number) => (i === (checkedIndex >= 0 ? checkedIndex : 0) ? 0 : -1)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = options.length
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next < 0 || !n) return
    e.preventDefault()
    refs.current[next]?.focus()
    if (options[next].value !== value) onChange(options[next].value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndexFor(i)}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              // Nested radius: 8px outer − 2px padding = 6px.
              'rounded-md whitespace-nowrap transition-colors duration-150 ease-atlas',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active ? 'bg-surface font-medium text-ink shadow-sm dark:bg-surface-3 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
