import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 shadow-sm',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  subtle: 'bg-brand-soft text-brand-text hover:brightness-95 dark:hover:brightness-125',
  danger: 'bg-surface text-bad-text border border-line-strong hover:bg-surface-2',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

/** Square icon-only button. Always pass an aria-label. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { 'aria-label': string }>(function IconButton(
  { variant = 'ghost', size = 'md', className, ...rest },
  ref,
) {
  const sq = size === 'sm' ? 'size-8 px-0' : size === 'lg' ? 'size-12 px-0' : 'size-10 px-0'
  return <Button ref={ref} variant={variant} size={size} className={cn(sq, className)} {...rest} />
})
