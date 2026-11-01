import type { RawImport } from '@/core/types'

export type ResolvedImport =
  | { type: 'internal'; paths: string[] }
  | { type: 'external'; packageName: string }
  | { type: 'builtin'; name: string }
  | { type: 'unresolved' }

export interface ResolverContext {
  /** Every file path in the repo. */
  paths: string[]
  /** Downloaded file contents (to read tsconfig.json/jsconfig.json paths & baseUrl, go.mod, composer.json, Cargo.toml …). */
  files: Record<string, string>
  /** Go module path from go.mod, if known. */
  goModulePath?: string
  /** PHP PSR-4 map: namespace prefix → folder. */
  psr4?: Record<string, string>
}

export type Resolver = (fromPath: string, imp: RawImport, language: string) => ResolvedImport

/**
 * Build an import resolver for the repo.
 *  - JS/TS: relative paths with extension & index resolution (.ts .tsx .js .jsx .mjs .cjs .vue .svelte .json, /index.*),
 *    TS "paths" aliases + baseUrl from (nested) tsconfig/jsconfig (JSONC: strip comments & trailing commas),
 *    common "@/" and "~/" → src/ fallbacks, monorepo workspace package names (package.json "name" in sub-folders) → internal,
 *    Node builtins (fs, path, node:*) → builtin; bare specifiers → external with normalized package name ("@scope/pkg", "lodash").
 *  - Python: relative imports (from . / ..), absolute imports resolved against repo roots and "src/" layouts
 *    (a.b → a/b.py or a/b/__init__.py), stdlib → builtin, otherwise external (top-level name).
 *  - Go: imports under goModulePath → all .go files (non-test) in that directory; stdlib (no dot in first segment) → builtin.
 *  - Rust: mod x; → x.rs or x/mod.rs next to the file; crate:: / super:: / self:: paths → module files; std/core/alloc → builtin.
 *  - Java/Kotlin/Scala: package path suffix match (com.x.Y → any path ending com/x/Y.java or .kt); java.*, javax.*, kotlin.* → builtin.
 *  - C#: namespace → files declaring that namespace is too costly; treat System.* as builtin, others external unless a folder matches.
 *  - C/C++: quoted includes relative to the file, then to include/ and src/ roots; angle includes → builtin/external.
 *  - Ruby: require_relative relative; require 'x' → lib/x.rb if present else external gem.
 *  - PHP: PSR-4 map, relative require/include.
 *  - CSS/HTML: relative paths.
 * Must be fast: precompute lookup sets/maps once.
 */
export function createResolver(ctx: ResolverContext): Resolver {
  void ctx
  return () => ({ type: 'unresolved' })
}
