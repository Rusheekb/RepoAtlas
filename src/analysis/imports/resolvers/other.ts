import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { ELM_CORE_PREFIXES, HASKELL_BASE_PREFIXES, JULIA_STDLIB, NIM_STD, PERL_CORE, ZIG_BUILTINS } from './builtins'
import { npmPackageName } from './js'
import { UNRESOLVED, builtin, byCloseness, external, internal, isRelative, type RepoIndex } from './repo'

/** Find a file whose path (minus extension) ends with `rel` and has one of the extensions; closest to the importer. */
function suffixFind(repo: RepoIndex, fromPath: string, rel: string, exts: string[]): string | null {
  const name = basename(rel)
  const candidates: string[] = []
  for (const e of exts) {
    for (const p of repo.byBasename(name + e)) {
      const noExt = p.slice(0, p.length - e.length)
      if (noExt === rel || noExt.endsWith(`/${rel}`)) candidates.push(p)
    }
  }
  return candidates.length ? (byCloseness(fromPath, candidates)[0] ?? null) : null
}

/** Relative-to-file, then repo-root, then suffix match; each with optional extensions. */
function pathLike(repo: RepoIndex, fromPath: string, spec: string, exts: string[] = []): string | null {
  const bases = [joinPath(dirname(fromPath), spec), joinPath(spec)]
  for (const b of bases) {
    if (repo.has(b)) return b
    for (const e of exts) if (repo.has(b + e)) return b + e
  }
  const clean = spec.replace(/^(?:\.\.?\/)+/, '').replace(/^\//, '')
  if (!clean) return null
  const exact = byCloseness(fromPath, repo.byBasename(basename(clean)).filter((p) => p === clean || p.endsWith(`/${clean}`)))[0]
  if (exact) return exact
  return exts.length ? suffixFind(repo, fromPath, clean, exts) : null
}

function result(hit: string | null, fromPath: string): ResolvedImport {
  return hit ? internal([hit], fromPath) : UNRESOLVED
}

/** Folder → its files of the given extensions (Terraform modules, CMake subdirectories). */
function folderFiles(repo: RepoIndex, dir: string, test: (p: string) => boolean): string[] {
  return repo.filesIn(dir).filter(test).sort()
}

/** Resolution for languages outside the main families, keyed by lower-case language name. */
export function resolveOther(repo: RepoIndex, fromPath: string, imp: RawImport, language: string): ResolvedImport {
  const spec = imp.specifier.trim()
  if (!spec) return UNRESOLVED
  const lang = language.toLowerCase()
  switch (lang) {
    case 'zig':
      if (ZIG_BUILTINS.has(spec)) return builtin(spec)
      if (spec.endsWith('.zig')) return result(pathLike(repo, fromPath, spec), fromPath)
      return external(spec)
    case 'solidity':
    case 'vyper':
      if (isRelative(spec) || (spec.endsWith('.sol') && !spec.startsWith('@'))) {
        const hit = pathLike(repo, fromPath, spec, ['.sol', '.vy'])
        if (hit) return internal([hit], fromPath)
        if (isRelative(spec)) return UNRESOLVED
      }
      return external(npmPackageName(spec))
    case 'protocol buffer':
    case 'thrift': {
      const hit = pathLike(repo, fromPath, spec)
      if (hit) return internal([hit], fromPath)
      if (spec.startsWith('google/protobuf/')) return builtin('google/protobuf')
      return external(spec.split('/')[0] ?? spec)
    }
    case 'graphql':
    case 'pug':
    case 'erlang':
    case 'powershell':
    case 'makefile':
    case 'nix':
    case 'ejs':
      return result(pathLike(repo, fromPath, spec, extsFor(lang)), fromPath)
    case 'f#':
      if (imp.kind === 'load') return result(pathLike(repo, fromPath, spec, extsFor(lang)), fromPath)
      if (spec === 'System' || spec.startsWith('System.') || spec.startsWith('Microsoft.FSharp')) return builtin(spec.split('.').slice(0, 2).join('.'))
      return external(spec.split('.').slice(0, 2).join('.'))
    case 'jinja':
    case 'twig':
    case 'liquid':
    case 'handlebars':
    case 'mustache': {
      const hit = pathLike(repo, fromPath, spec, extsFor(lang)) ?? (lang === 'handlebars' || lang === 'mustache' ? suffixFind(repo, fromPath, spec, ['.hbs', '.handlebars', '.mustache']) : null)
      return result(hit, fromPath)
    }
    case 'blade': {
      const rel = spec.replace(/::/g, '/').replace(/\./g, '/')
      return result(suffixFind(repo, fromPath, rel, ['.blade.php', '.php']), fromPath)
    }
    case 'haskell':
    case 'elm':
    case 'purescript': {
      const ext = lang === 'elm' ? '.elm' : lang === 'purescript' ? '.purs' : '.hs'
      const hit = suffixFind(repo, fromPath, spec.replace(/\./g, '/'), [ext, '.lhs'])
      if (hit) return internal([hit], fromPath)
      const first = spec.split('.')[0] ?? spec
      if (lang === 'elm' ? ELM_CORE_PREFIXES.includes(first) : HASKELL_BASE_PREFIXES.some((p) => spec === p || spec.startsWith(p))) {
        return builtin(first)
      }
      return external(first)
    }
    case 'ocaml':
    case 'rescript': {
      const first = spec.split('.')[0] ?? spec
      const file = first.charAt(0).toLowerCase() + first.slice(1)
      const hit = suffixFind(repo, fromPath, file, lang === 'rescript' ? ['.res'] : ['.ml']) ?? suffixFind(repo, fromPath, first, lang === 'rescript' ? ['.res'] : ['.ml'])
      if (hit) return internal([hit], fromPath)
      return ['Stdlib', 'List', 'Array', 'String', 'Printf', 'Hashtbl', 'Js', 'Belt', 'Map', 'Set', 'Option', 'Result'].includes(first)
        ? builtin(first)
        : external(first)
    }
    case 'julia': {
      if (imp.kind === 'include') return result(pathLike(repo, fromPath, spec, ['.jl']), fromPath)
      const name = spec.replace(/^\.+/, '').split('.')[0] ?? spec
      if (JULIA_STDLIB.has(name)) return builtin(name)
      const hit = suffixFind(repo, fromPath, name, ['.jl'])
      return hit ? internal([hit], fromPath) : external(name)
    }
    case 'perl':
    case 'raku': {
      if (/['"]|\.p[lm]$/.test(spec)) return result(pathLike(repo, fromPath, spec), fromPath)
      if (PERL_CORE.has(spec) || /^(?:File|IO|Test|Time|Text|Term|Pod|Tie|Sys|List|Scalar|Hash|Math|Digest)::/.test(spec)) return builtin(spec)
      const hit = suffixFind(repo, fromPath, spec.replace(/::/g, '/'), ['.pm', '.pm6', '.rakumod'])
      return hit ? internal([hit], fromPath) : external(spec.split('::')[0] ?? spec)
    }
    case 'crystal': {
      if (isRelative(spec)) return result(pathLike(repo, fromPath, spec, ['.cr']), fromPath)
      const hit = suffixFind(repo, fromPath, spec, ['.cr'])
      return hit ? internal([hit], fromPath) : external(spec.split('/')[0] ?? spec)
    }
    case 'nim': {
      const rel = spec.replace(/^std\//, '')
      if (NIM_STD.has(rel) || spec.startsWith('std/')) return builtin(rel)
      const hit = pathLike(repo, fromPath, spec, ['.nim']) ?? suffixFind(repo, fromPath, spec, ['.nim'])
      return hit ? internal([hit], fromPath) : external(spec.split('/')[0] ?? spec)
    }
    case 'clojure': {
      const rel = spec.replace(/\./g, '/').replace(/-/g, '_')
      const hit = suffixFind(repo, fromPath, rel, ['.clj', '.cljs', '.cljc'])
      if (hit) return internal([hit], fromPath)
      return spec.startsWith('clojure.') ? builtin(spec) : external(spec.split('.')[0] ?? spec)
    }
    case 'hcl': {
      if (isRelative(spec)) {
        const dir = joinPath(dirname(fromPath), spec)
        const files = folderFiles(repo, dir, (p) => p.endsWith('.tf'))
        return files.length ? internal(files, fromPath) : UNRESOLVED
      }
      return external(spec.replace(/^(?:git::|registry\.terraform\.io\/)/, '').split('?')[0] ?? spec)
    }
    case 'cmake': {
      if (imp.kind === 'add_subdirectory') {
        const p = joinPath(dirname(fromPath), spec, 'CMakeLists.txt')
        return result(repo.has(p) ? p : null, fromPath)
      }
      const hit = pathLike(repo, fromPath, spec, ['.cmake']) ?? suffixFind(repo, fromPath, spec, ['.cmake'])
      return hit ? internal([hit], fromPath) : builtin(spec)
    }
    case 'starlark': {
      const ext = /^@([\w.-]+)\/\//.exec(spec)
      if (ext) return external(ext[1])
      const m = /^(?:\/\/)?([^:]*):?(.*)$/.exec(spec)
      if (!m) return UNRESOLVED
      const pkg = spec.startsWith(':') ? dirname(fromPath) : spec.startsWith('//') ? m[1] : joinPath(dirname(fromPath), m[1])
      const p = joinPath(pkg, m[2] || '')
      return result(repo.has(p) ? p : null, fromPath)
    }
    case 'gleam': {
      const hit = suffixFind(repo, fromPath, spec, ['.gleam'])
      if (hit) return internal([hit], fromPath)
      return spec.startsWith('gleam/') ? builtin(spec) : external(spec.split('/')[0] ?? spec)
    }
    case 'coffeescript':
      if (isRelative(spec)) return result(pathLike(repo, fromPath, spec, ['.coffee', '.js']), fromPath)
      return external(npmPackageName(spec))
    default:
      if (isRelative(spec) || spec.startsWith('/') || /\.[a-z0-9]+$/i.test(spec)) return result(pathLike(repo, fromPath, spec), fromPath)
      return external(spec.split(/[/.:]/)[0] ?? spec)
  }
}

function extsFor(lang: string): string[] {
  switch (lang) {
    case 'graphql':
      return ['.graphql', '.gql']
    case 'pug':
      return ['.pug', '.jade']
    case 'erlang':
      return ['.hrl']
    case 'powershell':
      return ['.ps1', '.psm1']
    case 'makefile':
      return ['.mk']
    case 'nix':
      return ['.nix', '/default.nix']
    case 'ejs':
      return ['.ejs']
    case 'f#':
      return ['.fsx', '.fs']
    case 'jinja':
      return ['.html', '.j2', '.jinja', '.jinja2']
    case 'twig':
      return ['.twig', '.html.twig']
    case 'liquid':
      return ['.liquid']
    case 'handlebars':
    case 'mustache':
      return ['.hbs', '.handlebars', '.mustache']
    default:
      return []
  }
}
