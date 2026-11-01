import type { Layer, TechCategory } from '@/core/types'

export type Ecosystem = 'npm' | 'pypi' | 'go' | 'cargo' | 'gem' | 'composer' | 'maven' | 'nuget' | 'pub' | 'cocoapods' | 'swift' | 'conda'

/** One entry in the built-in technology knowledge base. */
export interface TechKnowledgeEntry {
  id: string
  name: string
  category: TechCategory
  /** 1–2 plain-English sentences a non-programmer understands. */
  description: string
  /** Everyday analogy. */
  analogy?: string
  url?: string
  importance: 'core' | 'supporting' | 'tooling'
  /** Package names per ecosystem that indicate this tech. A trailing "*" means prefix match ("@radix-ui/*"). */
  packages?: Partial<Record<Ecosystem, string[]>>
  /**
   * File patterns that indicate this tech. Matched against repo paths:
   *  - a bare name matches that basename anywhere ("Dockerfile", "next.config.js")
   *  - a pattern with "*" is a glob on the basename ("next.config.*", "*.tf")
   *  - a pattern containing "/" matches a path prefix or glob (".github/workflows/*")
   */
  files?: string[]
  /**
   * Names that appear in source-code imports when they differ from the package name
   * (Python `import sklearn` for scikit-learn, Java `org.springframework.boot`, PHP `Illuminate`).
   * Dotted / slashed import paths also match by prefix ("sklearn.model_selection" → "sklearn").
   */
  imports?: Partial<Record<Ecosystem, string[]>>
  /** Ids of technologies this one is built on and always brings along (Next.js → React). */
  implies?: string[]
}

export interface DependencyRef {
  ecosystem: Ecosystem
  name: string
  version?: string
  dev: boolean
  /** Path of the manifest it came from. */
  source: string
  /** The manifest section it was listed in ("dependencies", "devDependencies", "require-dev" …), for evidence strings. */
  section?: string
}

export interface ManifestInfo {
  dependencies: DependencyRef[]
  /** Runnable scripts/commands, e.g. package.json "scripts", pyproject [project.scripts], Makefile targets. */
  scripts: { name: string; command: string; source: string }[]
  /** Files the manifests declare as entry points (package.json main/bin/module, pyproject scripts targets, Cargo [[bin]] path, Dockerfile CMD …). Repo paths when resolvable. */
  entryHints: { path: string; reason: string }[]
  /** Workspace / monorepo package globs or folders (package.json workspaces, pnpm-workspace.yaml, Cargo workspace members, go.work). */
  workspaces: string[]
  /** Go module path from go.mod (e.g. "github.com/gin-gonic/gin"), for resolving Go imports. */
  goModulePath?: string
  /** PHP PSR-4 autoload map from composer.json: namespace prefix → folder. */
  psr4: Record<string, string>
  /** Names/descriptions declared by manifests (package.json name/description, pyproject name/description …). */
  projectNames: string[]
  descriptions: string[]
}

/** Conventional folder names and what they mean. */
export interface FolderRole {
  /** Short role label, e.g. "Reusable screen pieces". */
  role: string
  /** One plain-English sentence. */
  description: string
  emoji: string
  layer: Layer
}
