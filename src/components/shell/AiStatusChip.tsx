import { KeyRound } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Icon } from '@/components/ui/icons'
import { MODELS } from '@/core/labels'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import { useHasClaudeKey } from './media'

/** One quiet header control for both states: a hairline button, 32px tall, the radius of the segmented control beside it. */
const CHIP_CLASS =
  'inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink'

/** On phones the compact chip is an icon-only control: the same 40px ghost square as the header's other icon buttons. */
const COMPACT_CLASS = 'max-sm:size-10 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:px-0'

/** "Claude: on" when a key is saved, otherwise "Add Claude key". Both open Settings → Claude AI. */
export function AiStatusChip({ className, compact }: { className?: string; compact?: boolean }) {
  const hasKey = useHasClaudeKey()
  const model = useSettings((s) => s.model)
  const openSettings = useUi((s) => s.openSettings)
  const modelLabel = MODELS[model]?.label ?? 'Claude'

  if (hasKey) {
    return (
      <button
        type="button"
        onClick={() => openSettings('ai')}
        title={`Claude is ready (${modelLabel}). Click to change AI settings.`}
        aria-label={`Claude: on (${modelLabel}). Open AI settings`}
        className={cn(CHIP_CLASS, compact && COMPACT_CLASS, className)}
      >
        {/* A static status dot: the key is saved. Nothing here is live, so nothing moves. */}
        <span className="size-1.5 shrink-0 rounded-full bg-good" aria-hidden />
        <span className={cn(compact && 'max-sm:sr-only')}>Claude: on</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openSettings('ai')}
      title="Add your own Claude API key for in-depth explanations, chat and quizzes."
      className={cn(CHIP_CLASS, 'text-ink', compact && COMPACT_CLASS, className)}
    >
      <Icon as={KeyRound} size={14} className={cn("text-ink-3", compact && "max-sm:size-4.5")} />
      <span className={cn(compact && 'max-sm:sr-only')}>Add Claude key</span>
    </button>
  )
}
