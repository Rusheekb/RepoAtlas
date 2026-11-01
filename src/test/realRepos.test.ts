/**
 * Runs the full static analysis over real repositories captured as fixtures
 * (generate with scripts/make-fixture.mjs into e2e/.fixtures/). Skipped when no fixtures exist (e.g. CI).
 *
 *   REPORT=1 npx vitest run src/test/realRepos.test.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeRepo } from '@/analysis'
import type { RepoSnapshot } from '@/core/types'

const DIR = join(process.cwd(), 'e2e/.fixtures')
const fixtures = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : []

interface Fixture {
  owner: string
  repo: string
  commitSha: string
  meta: Record<string, unknown>
  tree: { path: string; size: number; sha: string }[]
  files: Record<string, string>
}

function toSnapshot(fx: Fixture): RepoSnapshot {
  return {
    meta: {
      owner: fx.owner,
      repo: fx.repo,
      fullName: `${fx.owner}/${fx.repo}`,
      description: (fx.meta.description as string) ?? null,
      homepage: null,
      htmlUrl: `https://github.com/${fx.owner}/${fx.repo}`,
      ownerAvatarUrl: '',
      stars: 1,
      forks: 1,
      openIssues: 0,
      defaultBranch: 'main',
      topics: [],
      license: 'MIT',
      primaryLanguage: null,
      createdAt: '2020-01-01T00:00:00Z',
      pushedAt: '2026-01-01T00:00:00Z',
      sizeKb: 1,
      isPrivate: false,
      isFork: false,
      archived: false,
    },
    ref: 'main',
    commitSha: fx.commitSha,
    tree: fx.tree.map((t) => ({ path: t.path, size: t.size, sha: t.sha })),
    treeTruncated: false,
    files: fx.files,
    skipped: [],
    fetchedAt: 0,
  }
}

describe.skipIf(fixtures.length === 0)('analysis on real repositories', () => {
  for (const name of fixtures) {
    it(`analyzes ${name}`, async () => {
      const fx = JSON.parse(readFileSync(join(DIR, name), 'utf8')) as Fixture
      const t0 = performance.now()
      const a = await analyzeRepo(toSnapshot(fx))
      const ms = Math.round(performance.now() - t0)

      const files = Object.values(a.files)
      const fetchedSource = files.filter((f) => f.fetched && f.kind === 'source')
      const withImports = fetchedSource.filter((f) => f.imports.length > 0)
      const unresolved = files.reduce((s, f) => s + f.unresolvedImports.length, 0)
      const resolved = files.reduce((s, f) => s + f.imports.length, 0)

      if (process.env.REPORT) {
        const lines = [
          `\n===== ${a.meta.fullName} (${ms} ms) =====`,
          `kind: ${a.projectKind.emoji} ${a.projectKind.label} (${a.projectKind.confidence.toFixed(2)}) — ${a.projectKind.reasons.join('; ')}`,
          `languages: ${a.languages.map((l) => `${l.name} ${l.percent.toFixed(0)}%`).join(', ')}`,
          `tech: ${a.techStack.map((t) => `${t.name}[${t.importance}]`).join(', ')}`,
          `modules (${a.modules.length}): ${a.modules.map((m) => `${m.emoji} ${m.name} (${m.fileCount}f, ${m.layer}) — ${m.role}`).join('\n   ')}`,
          `module edges: ${a.moduleEdges.map((e) => `${e.source}→${e.target}(${e.weight})`).join(', ')}`,
          `file edges: ${a.fileEdges.length}, resolved imports: ${resolved}, unresolved: ${unresolved}, source files with imports: ${withImports.length}/${fetchedSource.length}`,
          `entry points: ${a.entryPoints.map((p) => `${p} (${a.files[p]?.entryReason})`).join('; ')}`,
          `hubs: ${a.hubs.join(', ')}`,
          `external: ${a.externalPackages.slice(0, 12).map((p) => `${p.name}×${p.count}`).join(', ')}`,
          `glossary: ${a.glossaryTermIds.slice(0, 15).join(', ')}`,
          `learning path: ${a.learningPath.map((s) => s.title).join(' → ')}`,
          `starter concepts: ${a.starterConcepts.concepts.map((c) => c.name).join(', ')}`,
          `starter tours: ${a.starterTours.map((t) => `${t.title} (${t.steps.length} steps)`).join('; ')}`,
          `warnings: ${a.warnings.join(' | ')}`,
          `sample summaries:\n   ${fetchedSource.slice(0, 8).map((f) => `${f.path}: [${f.role}/${f.layer}] ${f.summary}`).join('\n   ')}`,
          `unresolved samples: ${files.flatMap((f) => f.unresolvedImports.map((u) => `${f.path}→${u}`)).slice(0, 12).join(', ')}`,
          `overview:\n${a.overview}`,
        ]
        console.log(lines.join('\n'))
      }

      expect(a.modules.length).toBeGreaterThanOrEqual(2)
      expect(a.modules.length).toBeLessThanOrEqual(30)
      expect(a.entryPoints.length).toBeGreaterThan(0)
      expect(a.fileEdges.length).toBeGreaterThan(0)
      expect(a.techStack.length).toBeGreaterThan(0)
      expect(a.overview.length).toBeGreaterThan(100)
      expect(a.starterTours.length).toBeGreaterThan(0)
      for (const f of files) expect(a.modules.some((m) => m.id === f.moduleId)).toBe(true)
      expect(ms).toBeLessThan(5000)
    })
  }
})
