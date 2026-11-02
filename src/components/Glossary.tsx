import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { INLINE_CODE_CLASS, splitCode } from '@/components/shell/bits'
import type { GlossaryTerm } from '@/core/types'
import { findTermsInText, getTerm } from '@/knowledge'
import { useExplain } from '@/state/explain'

const OPEN_DELAY_MS = 120
const CLOSE_DELAY_MS = 180
const POPOVER_WIDTH = 300
const GAP = 8
const EDGE = 8

interface Position {
  top: number
  left: number
  width: number
  placement: 'below' | 'above'
}

/** Where to put a popover of `height` next to `anchor` so it stays inside the viewport. Exported for tests. */
export function placePopover(anchor: DOMRect, height: number, viewport: { width: number; height: number }): Position {
  const width = Math.min(POPOVER_WIDTH, viewport.width - EDGE * 2)
  const centered = anchor.left + anchor.width / 2 - width / 2
  const left = Math.round(Math.min(Math.max(centered, EDGE), viewport.width - width - EDGE))
  const below = anchor.bottom + GAP
  const fitsBelow = below + height <= viewport.height - EDGE
  const above = anchor.top - GAP - height
  if (!fitsBelow && above >= EDGE) return { top: Math.round(above), left, width, placement: 'above' }
  return { top: Math.round(below), left, width, placement: 'below' }
}

/** Inline glossary term with a hover/focus popover (short definition + analogy + "Learn more"). */
export function Term(props: { id: string; children?: ReactNode; className?: string }) {
  const term = getTerm(props.id)
  if (!term) return <>{props.children}</>
  return (
    <TermTrigger term={term} className={props.className}>
      {props.children ?? term.term}
    </TermTrigger>
  )
}

function TermTrigger({ term, children, className }: { term: GlossaryTerm; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const focusLearnMore = useRef(false)
  const popId = useId()
  const descId = `${popId}-desc`
  const openExplain = useExplain((s) => s.open)

  const clearTimer = () => window.clearTimeout(timer.current)
  const show = useCallback(() => {
    clearTimer()
    setOpen(true)
  }, [])
  const hide = useCallback(() => {
    clearTimer()
    setOpen(false)
    setPinned(false)
    setPos(null)
  }, [])
  const later = (fn: () => void, ms: number) => {
    clearTimer()
    timer.current = window.setTimeout(fn, ms)
  }
  useEffect(() => () => clearTimer(), [])

  const reposition = useCallback(() => {
    const t = triggerRef.current
    const p = popRef.current
    if (!t || !p) return
    setPos(placePopover(t.getBoundingClientRect(), p.offsetHeight, { width: window.innerWidth, height: window.innerHeight }))
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    if (focusLearnMore.current) {
      focusLearnMore.current = false
      popRef.current?.querySelector<HTMLElement>('button')?.focus()
    }
  }, [open, reposition])

  // While open: follow the trigger on scroll/resize, close on Escape or a click elsewhere.
  useEffect(() => {
    if (!open) return
    const onScroll = () => reposition()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Capture phase + preventDefault so a surrounding panel doesn't also close on the same key press.
      e.preventDefault()
      e.stopPropagation()
      const hadFocus = popRef.current?.contains(document.activeElement) || document.activeElement === triggerRef.current
      hide()
      if (hadFocus) triggerRef.current?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && (triggerRef.current?.contains(target) || popRef.current?.contains(target))) return
      hide()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, hide, reposition])

  const leaveTo = (next: EventTarget | null) => {
    const n = next as Node | null
    if (n && (triggerRef.current?.contains(n) || popRef.current?.contains(n))) return
    hide()
  }

  const learnMore = () => {
    // Hand focus back to the word first: the explain panel remembers what had focus when it opened and returns there
    // when it closes, and the "Learn more" button is about to disappear with the popover.
    triggerRef.current?.focus({ preventScroll: true })
    hide()
    openExplain({ type: 'term', id: term.id })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'inline cursor-help rounded-xs p-0 text-left underline decoration-ink-3 decoration-dotted decoration-[1.5px] underline-offset-4 transition-[text-decoration-color] duration-150 ease-atlas hover:decoration-ink',
          open && 'decoration-ink',
          className,
        )}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-describedby={open ? descId : undefined}
        title={open ? undefined : `${term.term}: ${term.short}`}
        data-term={term.id}
        onMouseEnter={() => later(show, OPEN_DELAY_MS)}
        onMouseLeave={(e) => {
          if (pinned || document.activeElement === triggerRef.current) return
          const next = e.relatedTarget as Node | null
          if (next && popRef.current?.contains(next)) return
          later(hide, CLOSE_DELAY_MS)
        }}
        onFocus={show}
        onBlur={(e) => leaveTo(e.relatedTarget)}
        onClick={(e) => {
          if (pinned) {
            hide()
            return
          }
          // Keyboard activation (Enter/Space) moves focus into the popover, so "Learn more" is right there.
          const keyboard = e.detail === 0
          if (keyboard && open) popRef.current?.querySelector<HTMLElement>('button')?.focus()
          else if (keyboard) focusLearnMore.current = true
          show()
          setPinned(true)
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={popId}
            role="group"
            aria-label={`What “${term.term}” means`}
            className={cn(
              'fixed z-[60] rounded-xl border border-line bg-surface p-4 text-left text-ink shadow-lg',
              pos ? 'opacity-100' : 'opacity-0',
              'motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-atlas',
            )}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width ?? POPOVER_WIDTH }}
            onMouseEnter={clearTimer}
            onMouseLeave={(e) => {
              if (pinned) return
              const next = e.relatedTarget as Node | null
              if (next && triggerRef.current?.contains(next)) return
              later(hide, CLOSE_DELAY_MS)
            }}
            onBlur={(e) => leaveTo(e.relatedTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                // The popover lives at the end of the page; send focus back to the word it explains.
                e.preventDefault()
                hide()
                triggerRef.current?.focus()
              }
            }}
          >
            <p className="text-xs leading-4 text-ink-3">Glossary</p>
            <p className="mt-1 text-base font-medium text-ink">{term.term}</p>
            <p id={descId} className="mt-1 text-sm leading-relaxed text-ink">
              {term.short}
            </p>
            {term.analogy && (
              <p className="mt-3 flex gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px] leading-5 text-ink-2">
                <Icon as={Lightbulb} size={14} className="mt-0.5 text-ink-3" />
                <span>{term.analogy}</span>
              </p>
            )}
            <button
              type="button"
              onClick={learnMore}
              className="mt-3 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-ink underline-offset-4 hover:underline"
            >
              Learn more
              <Icon as={ArrowRight} size={14} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

