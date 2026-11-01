import { basename, depthOf, dirname } from '@/core/paths'
import type { ManifestInfo } from './types'
import { ManifestCollector, isPeripheralPath, type ParseContext } from './parsers/util'
import { parseDenoJson, parseLernaJson, parsePackageJson, parsePnpmWorkspace } from './parsers/js'
import { parseCondaEnvironment, parsePipfile, parsePyproject, parseRequirementsTxt, parseSetupCfg, parseSetupPy } from './parsers/python'
import { parseCargoToml, parseComposerJson, parseGemfile, parseGemspec, parseGoMod, parseGoWork } from './parsers/systems'
import {
  parseCsproj,
  parseGradle,
  parseGradleSettings,
  parsePackageSwift,
  parsePackagesConfig,
  parsePodfile,
  parsePomXml,
  parsePubspec,
  parseVersionCatalog,
} from './parsers/platforms'
import { parseDockerfile, parseMakefile, parseProcfile } from './parsers/scripts'

type Parser = (ctx: ParseContext) => void

/** Manifests bigger than this are almost certainly generated or vendored; skipping keeps parsing fast. */
const MAX_MANIFEST_CHARS = 1_000_000

/** Which parser handles a file, by its path. Order matters only for overlapping names. */
export function manifestParserFor(path: string): Parser | null {
  const name = basename(path)
  const lower = name.toLowerCase()
  switch (lower) {
    case 'package.json':
      return parsePackageJson
    case 'pnpm-workspace.yaml':
    case 'pnpm-workspace.yml':
      return parsePnpmWorkspace
    case 'lerna.json':
      return parseLernaJson
    case 'deno.json':
    case 'deno.jsonc':
      return parseDenoJson
    case 'pyproject.toml':
      return parsePyproject
    case 'pipfile':
      return parsePipfile
    case 'setup.py':
      return parseSetupPy
    case 'setup.cfg':
      return parseSetupCfg
    case 'environment.yml':
    case 'environment.yaml':
      return parseCondaEnvironment
    case 'go.mod':
      return parseGoMod
    case 'go.work':
      return parseGoWork
    case 'cargo.toml':
      return parseCargoToml
    case 'gemfile':
    case 'gems.rb':
      return parseGemfile
    case 'composer.json':
      return parseComposerJson
    case 'pom.xml':
      return parsePomXml
    case 'build.gradle':
    case 'build.gradle.kts':
      return parseGradle
    case 'settings.gradle':
    case 'settings.gradle.kts':
      return parseGradleSettings
    case 'libs.versions.toml':
      return parseVersionCatalog
    case 'packages.config':
      return parsePackagesConfig
    case 'pubspec.yaml':
    case 'pubspec.yml':
      return parsePubspec
    case 'package.swift':
      return parsePackageSwift
    case 'podfile':
      return parsePodfile
    case 'procfile':
      return parseProcfile
    case 'makefile':
    case 'gnumakefile':
      return parseMakefile
    case 'dockerfile':
    case 'containerfile':
      return parseDockerfile
  }
  if (/\.(cs|fs|vb)proj$/.test(lower)) return parseCsproj
  if (lower.endsWith('.gemspec')) return parseGemspec
  if (/^dockerfile[._-]/.test(lower) || lower.endsWith('.dockerfile')) return parseDockerfile
  if (lower.endsWith('.mk')) return parseMakefile
  if (isRequirementsFile(path)) return parseRequirementsTxt
  return null
}

/** requirements.txt, requirements-dev.txt, dev-requirements.txt, requirements/base.txt, requirements.in … */
function isRequirementsFile(path: string): boolean {
  const lower = path.toLowerCase()
  const name = basename(lower)
  if (/^requirements([._-][\w.-]*)?\.(txt|in)$/.test(name)) return true
  if (/^[\w-]+[._-]requirements\.(txt|in)$/.test(name)) return true
  return basename(dirname(lower)) === 'requirements' && /\.(txt|in)$/.test(name)
}

/**
 * Parse every package manifest found in `files` (path → text). Must be resilient: malformed files are skipped, never thrown.
 * Supported: package.json (+ workspaces), pnpm-workspace.yaml, lerna.json, deno.json, requirements*.txt,
 * pyproject.toml (PEP 621 + PEP 735 + Poetry + uv/PDM), Pipfile, setup.py/setup.cfg (best-effort), environment.yml,
 * go.mod, go.work, Cargo.toml, Gemfile, *.gemspec, composer.json, pom.xml, build.gradle(.kts), settings.gradle,
 * libs.versions.toml, *.csproj/*.fsproj, packages.config, pubspec.yaml, Package.swift, Podfile,
 * Dockerfile (CMD/ENTRYPOINT → entryHints), Makefile targets → scripts, Procfile.
 * `paths` is the full list of repo paths (to resolve entry hints to real files).
 *
 * Manifests inside examples, fixtures, templates or vendored folders are ignored unless the repo has no others,
 * so a framework's demo apps don't masquerade as its own dependencies. Root manifests are read first.
 */
export function parseManifests(files: Record<string, string>, paths: string[]): ManifestInfo {
  const out = new ManifestCollector()
  const allPaths: string[] = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : []
  const pathSet = new Set(allPaths)
  const contents: Record<string, string> = files && typeof files === 'object' ? files : {}
  for (const p of Object.keys(contents)) pathSet.add(p)
  const exists = (p: string) => pathSet.has(p)

  const candidates: { path: string; parser: Parser }[] = []
  for (const path of Object.keys(contents)) {
    const text = contents[path]
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_MANIFEST_CHARS) continue
    if (path.split('/').includes('node_modules')) continue
    const parser = manifestParserFor(path)
    if (parser) candidates.push({ path, parser })
  }
  const primary = candidates.filter((c) => !isPeripheralPath(c.path))
  const chosen = primary.length > 0 ? primary : candidates
  chosen.sort((a, b) => depthOf(a.path) - depthOf(b.path) || a.path.localeCompare(b.path))

  const pathList = allPaths.length > 0 ? allPaths : Object.keys(contents)
  for (const { path, parser } of chosen) {
    try {
      parser({ path, dir: dirname(path), text: contents[path].replace(/^﻿/, ''), exists, paths: pathList, out })
    } catch {
      // Malformed manifest: skip it and keep going.
    }
  }
  return out.toInfo()
}
