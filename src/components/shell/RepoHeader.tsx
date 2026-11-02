import { useState } from 'react'
import { ExternalLink, Menu, Settings, Star } from 'lucide-react'
import { Link } from 'react-router'
import { Icon } from '@/components/ui/icons'
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
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-3 text-xs font-medium text-ink-2 uppercase" aria-hidden>
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
      className="size-7 shrink-0 rounded-md border border-line bg-surface-2"
    />
  )
}

/**
 * Header for a loaded repository: home logo, repo identity, reading level, Claude status, settings and theme.
 * Quiet chrome: one solid paper surface and a hairline, the wordmark, the repo name and its meta in mono.
 * The logo sits on the same 32px centre line as the sidebar's icon column (20px in + 12px half of the 24px mark).
 */
export function RepoHeader({ meta }: { meta: RepoMeta }) {
  const openSettings = useUi((s) => s.openSettings)
  const setNavOpen = useUi((s) => s.setNavOpen)
  const repoUrl = safeHttpUrl(meta.htmlUrl) ?? `https://github.com/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}`

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 sm:gap-3 sm:px-4 lg:pl-5">
      <IconButton className="lg:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)} icon={<Icon as={Menu} size={18} />} />
      <Link to="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label="RepoAtlas home">
        <LogoMark className="size-6" />
        <span className="hidden text-base leading-none font-semibold text-ink xl:inline">RepoAtlas</span>
      </Link>
      <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden sm:inline-flex">
          <Avatar meta={meta} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm text-[15px] leading-5 font-medium text-ink decoration-line-strong underline-offset-4 hover:underline"
              title={`Open ${meta.fullName} on GitHub (opens in a new tab)`}
            >
              <span className="truncate">{meta.fullName}</span>
              <Icon as={ExternalLink} size={14} className="text-ink-3 transition-colors duration-150 ease-atlas group-hover:text-ink-2" />
              <span className="sr-only">(opens GitHub in a new tab)</span>
            </a>
            <span className="hidden shrink-0 items-center gap-1 text-meta md:inline-flex" title={`${formatNumber(meta.stars)} people starred this project on GitHub`}>
              <Icon as={Star} size={14} />
              {formatCompact(meta.stars)}
              <span className="sr-only">stars</span>
            </span>
          </div>
          {meta.description && <p className="hidden truncate text-xs leading-4 text-ink-3 md:block">{meta.description}</p>}
        </div>
      </div>

      <ReadingLevelPicker className="hidden xl:flex" />
      <AiStatusChip compact />
      <IconButton aria-label="Settings" title="Settings" onClick={() => openSettings()} icon={<Icon as={Settings} size={18} />} />
      <ThemeToggle />
    </header>
  )
}
