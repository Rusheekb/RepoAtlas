import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { cn } from '@/components/ui/cn'
import { basename } from '@/core/paths'
import { highlightLines, type CodeToken, type CodeTokenLine } from './highlighter'
import { grammarFor } from './languages'

export interface CodeViewerProps {
  path: string
  code: string
  /** Display language name from analysis (e.g. "TypeScript") — mapped to a Shiki grammar. */
  language: string | null
  /** Line number of the first line of `code` (default 1) — lets callers show an excerpt with its real line numbers. */
  firstLineNumber?: number
  /** Cap the visible height (px) and scroll inside; default: grow with content. */
  maxHeight?: number
  /** 1-based inclusive range (in real file line numbers) to highlight and scroll into view. */
  highlight?: { start: number; end: number } | null
  /** Called when the user selects a range of lines (click line number, shift-click to extend). */
  onSelectLines?: (range: { start: number; end: number } | null) => void
  className?: string
  /**
   * Change this to scroll the highlighted lines into view again, even when the range itself didn't change
   * (e.g. the reader clicks the same outline entry twice).
   */
  scrollKey?: string | number
}

export type LineRange = { start: number; end: number }

/** Every row is exactly this tall, so any line's position is known without measuring. */
export const LINE_HEIGHT = 20
/** Above this many lines the code is shown as plain text (coloring would take too long). */
export const MAX_HIGHLIGHT_LINES = 4000
/** …or above this many characters. */
const MAX_HIGHLIGHT_CHARS = 600_000
/** From this many lines on, only the rows near the visible area are put on the page. */
export const VIRTUALIZE_FROM = 2000
/** Extra rows rendered above and below the visible area when windowing. */
const OVERSCAN = 30
/** Rows to render before the viewer has measured itself. */
const INITIAL_ROWS = 80
/** Breathing room above the first line and below the last (px). */
export const CODE_PADDING = 8
const TAB_SIZE = 4

