/**
 * The signature detail of RepoAtlas ("Field atlas" direction): a survey-red "you are here" pin and a dashed route line.
 *
 * Use it ONLY for: the selected part on a map, the current step of the learning path, and the active step of a guided
 * tour (with the route line joining the steps). Nowhere else — one detail, used consistently.
 */
import { cn } from './cn'

/** A map pin in the accent colour. Decorative unless `label` is given. */
export function YouAreHerePin({ size = 16, label, className }: { size?: 12 | 14 | 16 | 20 | 24; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M8 15.2s5-4.62 5-8.7A5 5 0 0 0 3 6.5c0 4.08 5 8.7 5 8.7Z" fill="var(--accent)" />
      <circle cx="8" cy="6.4" r="1.9" fill="var(--surface)" />
    </svg>
  )
}

/**
 * A dashed route line in the accent colour (or quiet ink for parts of the route not yet travelled).
 * Fills its box: give it a height (vertical) or width (horizontal) from the layout.
 */
export function RouteLine({
  direction = 'vertical',
  travelled = true,
  className,
}: {
  direction?: 'vertical' | 'horizontal'
  travelled?: boolean
  className?: string
}) {
  const color = travelled ? 'var(--accent)' : 'var(--line-strong)'
  const vertical = direction === 'vertical'
  return (
    <span
      aria-hidden
      className={cn('block shrink-0', vertical ? 'w-px' : 'h-px', className)}
      style={{
        backgroundImage: `linear-gradient(${vertical ? 'to bottom' : 'to right'}, ${color} 50%, transparent 50%)`,
        backgroundSize: vertical ? '1.5px 8px' : '8px 1.5px',
        backgroundRepeat: vertical ? 'repeat-y' : 'repeat-x',
        width: vertical ? 1.5 : undefined,
        height: vertical ? undefined : 1.5,
      }}
    />
  )
}
