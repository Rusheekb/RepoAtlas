import type { ReactNode } from 'react'
import { cn } from './cn'

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 text-4xl leading-none">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}
