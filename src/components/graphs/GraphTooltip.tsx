import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'

/** Structured tooltip content. Rendered as plain text only (repo data is untrusted). */
export interface TooltipContent {
  title: string
  subtitle?: string
  /** Identity color shown as a short line-key before the title. */
  color?: string
  /** Values lead, labels follow ("1,204 · lines"). */
  rows?: { value: string; label?: string; color?: string }[]
  description?: string
  /** A short "what happens if you click" hint. */
  hint?: string
}

export type TooltipAnchor = { clientX: number; clientY: number } | { rect: DOMRect }

export interface GraphTooltipHandle {
  show: (content: TooltipContent, at: TooltipAnchor) => void
  move: (at: TooltipAnchor) => void
  hide: () => void
}

export interface GraphTooltipProps {
  /** The positioned (relative) element the tooltip lives in. */
  containerRef: RefObject<HTMLElement | null>
  /** 'pointer': beside the pointer, kept inside the container. 'above': centered above the pointer (for thin bars). */
  placement?: 'pointer' | 'above'
  ref?: Ref<GraphTooltipHandle>
}

/**
 * One shared tooltip per chart. Driven imperatively (show / move / hide) so hovering never re-renders the chart
 * itself — only this small element.
 */
export function GraphTooltip({ containerRef, placement = 'pointer', ref }: GraphTooltipProps) {
  const [content, setContent] = useState<TooltipContent | null>(null)
  const elRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<TooltipAnchor | null>(null)

  const place = useCallback(() => {
    const el = elRef.current
    const box = containerRef.current
    const a = anchorRef.current
    if (!el || !box || !a) return
    const cr = box.getBoundingClientRect()
    const tw = el.offsetWidth
    const th = el.offsetHeight
    let x: number
    let y: number
    if ('rect' in a) {
      const r = a.rect
      x = r.left - cr.left + r.width / 2 - tw / 2
      y = r.bottom - cr.top + 8
      if (placement === 'above' || y + th > cr.height - 4) y = r.top - cr.top - th - 8
    } else if (placement === 'above') {
      x = a.clientX - cr.left - tw / 2
      y = a.clientY - cr.top - th - 14
    } else {
      x = a.clientX - cr.left + 14
      y = a.clientY - cr.top + 18
      if (x + tw > cr.width - 4) x = a.clientX - cr.left - tw - 14
      if (y + th > cr.height - 4) y = a.clientY - cr.top - th - 12
    }
    x = Math.min(Math.max(4, x), Math.max(4, cr.width - tw - 4))
    if (placement === 'pointer') y = Math.min(Math.max(4, y), Math.max(4, cr.height - th - 4))
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }, [containerRef, placement])

  useImperativeHandle(
    ref,
    () => ({
      show(c, at) {
        anchorRef.current = at
        setContent(c)
        place()
      },
      move(at) {
        anchorRef.current = at
        place()
      },
      hide() {
        anchorRef.current = null
        setContent(null)
      },
    }),
    [place],
  )

  useLayoutEffect(() => {
    if (content) place()
  }, [content, place])

  if (!content) return null
  return (
    <div
      ref={elRef}
      role="tooltip"
      className="pointer-events-none absolute top-0 left-0 z-30 w-max max-w-[min(300px,calc(100%-8px))] rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 shadow-md"
      style={{ transform: 'translate(-9999px, -9999px)' }}
    >
      <div className="flex items-center gap-2">
        {content.color && <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: content.color }} aria-hidden />}
        <span className="min-w-0 font-semibold break-words text-ink">{content.title}</span>
      </div>
      {content.subtitle && <div className="mt-0.5 break-words text-ink-3">{content.subtitle}</div>}
      {content.rows && content.rows.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {content.rows.map((r, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              {r.color && <span className="h-[3px] w-2.5 shrink-0 translate-y-[-2px] rounded-full" style={{ background: r.color }} aria-hidden />}
              <span className="shrink-0 font-semibold text-ink tabular-nums">{r.value}</span>
              {r.label && <span className="min-w-0 break-words text-ink-3">{r.label}</span>}
            </div>
          ))}
        </div>
      )}
      {content.description && <p className="mt-1.5 leading-snug break-words text-ink-2">{content.description}</p>}
      {content.hint && <p className="mt-1.5 text-[11px] text-ink-3">{content.hint}</p>}
    </div>
  )
}
