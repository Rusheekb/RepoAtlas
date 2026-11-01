import { KeyRound, Sparkles } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { MODELS } from '@/core/labels'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import { useHasClaudeKey } from './media'

/** "Claude: on" when a key is saved, otherwise an inviting "Add Claude key". Both open Settings → Claude AI. */
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
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink',
          className,
        )}
      >
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full rounded-full bg-good opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-good" />
        </span>
        <span className={cn(compact && 'max-sm:sr-only')}>Claude: on</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openSettings('ai')}
      title="Add your own Claude API key to unlock in-depth explanations, chat and quizzes."
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-semibold text-brand-text transition hover:brightness-95 dark:hover:brightness-125',
        className,
      )}
    >
      {compact ? <KeyRound className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
      <span className={cn(compact && 'max-sm:sr-only')}>Add Claude key</span>
    </button>
  )
}
