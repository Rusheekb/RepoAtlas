import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { Link } from 'react-router'
import { IconButton } from './IconButton'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { useUi } from '@/state/ui'
import { GitHubMark } from './bits'
import { Wordmark } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export const PROJECT_URL = 'https://github.com/Rusheekb/RepoAtlas'

/**
 * Light header used outside a loaded repository (home page, loading and error screens):
 * the RepoAtlas wordmark (links home), then settings, the source-code link and the theme toggle.
 * `innerClassName` lets a page line the header's contents up with its own page width (the home page does).
 */
export function SiteHeader({ children, className, innerClassName }: { children?: ReactNode; className?: string; innerClassName?: string }) {
  const openSettings = useUi((s) => s.openSettings)
  return (
    <header className={cn('sticky top-0 z-30 h-16 shrink-0 bg-canvas', className)}>
      <div className={cn('flex h-full items-center gap-1', innerClassName ?? 'px-4 sm:px-6')}>
        <Link to="/" className="mr-auto flex items-center rounded-lg" aria-label="RepoAtlas home">
          <Wordmark />
        </Link>
        {children}
        <a
          href={PROJECT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
          title="RepoAtlas on GitHub"
        >
          <GitHubMark className="size-4.5" />
          <span className="sr-only">RepoAtlas source code on GitHub (opens in a new tab)</span>
        </a>
        <IconButton aria-label="Settings" title="Settings" onClick={() => openSettings()} icon={<Icon as={Settings} size={18} />} />
        <ThemeToggle />
      </div>
    </header>
  )
}
