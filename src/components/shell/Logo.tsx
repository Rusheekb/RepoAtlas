import { cn } from '@/components/ui/cn'

/**
 * The RepoAtlas mark: a folded map drawn flat in one ink (same drawing as public/favicon.svg). It follows the text
 * colour, so it sits quietly in the chrome. Decorative unless a `title` is given. (`animated` is kept for API
 * compatibility; the mark no longer moves.)
 */
export function LogoMark({ className, title }: { className?: string; title?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn(!/(^|\s)size-/.test(className ?? '') && 'size-6', 'shrink-0 text-ink', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Three map panels, folded. */}
      <path d="M3 5.6 8.6 3.5l6.8 2.1L21 3.5v14.9l-5.6 2.1-6.8-2.1L3 20.5V5.6Z" fill="currentColor" fillOpacity=".08" />
      <path
        d="M3 5.6 8.6 3.5l6.8 2.1L21 3.5v14.9l-5.6 2.1-6.8-2.1L3 20.5V5.6ZM8.6 3.5v14.9M15.4 5.6v14.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* A short route across the panels. */}
      <path d="M5.6 15.2c1.6-.9 2.4-3.6 4.3-3.9 1.9-.3 2.6 1.9 4.4 1.5 1.5-.3 2.1-2.6 3.6-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 2.6" />
    </svg>
  )
}

/** Logo mark + "RepoAtlas" wordmark in the interface family. */
export function Wordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="text-[17px] leading-none font-semibold text-ink">RepoAtlas</span>
    </span>
  )
}
