import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Outlet, useLocation, useParams, useSearchParams } from 'react-router'
import { ExplainPanel } from '@/components/ExplainPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ErrorScreen, type RepoLoadError } from '@/components/shell/ErrorScreen'
import { LoadingScreen } from '@/components/shell/LoadingScreen'
import { PageErrorBoundary } from '@/components/shell/PageErrorBoundary'
import { RepoHeader } from '@/components/shell/RepoHeader'
import { Sidebar } from '@/components/shell/Sidebar'
import { SiteHeader } from '@/components/shell/SiteHeader'
import { VIEW_ORDER } from '@/core/labels'
import { repoKey } from '@/core/routes'
import type { RepoRef, ViewId } from '@/core/types'
import { parseRepoInput } from '@/github'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'

const INVALID: RepoLoadError = {
  kind: 'invalid-input',
  message: 'This address doesn’t point to a GitHub project we can open.',
}

/** The view a repo route shows: "/gh/o/r" → overview, "/gh/o/r/map" → map. */
export function viewFromPath(pathname: string): ViewId {
  const seg = pathname.split('/').filter(Boolean)[3]
  return seg && (VIEW_ORDER as string[]).includes(seg) ? (seg as ViewId) : 'overview'
}

/** Full-page frame for the loading and error screens: a simple header above a scrolling area. */
function StatusFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <SiteHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <SettingsDialog />
    </div>
  )
}

/**
 * Loads the repository named in the URL (/gh/:owner/:repo?ref=…) and frames every view:
 * header, sidebar (a drawer on small screens), the scrolling main area, the explain panel and the settings dialog.
 *
 * Sizing contract for pages: <main> is a flex column that fills the space under the 64px header and scrolls.
 * A reading page just renders its content. A full-height page (graphs) uses `flex min-h-0 flex-1 flex-col`
 * (or `h-full`) on its root and handles any inner scrolling itself.
 */
export default function RepoLayout() {
  const params = useParams()
  const owner = params.owner ?? ''
  const repo = params.repo ?? ''
  const [searchParams] = useSearchParams()
  const refParam = searchParams.get('ref')?.trim() || undefined
  const valid = useMemo(() => parseRepoInput(`${owner}/${repo}`) !== null, [owner, repo])
  const ref = useMemo<RepoRef>(() => ({ owner, repo, ref: refParam }), [owner, repo, refParam])
  const key = repoKey(ref)
  const { pathname } = useLocation()

  const storeKey = useRepoStore((s) => s.key)
  const status = useRepoStore((s) => s.status)
  const progress = useRepoStore((s) => s.progress)
  const error = useRepoStore((s) => s.error)
  const analysis = useRepoStore((s) => s.analysis)
  const load = useRepoStore((s) => s.load)
  const addRecent = useProgress((s) => s.addRecent)
  const markSeen = useProgress((s) => s.markSeen)
  const closeExplain = useExplain((s) => s.close)
  const setNavOpen = useUi((s) => s.setNavOpen)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const githubToken = useSettings((s) => s.githubToken)
  const mainRef = useRef<HTMLElement>(null)

  const current = storeKey === key
  const ready = current && status === 'ready' && analysis ? analysis : null
  const failed = current && status === 'error' && error ? error : null
  const label = `${owner}/${repo}${refParam ? `@${refParam}` : ''}`
  const view = viewFromPath(pathname)

  useEffect(() => {
    if (valid) void load(ref)
  }, [valid, load, ref])

  // A different repository: close anything that belonged to the previous one.
  useEffect(() => {
    closeExplain()
    setNavOpen(false)
  }, [key, closeExplain, setNavOpen])

  const fullName = ready?.meta.fullName
  const description = ready?.meta.description ?? null
  useEffect(() => {
    if (fullName) addRecent(fullName, description)
  }, [fullName, description, addRecent])

  useEffect(() => {
    document.title = `${fullName ?? `${owner}/${repo}`} · RepoAtlas`
    return () => {
      document.title = 'RepoAtlas'
    }
  }, [fullName, owner, repo])

  // Visiting a view ticks off the learning-path steps that point at it.
  useEffect(() => {
    if (!ready) return
    for (const step of ready.learningPath) {
      if (step.target.type === 'view' && step.target.view === view) markSeen(ready.meta.fullName, `step:${step.id}`)
    }
  }, [ready, view, markSeen])

  // Each view starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 })
  }, [pathname])

  // Added a GitHub token from the error screen? Try again as soon as Settings closes.
  const tokenAtError = useRef<string | null>(null)
  useEffect(() => {
    if (failed) tokenAtError.current ??= githubToken
    else tokenAtError.current = null
  }, [failed, githubToken])
  useEffect(() => {
    if (settingsOpen || !failed || tokenAtError.current === null || tokenAtError.current === githubToken) return
    tokenAtError.current = null
    void load(ref, { force: true })
  }, [settingsOpen, failed, githubToken, load, ref])

  if (!valid) {
    return (
      <StatusFrame>
        <ErrorScreen error={INVALID} repoLabel={label} onRetry={() => undefined} />
      </StatusFrame>
    )
  }

  if (failed) {
    return (
      <StatusFrame>
        <ErrorScreen error={failed} repoLabel={label} onRetry={() => void load(ref, { force: true })} />
      </StatusFrame>
    )
  }

  if (!ready) {
    return (
      <StatusFrame>
        <LoadingScreen progress={current ? progress : null} repoLabel={label} />
      </StatusFrame>
    )
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-50 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </button>
      <RepoHeader meta={ready.meta} />
      <div className="flex min-h-0 flex-1">
        <Sidebar analysis={ready} />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none" data-view={view}>
          <PageErrorBoundary resetKey={pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
      <ExplainPanel />
      <SettingsDialog />
    </div>
  )
}
