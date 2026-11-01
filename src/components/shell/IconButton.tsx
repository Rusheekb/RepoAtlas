import { forwardRef } from 'react'
import { IconButton as KitIconButton, type ButtonProps } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'

/**
 * The UI kit's square icon button, with its horizontal padding forced to zero. (The kit combines the size's `px-4`
 * with `px-0`, and `px-4` wins in the generated CSS, which squashes the icon to a few pixels.)
 */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { 'aria-label': string }>(function IconButton({ className, ...rest }, ref) {
  return <KitIconButton ref={ref} className={cn('px-0!', className)} {...rest} />
})
