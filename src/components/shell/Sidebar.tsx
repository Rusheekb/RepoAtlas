import { useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { NavLink } from 'react-router'
import { IconButton } from './IconButton'
import { cn } from '@/components/ui/cn'
import { PROJECT_KIND_INFO, VIEW_INFO, VIEW_ORDER } from '@/core/labels'
import type { RepoAnalysis } from '@/core/types'
import { useProgress } from '@/state/progress'
import { useUi } from '@/state/ui'
import { useRepoNav } from './hooks'
import { computeLearningProgress, learningItemKeys, progressMessage } from './progress'
import { ReadingLevelPicker } from './ReadingLevelPicker'

/** "You've explored 12 of 48 things" meter, computed from the progress store. */
export function LearningMeter({ analysis, className }: { analysis: RepoAnalysis; className?: string }) {
  const repoKey = analysis.meta.fullName.toLowerCase()
  const seen = useProgress((s) => s.seen[repoKey])
  const baseKeys = useMemo(() => learningItemKeys(analysis), [analysis])
  const p = useMemo(() => computeLearningProgress(baseKeys, seen), [baseKeys, seen])
  return (
    <div className={cn('rounded-xl border border-line bg-surface p-3', className)} data-testid="learning-meter">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-ink">Your progress</p>
        <p className="text-xs font-medium text-ink-2 tabular-nums">{p.percent}%</p>
      </div>
      <div
        role="progressbar"
        aria-label="How much of this project you’ve explored"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-valuetext={`${p.seen} of ${p.total} things explored`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
        {p.seen} of {p.total} things explored. {progressMessage(p)}
      </p>
    </div>
  )
}

function SidebarContent({ analysis, onNavigate }: { analysis: RepoAnalysis; onNavigate?: () => void }) {
  const { href } = useRepoNav()
  const kind = analysis.projectKind
  const kindInfo = PROJECT_KIND_INFO[kind.id] ?? PROJECT_KIND_INFO.unknown
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5" title={kind.description || kindInfo.description}>
        <span className="text-2xl leading-none" aria-hidden>
          {kind.emoji || kindInfo.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">This project is a</p>
          <p className="truncate text-sm font-semibold text-ink">{kind.label || kindInfo.label}</p>
        </div>
      </div>

      <nav aria-label="Views" className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {VIEW_ORDER.map((view) => {
            const info = VIEW_INFO[view]
            return (
              <li key={view}>
                <NavLink
                  to={href(view)}
                  end={view === 'overview'}
                  onClick={onNavigate}
                  title={info.description}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                      isActive ? 'bg-brand-soft font-semibold text-brand-text' : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )
                  }
                >
                  <span className="w-5 text-center text-base leading-none" aria-hidden>
                    {info.emoji}
                  </span>
                  <span className="truncate">{info.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <LearningMeter analysis={analysis} />
    </div>
  )
}

/**
 * Left navigation. A fixed column on desktop (lg+); a slide-in drawer on smaller screens, opened from the header
 * (useUi().navOpen). The drawer is modal: focus moves into it, Esc or the backdrop closes it.
 */
export function Sidebar({ analysis }: { analysis: RepoAnalysis }) {
  const navOpen = useUi((s) => s.navOpen)
  const setNavOpen = useUi((s) => s.setNavOpen)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!navOpen) return
    const prev = document.activeElement as HTMLElement | null
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setNavOpen(false)
      } else if (e.key === 'Tab' && drawerRef.current) {
        const items = [...drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])')]
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
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [navOpen, setNavOpen])

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-canvas lg:block" aria-label="Project navigation">
        <SidebarContent analysis={analysis} />
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setNavOpen(false)} aria-hidden />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Project navigation"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-line bg-canvas shadow-lg motion-safe:animate-[atlas-drawer-in_200ms_ease-out]"
          >
            <style>{'@keyframes atlas-drawer-in { from { transform: translateX(-100%); } to { transform: none; } }'}</style>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">Explore this project</p>
              <IconButton size="sm" aria-label="Close menu" onClick={() => setNavOpen(false)} icon={<X className="size-4" />} />
            </div>
            <div className="min-h-0 flex-1">
              <SidebarContent analysis={analysis} onNavigate={() => setNavOpen(false)} />
            </div>
            <div className="border-t border-line p-4">
              <ReadingLevelPicker variant="select" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
