import type { TechItem } from '@/core/types'

/**
 * "Layer cake" of the tech stack: rows for What you see (frontend/styling/mobile/desktop) → The engine (backend/api/language)
 * → Where data lives (database) → Tools behind the scenes (build/testing/quality/ci/infra/cloud) — each tech is a clickable
 * chip with its name and a tiny plain-English hint.
 */
export function TechStackDiagram(props: { tech: TechItem[]; onSelect?: (id: string) => void; className?: string }) {
  return <div className={props.className} data-testid="tech-stack-diagram" />
}
