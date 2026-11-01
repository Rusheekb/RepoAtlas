import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { Link } from 'react-router'
import { IconButton } from './IconButton'
import { cn } from '@/components/ui/cn'
import { useUi } from '@/state/ui'
import { GitHubMark } from './bits'
import { Wordmark } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export const PROJECT_URL = 'https://github.com/Rusheekb/Explain-everything'

/**
 * Light header used outside a loaded repository (home page, loading and error screens):
 * the RepoAtlas wordmark (links home), then settings, the source-code link and the theme toggle.
 */
export function SiteHeader({ children, className }: { children?: ReactNode; className?: string }) {
  const openSettings = useUi((s) => s.openSettings)
  return (
    <header className={cn('sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 bg-canvas/85 px-4 backdrop-blur sm:px-6', className)}>
      <Link to="/" className="mr-auto flex items-center rounded-lg" aria-label="RepoAtlas home">
        <Wordmark />
      </Link>
      {children}
      <a
        href={PROJECT_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex size-10 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        title="RepoAtlas on GitHub"
      >
        <GitHubMark className="size-[18px]" />
        <span className="sr-only">RepoAtlas source code on GitHub (opens in a new tab)</span>
      </a>
      <IconButton aria-label="Settings" title="Settings" onClick={() => openSettings()} icon={<Settings className="size-[18px]" />} />
      <ThemeToggle />
    </header>
  )
}
