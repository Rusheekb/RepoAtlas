import { useEffect } from 'react'
import { Home, RotateCcw } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/Button'
import { LogoMark } from './Logo'

const RELOAD_FLAG = 'repoatlas:reloaded-for-update'

/**
 * Call once the app has started: after it has run fine for a while, allow a future automatic reload again.
 * (Clearing it immediately could loop forever if a page's file is genuinely missing.)
 */
export function allowUpdateReloadSoon(delayMs = 10_000): () => void {
  const t = setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG)
    } catch {
      /* storage unavailable */
    }
  }, delayMs)
  return () => clearTimeout(t)
}

/** A page's code file couldn't be loaded — usually because a newer version of RepoAtlas was published meanwhile. */
export function isStaleBuildError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(msg)
}

function describe(err: unknown): string {
  if (isRouteErrorResponse(err)) return `${err.status} ${err.statusText}`
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/**
 * Friendly replacement for React Router's developer error screen. Anything unexpected that escapes a page lands here
 * with plain-English wording, a Reload button and a way home. If the cause is a new version having been published while
 * the tab was open, it reloads once on its own.
 */
export function RouteError() {
  const error = useRouteError()
  const stale = isStaleBuildError(error)

  useEffect(() => {
    console.error(error)
    if (!stale) return
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return
      sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch {
      return
    }
    window.location.reload()
  }, [error, stale])

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-16 text-ink">
      <div className="max-w-md text-center" role="alert">
        <LogoMark className="mx-auto size-12" />
        <h1 className="mt-6 text-2xl font-semibold">{stale ? 'RepoAtlas was just updated' : 'Something went wrong'}</h1>
        <p className="mt-3 text-ink-2">
          {stale
            ? 'A newer version was published while this page was open. Reloading the page will bring you up to date.'
            : 'Sorry — RepoAtlas hit a problem it didn’t expect. Reloading the page usually fixes it. Your settings and saved answers are safe.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => window.location.reload()}>
            Reload the page
          </Button>
          <Button
            icon={<Home className="size-4" aria-hidden />}
            onClick={() => {
              window.location.hash = '#/'
              window.location.reload()
            }}
          >
            Go to the home page
          </Button>
        </div>
        <details className="mt-8 text-left text-sm text-ink-3">
          <summary className="cursor-pointer text-center">Technical details</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">{describe(error)}</pre>
        </details>
      </div>
    </div>
  )
}
