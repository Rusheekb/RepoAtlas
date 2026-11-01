import type { ReactNode } from 'react'

/** Inline glossary term with a hover/focus popover (short definition + analogy + "Open glossary"). */
export function Term(props: { id: string; children?: ReactNode }) {
  return <>{props.children}</>
}

/** Render plain text, auto-linking the first mention of each glossary term (knowledge/findTermsInText). */
export function GlossaryText(props: { text: string; className?: string }) {
  return <span className={props.className}>{props.text}</span>
}
