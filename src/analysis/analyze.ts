import type { RepoAnalysis, RepoSnapshot } from '@/core/types'

/**
 * Orchestrates the full static analysis: languages → manifests (knowledge/parseManifests) → per-file language, imports,
 * resolution, symbols, routes, classification → edges & importedBy → tech stack (knowledge/detectTechStack) →
 * modules & module edges → entry points & hubs → project kind → summaries → glossary terms → learning path →
 * starter concepts & tours → overview. Pure function of the snapshot (no network). Must handle 50k-file trees
 * (only fetched files are parsed) in well under a second for typical repos; yield to the event loop between phases.
 */
export async function analyzeRepo(snapshot: RepoSnapshot): Promise<RepoAnalysis> {
  void snapshot
  throw new Error('TODO: implement analyzeRepo')
}
