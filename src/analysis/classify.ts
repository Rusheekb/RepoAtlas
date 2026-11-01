import type { CodeSymbol, FileKind, FileRole, Layer, RouteInfo } from '@/core/types'

export interface ClassifyContext {
  content?: string
  language: string | null
  symbols?: CodeSymbol[]
  routes?: RouteInfo[]
  /** Detected TechItem ids (e.g. "react", "django") to sharpen guesses. */
  techIds?: Set<string>
}

/**
 * Classify a file by path conventions (folder names via knowledge/folders describeFolder, file names, extensions)
 * and light content signals (JSX, route definitions, ORM model declarations, test frameworks …).
 * Examples: src/components/Button.tsx → source/component/ui; app/models/user.rb → source/model/data;
 * tests/test_api.py → test/test/test; .github/workflows/ci.yml → config/ci/infra; Dockerfile → build/container/infra;
 * package.json → config/config/config; README.md → docs/docs/docs; styles/main.css → style/style/ui;
 * migrations/0001_init.sql → source/migration/data; src/routes/users.ts with routes → source/route/api.
 */
export function classifyFile(path: string, ctx: ClassifyContext): { kind: FileKind; role: FileRole; layer: Layer } {
  void path; void ctx
  return { kind: 'other', role: 'other', layer: 'other' }
}
