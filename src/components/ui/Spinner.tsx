import { cn } from './cn'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand border-r-transparent', className)} />
  )
}