interface Segment {
  kind: 'text' | 'code' | 'term'
  text: string
  termId?: string
}

/**
 * Break text into plain, `code` and glossary-term segments. Each term links only at its first mention outside code;
 * at most `max` terms are linked so a paragraph never turns into a sea of underlines. Exported for tests.
 */
export function segmentGlossaryText(text: string, opts?: { only?: string[]; max?: number }): Segment[] {
  const max = opts?.max ?? 8
  const chunks = splitCode(text)
  const codeRanges = chunks.filter((c) => c.code).map((c) => [c.start, c.start + c.text.length + 2] as const)
  const inCode = (start: number, end: number) => codeRanges.some(([a, b]) => start < b && end > a)
  const used = new Set<string>()
  const picked: { start: number; end: number; termId: string }[] = []
  for (const m of findTermsInText(text, { allOccurrences: true, only: opts?.only })) {
    if (picked.length >= max) break
    if (used.has(m.termId) || inCode(m.start, m.end)) continue
    used.add(m.termId)
    picked.push(m)
  }

  const out: Segment[] = []
  for (const chunk of chunks) {
    if (chunk.code) {
      out.push({ kind: 'code', text: chunk.text })
      continue
    }
    let cursor = chunk.start
    const end = chunk.start + chunk.text.length
    for (const m of picked) {
      if (m.start < chunk.start || m.end > end) continue
      if (m.start > cursor) out.push({ kind: 'text', text: text.slice(cursor, m.start) })
      out.push({ kind: 'term', text: text.slice(m.start, m.end), termId: m.termId })
      cursor = m.end
    }
    if (cursor < end) out.push({ kind: 'text', text: text.slice(cursor, end) })
  }
  return out
}

/**
 * Render plain text, auto-linking the first mention of each glossary term (knowledge/findTermsInText).
 * `backticked` bits render as inline code. Pass `only` to restrict which terms may link.
 */
export function GlossaryText(props: { text: string; className?: string; only?: string[]; max?: number }) {
  const { text, only, max } = props
  // Compare `only` by value so callers can pass a fresh array on every render.
  const onlyKey = only?.join('|') ?? ''
  const segments = useMemo(() => segmentGlossaryText(text, { only: onlyKey ? onlyKey.split('|') : undefined, max }), [text, onlyKey, max])
  return (
    <span className={props.className}>
      {segments.map((s, i) =>
        s.kind === 'term' && s.termId ? (
          <Term key={i} id={s.termId}>
            {s.text}
          </Term>
        ) : s.kind === 'code' ? (
          <code key={i} className={INLINE_CODE_CLASS}>
            {s.text}
          </code>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </span>
  )
}
