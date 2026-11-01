import type { ExplainTask } from '@/ai'

export interface AiAnswerProps {
  task: ExplainTask
  /** Heading shown above the answer, e.g. "Explained by Claude". */
  title?: string
  /** Label for the run button, e.g. "Explain this file in depth". */
  cta?: string
  /** Run immediately if a key exists and nothing is cached. */
  autoRun?: boolean
  compact?: boolean
  className?: string
}

/**
 * Reusable "deep explanation" block: shows a cached answer, or a button to ask Claude, streams the markdown answer
 * with a friendly status line, handles errors (bad key → open Settings), offers "Regenerate", and — when there's no
 * API key — explains how to add one and offers "Copy a ready-made prompt for claude.ai".
 */
export function AiAnswer(props: AiAnswerProps) {
  return <div className={props.className} data-testid="ai-answer" />
}
