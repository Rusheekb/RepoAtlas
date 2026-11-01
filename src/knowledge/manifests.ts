import type { ManifestInfo } from './types'

/**
 * Parse every package manifest found in `files` (path → text). Must be resilient: malformed files are skipped, never thrown.
 * Supported: package.json (+ workspaces), pnpm-workspace.yaml, requirements*.txt, pyproject.toml (PEP 621 + Poetry),
 * Pipfile, setup.py/setup.cfg (best-effort), environment.yml, go.mod, go.work, Cargo.toml, Gemfile, composer.json,
 * pom.xml, build.gradle(.kts), *.csproj, pubspec.yaml, Package.swift, Podfile, Dockerfile (CMD/ENTRYPOINT → entryHints),
 * Makefile targets → scripts, Procfile.
 * `paths` is the full list of repo paths (to resolve entry hints to real files).
 */
export function parseManifests(files: Record<string, string>, paths: string[]): ManifestInfo {
  void files; void paths
  throw new Error('TODO: implement parseManifests')
}