/** Split code into display lines: normalizes line endings and drops the empty "line" after a final newline. */
export function splitLines(code: string): string[] {
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function visualWidth(line: string): number {
  let w = 0
  for (const ch of line) w += ch === '\t' ? TAB_SIZE - (w % TAB_SIZE) : 1
  return w
}

function sameRange(a: LineRange | null | undefined, b: LineRange | null | undefined): boolean {
  return (a?.start ?? null) === (b?.start ?? null) && (a?.end ?? null) === (b?.end ?? null)
}

function tokenStyle(t: CodeToken): CSSProperties | undefined {
  if (!t.light && !t.dark && !t.italic && !t.bold) return undefined
  const style: Record<string, string> = {}
  if (t.light) style['--shiki-light'] = t.light
  if (t.dark) style['--shiki-dark'] = t.dark
  if (t.italic) style.fontStyle = 'italic'
  if (t.bold) style.fontWeight = '600'
  return style as CSSProperties
}

interface RowProps {
  n: number
  text: string
  tokens: CodeTokenLine | null
  selected: boolean
  gutterWidth: string
  selectable: boolean
}

/** The empty strip above the first line / below the last, so the line-number column runs edge to edge. */
function PadRow({ gutterWidth }: { gutterWidth: string }) {
  return (
    <div className="flex" style={{ height: CODE_PADDING }} aria-hidden>
      <span className="sticky left-0 z-[1] shrink-0 border-r border-line bg-surface-2" style={{ width: gutterWidth }} />
    </div>
  )
}

const Row = memo(function Row({ n, text, tokens, selected, gutterWidth, selectable }: RowProps) {
  return (
    <div className={cn('flex', selected && 'bg-brand-soft')} style={{ height: LINE_HEIGHT }} data-line={n} data-selected={selected || undefined}>
      <span
        data-gutter={n}
        aria-hidden
        className={cn(
          'sticky left-0 z-[1] shrink-0 border-r pr-3 pl-3 text-right tabular-nums select-none',
          selected ? 'border-line bg-brand-soft font-semibold text-brand-text' : 'border-line bg-surface-2 text-ink-3',
          selectable && 'cursor-pointer hover:text-ink',
        )}
        style={{ width: gutterWidth, boxShadow: selected ? 'inset 3px 0 0 var(--brand)' : undefined }}
      >
        {n}
      </span>
      <span className="shiki block grow pr-6 pl-4 whitespace-pre text-ink">
        {tokens
          ? tokens.map((t, i) => (
              <span key={i} style={tokenStyle(t)}>
                {t.content}
              </span>
            ))
          : text || ' '}
      </span>
    </div>
  )
})

/** Syntax-highlighted code with line numbers (Shiki, lazy-loaded, dual light/dark theme), line selection, and a plain-text fallback while loading or for huge files. */
export function CodeViewer(props: CodeViewerProps) {
  const { path, code, language, firstLineNumber = 1, maxHeight, highlight = null, onSelectLines, className, scrollKey } = props
  const hintId = useId()
  const lines = useMemo(() => splitLines(code), [code])
  const lastLine = firstLineNumber + lines.length - 1
  const grammar = grammarFor(language, path)
  const canColor = grammar !== null && lines.length <= MAX_HIGHLIGHT_LINES && code.length <= MAX_HIGHLIGHT_CHARS
  const selectable = Boolean(onSelectLines)

  // ── Coloring (async, in batches; plain text shows until it's ready) ──────────
  const [colored, setColored] = useState<{ lines: readonly string[]; tokens: CodeTokenLine[] } | null>(null)
  useEffect(() => {
    if (!canColor || !grammar) return
    const ctrl = new AbortController()
    highlightLines(lines, grammar, {
      signal: ctrl.signal,
      onProgress: (tokens) => {
        if (!ctrl.signal.aborted) setColored({ lines, tokens })
      },
    }).catch(() => {
      /* Couldn't load the highlighter (offline?) — plain text is fine. */
    })
    return () => ctrl.abort()
  }, [lines, grammar, canColor])
  const tokens = colored && colored.lines === lines ? colored.tokens : null

  // ── Sizing & windowing ───────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null)
  const windowed = lines.length >= VIRTUALIZE_FROM
  const [view, setView] = useState({ top: 0, height: 0 })
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !windowed) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setView({ top: el.scrollTop, height: el.clientHeight }))
    }
    setView({ top: el.scrollTop, height: el.clientHeight })
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [windowed])

  const topRow = Math.floor(Math.max(0, view.top - CODE_PADDING) / LINE_HEIGHT)
  const first = windowed ? Math.max(0, topRow - OVERSCAN) : 0
  const visibleRows = view.height > 0 ? Math.ceil(view.height / LINE_HEIGHT) : INITIAL_ROWS
  const last = windowed ? Math.min(lines.length, topRow + visibleRows + OVERSCAN) : lines.length

  const digits = String(Math.max(lastLine, 1)).length
  const gutterWidth = `calc(${digits}ch + 1.5rem + 1px)`
  const maxCols = useMemo(() => lines.reduce((m, l) => Math.max(m, l.length > 4000 ? l.length : visualWidth(l)), 0), [lines])
  const contentStyle: CSSProperties = {
    height: lines.length * LINE_HEIGHT + 2 * CODE_PADDING,
    minWidth: `max(100%, calc(${gutterWidth} + ${maxCols}ch + 2.5rem))`,
    tabSize: TAB_SIZE,
  }

  // ── Scrolling the highlight into view ────────────────────────────────────────
  /** The range this viewer itself last reported, so the reader's own clicks don't make the code jump. */
  const emitted = useRef<LineRange | null>(null)
  const anchor = useRef<number | null>(null)
  const prevScrollKey = useRef(scrollKey)

  const scrollToRange = useCallback(
    (range: LineRange, mode: 'center' | 'nearest') => {
      const el = scrollRef.current
      if (!el) return
      const startIdx = Math.max(0, Math.min(lines.length - 1, range.start - firstLineNumber))
      const endIdx = Math.max(startIdx, Math.min(lines.length - 1, range.end - firstLineNumber))
      const top = CODE_PADDING + startIdx * LINE_HEIGHT
      const bottom = CODE_PADDING + (endIdx + 1) * LINE_HEIGHT
      if (el.scrollHeight > el.clientHeight + 1) {
        if (top >= el.scrollTop && bottom <= el.scrollTop + el.clientHeight) return
        if (mode === 'nearest') {
          el.scrollTop = top < el.scrollTop ? top : Math.max(0, bottom - el.clientHeight)
        } else {
          el.scrollTop = Math.max(0, top - Math.round(el.clientHeight / 3))
        }
        return
      }
      // The viewer grows with its content, so the page (or a parent) scrolls instead.
      const row = el.querySelector<HTMLElement>(`[data-line="${range.start}"]`)
      row?.scrollIntoView?.({ block: mode === 'center' ? 'center' : 'nearest' })
    },
    [lines.length, firstLineNumber],
  )

  const hlStart = highlight?.start
  const hlEnd = highlight?.end
  useEffect(() => {
    const forced = prevScrollKey.current !== scrollKey
    prevScrollKey.current = scrollKey
    if (hlStart == null || hlEnd == null) return
    const range = { start: hlStart, end: hlEnd }
    if (!forced && sameRange(emitted.current, range)) return
    scrollToRange(range, 'center')
  }, [hlStart, hlEnd, scrollKey, code, scrollToRange])

  // ── Selecting lines ──────────────────────────────────────────────────────────
  const dragging = useRef(false)
  const emit = useCallback(
    (range: LineRange | null) => {
      emitted.current = range
      onSelectLines?.(range)
    },
    [onSelectLines],
  )

  useEffect(() => {
    if (!selectable) return
    const stop = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [selectable])

  const gutterLine = (e: MouseEvent): number | null => {
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-gutter]') : null
    const n = target ? Number(target.dataset.gutter) : NaN
    return Number.isFinite(n) ? n : null
  }

  /** How the last press started: touch and pen taps are handled on click (so a scroll that starts on a number doesn't select). */
  const pointerKind = useRef<string>('mouse')

  /** Touch: tap a number to pick it, tap another to stretch the selection to it, tap the picked line again to clear. */
  const onClick = (e: MouseEvent) => {
    if (!selectable || pointerKind.current === 'mouse') return
    const n = gutterLine(e)
    if (n == null) return
    const single = highlight && highlight.start === highlight.end ? highlight.start : null
    if (single === n) {
      anchor.current = null
      emit(null)
    } else if (single != null) {
      anchor.current = single
      emit({ start: Math.min(single, n), end: Math.max(single, n) })
    } else {
      anchor.current = n
      emit({ start: n, end: n })
    }
  }

  const onMouseDown = (e: MouseEvent) => {
    if (!selectable || e.button !== 0 || pointerKind.current !== 'mouse') return
    const n = gutterLine(e)
    if (n == null) return
    e.preventDefault()
    const from = anchor.current ?? highlight?.start ?? null
    if (e.shiftKey && from != null) {
      emit({ start: Math.min(from, n), end: Math.max(from, n) })
      return
    }
    if (highlight && highlight.start === n && highlight.end === n) {
      anchor.current = null
      emit(null)
      return
    }
    anchor.current = n
    dragging.current = true
    emit({ start: n, end: n })
  }

  const onMouseOver = (e: MouseEvent) => {
    if (!dragging.current || anchor.current == null) return
    if ((e.buttons & 1) === 0) {
      dragging.current = false
      return
    }
    const n = gutterLine(e)
    if (n == null) return
    const range = { start: Math.min(anchor.current, n), end: Math.max(anchor.current, n) }
    if (!sameRange(range, highlight)) emit(range)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable) return
    if (e.key === 'Escape' && highlight) {
      e.preventDefault()
      anchor.current = null
      emit(null)
      return
    }
    if (!e.shiftKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    const el = scrollRef.current
    const firstVisible = firstLineNumber + Math.floor(Math.max(0, (el?.scrollTop ?? 0) - CODE_PADDING) / LINE_HEIGHT)
    const from = anchor.current ?? highlight?.start ?? Math.min(firstVisible, lastLine)
    anchor.current = from
    const moving = highlight ? (highlight.start === from ? highlight.end : highlight.start) : from
    const next = highlight ? Math.max(firstLineNumber, Math.min(lastLine, moving + (e.key === 'ArrowDown' ? 1 : -1))) : from
    const range = { start: Math.min(from, next), end: Math.max(from, next) }
    emit(range)
    scrollToRange({ start: next, end: next }, 'nearest')
  }

  const selStart = highlight ? Math.min(highlight.start, highlight.end) : null
  const selEnd = highlight ? Math.max(highlight.start, highlight.end) : null
  const isSelected = (n: number) => selStart != null && selEnd != null && n >= selStart && n <= selEnd

  const rows = []
  for (let i = first; i < last; i++) {
    const n = firstLineNumber + i
    rows.push(
      <Row
        key={n}
        n={n}
        text={lines[i]}
        tokens={tokens?.[i] ?? null}
        selected={isSelected(n)}
        gutterWidth={gutterWidth}
        selectable={selectable}
      />,
    )
  }

  const selectionNote =
    selStart != null && selEnd != null && selectable ? (selStart === selEnd ? `Line ${selStart} selected.` : `Lines ${selStart} to ${selEnd} selected.`) : ''

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`Code of ${basename(path) || 'this file'}`}
      aria-describedby={selectable ? hintId : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        'relative overflow-auto bg-surface font-mono text-[13px] leading-5 text-ink outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
        className,
      )}
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="code-viewer"
      data-highlighted={tokens ? 'true' : 'false'}
    >
      {selectable && (
        <>
          <span id={hintId} className="sr-only">
            Click a line number to pick that line, and Shift-click another line number to pick everything in between. From the
            keyboard, hold Shift and press the up or down arrow. Press Escape to clear the selection.
          </span>
          <span className="sr-only" role="status" aria-live="polite">
            {selectionNote}
          </span>
        </>
      )}
      <div
        className="relative"
        style={contentStyle}
        onPointerDown={(e) => {
          pointerKind.current = e.pointerType || 'mouse'
        }}
        onMouseDown={onMouseDown}
        onMouseOver={onMouseOver}
        onClick={onClick}
      >
        <PadRow gutterWidth={gutterWidth} />
        <div style={first > 0 ? { transform: `translateY(${first * LINE_HEIGHT}px)` } : undefined}>
          {rows}
          {last >= lines.length && <PadRow gutterWidth={gutterWidth} />}
        </div>
      </div>
    </div>
  )
}
