import type { LanguageStat, TechItem } from '@/core/types'
import type { Ecosystem, ManifestInfo, TechKnowledgeEntry } from './types'

export interface DetectTechInput {
  paths: string[]
  files: Record<string, string>
  manifests: ManifestInfo
  languages: LanguageStat[]
  /** External package names actually imported by source files (normalized), with counts. */
  importedPackages?: { name: string; count: number }[]
}

/**
 * Detect the technologies used, de-duplicated, with plain-English descriptions and evidence.
 * Includes the main programming languages (≥ 5% of code) as 'language' items.
 * Order: core first (frameworks, languages, databases), then supporting, then tooling.
 * Runtime dependencies outrank dev dependencies (dev-only → usually 'tooling').
 */
export function detectTechStack(input: DetectTechInput): TechItem[] {
  void input
  throw new Error('TODO: implement detectTechStack')
}

/** Look up a package by ecosystem + name in the catalog (honours "*" prefix patterns). */
export function lookupPackage(ecosystem: Ecosystem, name: string): TechKnowledgeEntry | undefined {
  void ecosystem; void name
  return undefined
}

/** Look up a catalog entry by id. */
export function getTech(id: string): TechKnowledgeEntry | undefined {
  void id
  return undefined
}
