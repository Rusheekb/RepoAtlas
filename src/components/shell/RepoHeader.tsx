import { useState } from 'react'
import { ExternalLink, Menu, Settings, Star } from 'lucide-react'
import { Link } from 'react-router'
import { IconButton } from './IconButton'
import { formatCompact, formatNumber } from '@/core/format'
import type { RepoMeta } from '@/core/types'
import { useUi } from '@/state/ui'
import { AiStatusChip } from './AiStatusChip'
import { LogoMark } from './Logo'
import { ReadingLevelPicker } from './ReadingLevelPicker'
import { ThemeToggle } from './ThemeToggle'
import { safeHttpUrl } from './urls'

/** Owner avatar with a letter fallback when the image can't load. */
function Avatar({ meta }: { meta: RepoMeta }) {
  const [failed, setFailed] = useState(false)
  const src = safeHttpUrl(meta.ownerAvatarUrl)
  if (!src || failed) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-semibold text-ink-2 uppercase" aria-hidden>
        {meta.owner.slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-7 shrink-0 rounded-lg border border-line bg-surface-2"
    />
  )
}

/** Header for a loaded repository: home logo, repo identity, reading level, Claude status, settings and theme. */
export function RepoHeader({ meta }: { meta: RepoMeta }) {
  const openSettings = useUi((s) => s.openSettings)
  const setNavOpen = useUi((s) => s.setNavOpen)
  const repoUrl = safeHttpUrl(meta.htmlUrl) ?? `https://github.com/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}`

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
      <IconButton className="lg:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)} icon={<Menu className="size-5" />} />
      <Link to="/" className="flex shrink-0 items-center gap-2 rounded-lg" aria-label="RepoAtlas home">
        <LogoMark className="size-8" />
        <span className="hidden text-[15px] font-semibold tracking-tight text-ink xl:inline">RepoAtlas</span>
      </Link>
      <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="hidden sm:inline-flex">
          <Avatar meta={meta} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex min-w-0 items-center gap-1 rounded text-[15px] font-semibold text-ink hover:text-brand-text"
              title={`Open ${meta.fullName} on GitHub (opens in a new tab)`}
            >
              <span className="truncate">{meta.fullName}</span>
              <ExternalLink className="size-3.5 shrink-0 text-ink-3 group-hover:text-brand-text" aria-hidden />
              <span className="sr-only">(opens GitHub in a new tab)</span>
            </a>
            <span
              className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2 md:inline-flex"
              title={`${formatNumber(meta.stars)} people starred this project on GitHub`}
            >
              <Star className="size-3 text-warn-text" aria-hidden />
              <span className="tabular-nums">{formatCompact(meta.stars)}</span>
              <span className="sr-only">stars</span>
            </span>
          </div>
          {meta.description && <p className="hidden truncate text-xs text-ink-3 md:block">{meta.description}</p>}
        </div>
      </div>

      <ReadingLevelPicker className="hidden xl:flex" />
      <AiStatusChip compact />
      <IconButton aria-label="Settings" title="Settings" onClick={() => openSettings()} icon={<Settings className="size-[18px]" />} />
      <ThemeToggle />
    </header>
  )
}
