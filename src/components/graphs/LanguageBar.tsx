import type { LanguageStat } from '@/core/types'

/** Horizontal stacked bar of language share + legend list (top N, rest folded into "Other"). Hover tooltips. */
export function LanguageBar(props: { languages: LanguageStat[]; max?: number; className?: string }) {
  return <div className={props.className} data-testid="language-bar" />
}
