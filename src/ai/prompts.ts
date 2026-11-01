import type { ReadingLevel } from '@/core/types'

/** Stable system instructions (identical across calls so they're prompt-cached together with the repo context). */
export const SYSTEM_INSTRUCTIONS = ''

/** How to pitch the explanation for each reading level (goes in the user turn, not the system prompt). */
export function levelGuidance(level: ReadingLevel): string {
  void level
  return ''
}
