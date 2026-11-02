import { Moon, Sun } from 'lucide-react'
import { Icon } from '@/components/ui/icons'
import { IconButton } from './IconButton'
import { useSettings } from '@/state/settings'
import { useResolvedTheme } from './media'

/** Sun/moon button that flips between light and dark. ("Match my device" lives in Settings → Preferences.) */
export function ThemeToggle({ className }: { className?: string }) {
  const resolved = useResolvedTheme()
  const set = useSettings((s) => s.set)
  const next = resolved === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'
  return (
    <IconButton
      aria-label={label}
      title={label}
      className={className}
      onClick={() => set({ theme: next })}
      icon={<Icon as={resolved === 'dark' ? Sun : Moon} size={18} />}
    />
  )
}
