import { cn } from '@/components/ui/cn'

/**
 * The RepoAtlas mark: three connected nodes on a rounded tile (same drawing as public/favicon.svg).
 * Uses the brand tokens so it follows the theme. Decorative unless a `title` is given.
 */
export function LogoMark({ className, title, animated }: { className?: string; title?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn(!/(^|\s)size-/.test(className ?? '') && 'size-8', 'shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="64" height="64" rx="14" fill="var(--brand)" />
      <path
        d="M20 22 L44 22 M20 22 L32 44 M44 22 L32 44"
        stroke="var(--brand-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".8"
        className={animated ? 'logo-edges' : undefined}
      />
      <circle cx="20" cy="22" r="7" fill="var(--brand-ink)" className={animated ? 'logo-node logo-node-1' : undefined} />
      <circle cx="44" cy="22" r="7" fill="var(--brand-soft)" className={animated ? 'logo-node logo-node-2' : undefined} />
      <circle cx="32" cy="44" r="7" fill="var(--brand-ink)" className={animated ? 'logo-node logo-node-3' : undefined} />
      {animated && (
        <style>{`
          @keyframes logo-node-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
          @keyframes logo-edge-flow { to { stroke-dashoffset: -24; } }
          .logo-node { transform-box: fill-box; transform-origin: center; animation: logo-node-pulse 1.8s ease-in-out infinite; }
          .logo-node-2 { animation-delay: .3s; }
          .logo-node-3 { animation-delay: .6s; }
          .logo-edges { stroke-dasharray: 6 6; animation: logo-edge-flow 1.2s linear infinite; }
          @media (prefers-reduced-motion: reduce) { .logo-node, .logo-edges { animation: none; } }
        `}</style>
      )}
    </svg>
  )
}

/** Logo mark + "RepoAtlas" wordmark. */
export function Wordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="text-[17px] font-semibold tracking-tight text-ink">RepoAtlas</span>
    </span>
  )
}
