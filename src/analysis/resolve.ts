import type { RawImport } from '@/core/types'
import { CsharpResolver } from './imports/resolvers/csharp'
import { GoResolver } from './imports/resolvers/go'
import { JsResolver } from './imports/resolvers/js'
import { JvmResolver } from './imports/resolvers/jvm'
import { CResolver, SwiftResolver } from './imports/resolvers/native'
import { resolveOther } from './imports/resolvers/other'
import { PythonResolver } from './imports/resolvers/python'
import { RepoIndex, UNRESOLVED } from './imports/resolvers/repo'
import { RustResolver } from './imports/resolvers/rust'
import {
  DartResolver,
  ElixirResolver,
  LuaResolver,
  PhpResolver,
  RResolver,
  RubyResolver,
  ShellResolver,
} from './imports/resolvers/scripting'
import { CssResolver, HtmlResolver } from './imports/resolvers/web'
import { detectLanguage, languageFamily } from './languages'

export { npmPackageName } from './imports/resolvers/js'
export { goPackageName } from './imports/resolvers/go'
export { jvmPackageName } from './imports/resolvers/jvm'
export { parseJsonc } from './imports/resolvers/repo'

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

/** Import kinds produced by CSS at-rules (also inside <style> blocks of Vue/Svelte/HTML files). */
const isCssKind = (kind: string) => kind.startsWith('@') || kind === 'composes'
/** Import kinds produced by HTML attributes (<script src>, <link href>, SFC src="…"). */
const HTML_KINDS = new Set(['script', 'stylesheet', 'link', 'style', 'template'])
/** Kinds produced by template languages (Jinja, Twig, Blade, EJS, Handlebars …). */
const TEMPLATE_KINDS = new Set(['extends', 'include', 'import', 'from', 'embed', 'use', 'view', 'partial'])

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
 *  - C#: namespaces declared in downloaded files (narrowed to the types the importing file mentions), then folder names;
 *    System.* → builtin, other namespaces → external.
 *  - C/C++: quoted includes relative to the file, then to include/ and src/ roots; angle includes → builtin/external.
 *  - Ruby: require_relative relative; require 'x' → lib/x.rb if present else external gem.
 *  - PHP: PSR-4 map, relative require/include.
 *  - CSS/HTML: relative paths.
 * `internal.paths` never contains the importing file itself; it can be empty when an import only refers to the
 * file's own module (e.g. Rust `use super::*` inside an inline test module).
 * Must be fast: lookup sets/maps are precomputed once (lazily, per language family) and shared by all calls.
 */
export function createResolver(ctx: ResolverContext): Resolver {
  const repo = new RepoIndex(ctx.paths, ctx.files)
  let js: JsResolver | undefined
  let py: PythonResolver | undefined
  let go: GoResolver | undefined
  let rust: RustResolver | undefined
  let jvm: JvmResolver | undefined
  let cs: CsharpResolver | undefined
  let c: CResolver | undefined
  let swift: SwiftResolver | undefined
  let ruby: RubyResolver | undefined
  let php: PhpResolver | undefined
  let dart: DartResolver | undefined
  let elixir: ElixirResolver | undefined
  let lua: LuaResolver | undefined
  let r: RResolver | undefined
  let shell: ShellResolver | undefined
  let css: CssResolver | undefined
  let html: HtmlResolver | undefined

  const jsR = () => (js ??= new JsResolver(repo))
  const cssR = () => (css ??= new CssResolver(repo))
  const htmlR = () => (html ??= new HtmlResolver(repo))

  return (fromPath, imp, language) => {
    if (!imp.specifier || !imp.specifier.trim()) return UNRESOLVED
    const lang = language || detectLanguage(fromPath)?.name || ''
    const lower = lang.toLowerCase()
    const family = languageFamily(lang)
    const kind = imp.kind ?? ''
    try {
      if (isCssKind(kind)) return cssR().resolve(fromPath, imp)
      if (HTML_KINDS.has(kind) && (family === 'html' || family === 'js' || lower === 'blade')) return htmlR().resolve(fromPath, imp)
      switch (family) {
        case 'js':
          return jsR().resolve(fromPath, imp)
        case 'python':
          return (py ??= new PythonResolver(repo)).resolve(fromPath, imp)
        case 'go':
          return (go ??= new GoResolver(repo, ctx.goModulePath)).resolve(fromPath, imp)
        case 'rust':
          return (rust ??= new RustResolver(repo)).resolve(fromPath, imp)
        case 'jvm':
          return (jvm ??= new JvmResolver(repo)).resolve(fromPath, imp)
        case 'csharp':
          return (cs ??= new CsharpResolver(repo)).resolve(fromPath, imp)
        case 'c':
          return (c ??= new CResolver(repo)).resolve(fromPath, imp)
        case 'swift':
          return (swift ??= new SwiftResolver(repo)).resolve(fromPath, imp)
        case 'ruby':
          return (ruby ??= new RubyResolver(repo)).resolve(fromPath, imp)
        case 'php':
          if (lower === 'blade') return resolveOther(repo, fromPath, imp, 'blade')
          return (php ??= new PhpResolver(repo, ctx.psr4)).resolve(fromPath, imp)
        case 'dart':
          return (dart ??= new DartResolver(repo)).resolve(fromPath, imp)
        case 'elixir':
          return (elixir ??= new ElixirResolver(repo)).resolve(fromPath, imp)
        case 'lua':
          return (lua ??= new LuaResolver(repo)).resolve(fromPath, imp)
        case 'r':
          return (r ??= new RResolver(repo)).resolve(fromPath, imp)
        case 'shell':
          return (shell ??= new ShellResolver(repo)).resolve(fromPath, imp)
        case 'css':
          return cssR().resolve(fromPath, imp)
        case 'html':
          if (lower !== 'html' && TEMPLATE_KINDS.has(kind)) return resolveOther(repo, fromPath, imp, lower)
          return jsR().resolve(fromPath, imp)
        case 'other':
          if (lower === 'mdx') return jsR().resolve(fromPath, imp)
          return resolveOther(repo, fromPath, imp, lower)
      }
    } catch {
      return UNRESOLVED
    }
    return UNRESOLVED
  }
}
