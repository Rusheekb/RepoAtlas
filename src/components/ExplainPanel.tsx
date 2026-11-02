import { useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useLocation } from 'react-router'
import { IconButton } from '@/components/shell/IconButton'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { ExplainBody, explainEyebrow, explainTargetKey } from '@/components/shell/explain/bodies'
import { useMediaQuery } from '@/components/shell/media'
import type { ExplainTarget } from '@/core/types'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { useUi } from '@/state/ui'

/** Progress key for a target, when exploring it counts towards "how much have I explored". */
export function progressKeyFor(target: ExplainTarget): string | null {
  if (target.type === 'module') return `module:${target.id}`
  if (target.type === 'file') return `file:${target.path}`
  if (target.type === 'concept') return `concept:${target.concept.id}`
  return null
}

const PANEL_CSS = `
@keyframes atlas-panel-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
@keyframes atlas-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes atlas-fade { from { opacity: 0; } to { opacity: 1; } }
`

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Global right-hand side panel (reads useExplain). Explains a module / file / folder / concept / tech / glossary term:
 * heuristic plain-English facts first (instantly), then <AiAnswer> for depth, plus related links
 * ("Show on map", "Read the code", "Used by …"). Back button when navigating within the panel; Esc closes.
 * Full-screen sheet on mobile.
 *
 * Desktop (≥768px): a non-modal drawer under the 64px header, so the page behind stays usable (click another node on a
 * map and the panel follows). Phones: a modal bottom sheet with a backdrop.
 */
export function ExplainPanel() {
  const target = useExplain((s) => s.target)
  const canGoBack = useExplain((s) => s.history.length > 0)
  const back = useExplain((s) => s.back)
  const close = useExplain((s) => s.close)
  const analysis = useRepoStore((s) => s.analysis)
  const markSeen = useProgress((s) => s.markSeen)
  const wide = useMediaQuery('(min-width: 768px)', true)
  const { pathname } = useLocation()

  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const hadTarget = useRef(false)
  const openedOnPath = useRef(pathname)
  const key = target ? explainTargetKey(target) : null

  // Remember where focus was when the panel opened; give it back when it closes.
  useLayoutEffect(() => {
    if (target && !hadTarget.current) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null
    }
    if (!target && hadTarget.current) {
      const el = returnFocus.current
      returnFocus.current = null
      const lost = !document.activeElement || document.activeElement === document.body
      if (el?.isConnected) el.focus({ preventScroll: true })
      // The element that opened the panel is gone (a popover closed, the view changed) and focus went down with the
      // panel: continue from the main content rather than from the top of the page.
      else if (lost) document.getElementById('main-content')?.focus({ preventScroll: true })
    }
    hadTarget.current = Boolean(target)
  }, [target])

  // New target: scroll to the top, move focus to its heading, count it as explored.
  useEffect(() => {
    if (!target || !key) return
    openedOnPath.current = pathname
    bodyRef.current?.scrollTo?.({ top: 0 })
    panelRef.current?.querySelector<HTMLElement>('[data-explain-heading]')?.focus({ preventScroll: true })
    const progressKey = progressKeyFor(target)
    if (progressKey && analysis) markSeen(analysis.meta.fullName, progressKey)
    // Only a new target should run this; the other values are read at that moment on purpose.
  }, [key])

  // Moving to another view closes the panel (unless it was opened for the new view).
  useEffect(() => {
    if (useExplain.getState().target && openedOnPath.current !== pathname) close()
    openedOnPath.current = pathname
  }, [pathname, close])

  // Escape closes (unless something on top, like the settings dialog or a glossary popover, handled it first).
  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || useUi.getState().settingsOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      // The phone sheet is modal: keep Tab inside it.
      if (e.key === 'Tab' && !wide && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [target, close, wide])

  if (!target || !analysis) return null
  const eyebrow = explainEyebrow(target)

  const topBar = (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
      {canGoBack ? (
        <IconButton size="sm" aria-label="Back" title="Back" onClick={back} icon={<Icon as={ArrowLeft} />} />
      ) : (
        <span className="w-1" aria-hidden />
      )}
      <p className="min-w-0 flex-1 truncate px-1 text-sm text-ink-3">{eyebrow}</p>
      <IconButton size="sm" aria-label="Close explanation" title="Close (Esc)" onClick={close} icon={<Icon as={X} />} />
    </div>
  )

  const body = (
    <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8">
      <ExplainBody key={key} analysis={analysis} target={target} />
    </div>
  )

  if (wide) {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={`Explanation: ${eyebrow}`}
        data-testid="explain-panel"
        className={cn(
          'fixed top-16 right-0 bottom-0 z-40 flex w-[440px] max-w-[calc(100vw-2rem)] flex-col border-l border-line bg-surface shadow-lg',
          'motion-safe:animate-[atlas-panel-in_240ms_cubic-bezier(0.22,1,0.36,1)]',
        )}
      >
        <style>{PANEL_CSS}</style>
        {topBar}
        {body}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50" data-testid="explain-sheet">
      <style>{PANEL_CSS}</style>
      <div className="absolute inset-0 bg-black/40 motion-safe:animate-[atlas-fade_200ms_cubic-bezier(0.22,1,0.36,1)]" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Explanation: ${eyebrow}`}
        data-testid="explain-panel"
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-lg motion-safe:animate-[atlas-sheet-in_320ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {topBar}
        {body}
      </div>
    </div>
  )
}
