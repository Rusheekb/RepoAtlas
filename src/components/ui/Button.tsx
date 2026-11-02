import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Square, icon-only (no horizontal padding). Prefer <IconButton>. */
  square?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  // Primary is the ink itself (paper text on ink; off-white on dark) — quiet chrome, no colored button.
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  subtle: 'bg-surface-2 text-ink hover:bg-surface-3',
  danger: 'bg-surface text-bad-text border border-line-strong hover:bg-surface-2',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 text-sm gap-1.5 rounded-md',
  md: 'h-10 text-sm gap-2 rounded-lg',
  lg: 'h-12 text-[15px] gap-2 rounded-[10px]',
}

/** Horizontal padding is kept separate so icon-only buttons don't fight over it. */
const paddings: Record<ButtonSize, string> = { sm: 'px-3', md: 'px-4', lg: 'px-5' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', square, icon, iconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,transform] duration-150 ease-atlas active:scale-[0.98] motion-reduce:active:scale-100',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        square ? (size === 'sm' ? 'w-8' : size === 'lg' ? 'w-12' : 'w-10') : paddings[size],
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
  return <Button ref={ref} variant={variant} size={size} square className={className} {...rest} />
})
