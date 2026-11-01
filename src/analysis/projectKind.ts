import type { AnalyzedFile, ProjectKind, TechItem } from '@/core/types'
import type { ManifestInfo } from '@/knowledge'

/** Infer what kind of project this is (web app, API server, library, CLI …) with confidence and plain-English reasons. */
export function detectProjectKind(input: {
  files: AnalyzedFile[]
  techStack: TechItem[]
  manifests: ManifestInfo
  readme: string | null
  topics: string[]
  description: string | null
}): ProjectKind {
  void input
  return { id: 'unknown', label: 'Software project', description: 'A software project.', emoji: '📁', confidence: 0, reasons: [] }
}
