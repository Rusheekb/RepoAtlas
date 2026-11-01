import { basename, extname } from '@/core/paths'
import type { CodeSymbol, SymbolKind } from '@/core/types'
import { findTagBlocks, keepRanges } from './imports/util'
import { detectLanguage, languageFamily } from './languages'
import { maskSource } from './strip'

const MAX_SYMBOLS = 200
const MAX_SIGNATURE = 120
const MAX_CONTENT = 1_500_000
/** Lines longer than this (minified bundles, embedded data) are skipped when looking for declarations. */
const MAX_LINE = 2000

// ─────────────────────────────────────────────────────────────────────────────
// Shared plumbing
// ─────────────────────────────────────────────────────────────────────────────

interface Lines {
  /** Comments and string contents blanked (columns line up with `text`: indentation, signatures). */
  code: string[]
  /** Comments blanked, strings intact (signatures come from here). */
  text: string[]
  /**
   * `code` with every run of blank space squeezed to one character: run the declaration regexes on this.
   * Patterns such as `function\s*\*?\s*(name)?\s*\(` can split a long run of spaces between their `\s*` parts in
   * countless ways, so a single line of spaces in a hostile file could otherwise freeze the page for minutes.
   */
  match: string[]
}

/** Squeeze runs of blank space to their first character (indentation and other columns are read from `code`). */
function squeeze(line: string): string {
  return line.length < 2 ? line : line.replace(/\s{2,}/g, (run) => run[0])
}

function toLines(content: string, language: string): Lines {
  const m = maskSource(content, language)
  const code = m.code.split('\n')
  const text = m.text.split('\n')
  // Keep brace structure of over-long lines but hide their text from the declaration regexes.
  for (let i = 0; i < code.length; i++) {
    if (code[i].length > MAX_LINE) {
      code[i] = code[i].replace(/[^{}()[\]]/g, ' ')
      text[i] = ''
    }
  }
  return { code, text, match: code.map(squeeze) }
}

class Out {
  readonly list: CodeSymbol[] = []
  private readonly seen = new Set<string>()
  full(): boolean {
    return this.list.length >= MAX_SYMBOLS
  }
  add(name: string, kind: SymbolKind, line: number, exported: boolean, signature?: string): void {
    if (!name || this.full()) return
    const key = `${name}@${line}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const sym: CodeSymbol = { name, kind, line, exported }
    if (signature) sym.signature = signature
    this.list.push(sym)
  }
  markExported(names: Iterable<string>): void {
    const set = new Set(names)
    for (const s of this.list) if (set.has(s.name)) s.exported = true
  }
}

type Cut = 'brace' | 'colon' | 'none' | 'arrow' | 'equals'

/**
 * One-line signature starting at line i: joins continuation lines while brackets are open (up to 8 lines),
 * cuts off the body, collapses whitespace and trims to 120 characters.
 */
function signature(lines: Lines, i: number, cut: Cut): string {
  let out = ''
  let depth = 0
  for (let k = i; k < Math.min(lines.code.length, i + 8); k++) {
    const code = lines.code[k] ?? ''
    const text = lines.text[k] ?? ''
    let stop = -1
    for (let c = 0; c < code.length; c++) {
      const ch = code[c]
      if (ch === '(' || ch === '[' || (ch === '<' && cut !== 'brace')) depth++
      else if (ch === ')' || ch === ']' || (ch === '>' && cut !== 'brace' && code[c - 1] !== '=')) depth = Math.max(0, depth - 1)
      else if (depth === 0) {
        if (cut === 'brace' && ch === '{') {
          stop = c
          break
        }
        if (cut === 'arrow' && ch === '=' && code[c + 1] === '>') {
          stop = c + 2
          break
        }
        if (cut === 'equals' && ch === '=' && code[c + 1] !== '>' && code[c + 1] !== '=' && code[c - 1] !== '=' && code[c - 1] !== '!' && code[c - 1] !== '<' && code[c - 1] !== '>') {
          stop = c
          break
        }
        if (cut === 'colon' && ch === ':' && /^\s*$/.test(code.slice(c + 1))) {
          stop = c
          break
        }
      }
    }
    out += ' ' + (stop === -1 ? text : text.slice(0, stop))
    if (stop !== -1 || cut === 'none') break
    if (depth === 0 && k >= i) {
      // Continue only when the header obviously goes on (open bracket handled above, or a trailing comma/operator).
      if (!/[,(\[<:=|&]\s*$/.test(code.trimEnd()) || cut === 'equals') break
    }
  }
  let s = out.replace(/\s+/g, ' ').trim().replace(/[\s{:=]+$/, '').trim()
  if (s.length > MAX_SIGNATURE) s = s.slice(0, MAX_SIGNATURE - 1).trimEnd() + '…'
  return s
}

const CONTROL = new Set([
  'if',
  'for',
  'foreach',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'new',
  'delete',
  'typeof',
  'sizeof',
  'else',
  'do',
  'try',
  'throw',
  'case',
  'await',
  'yield',
  'using',
  'lock',
  'nameof',
  'super',
  'this',
  'assert',
  'when',
  'with',
  'elif',
  'unless',
  'until',
  'loop',
  'match',
  'defer',
  'go',
  'select',
  'guard',
  'repeat',
  'synchronized',
  'fixed',
  'checked',
  'unchecked',
  'goto',
  'print',
  'println',
  'echo',
  'require',
  'import',
  'export',
  'default',
  'static_assert',
  'decltype',
  'alignof',
  'operator',
])

const isUpperConst = (name: string) => /^[A-Z][A-Z0-9_]*$/.test(name) && /[A-Z]/.test(name) && name.length > 1
const isPascal = (name: string) => /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name)
const isHook = (name: string) => /^use[A-Z0-9]/.test(name)

// ─────────────────────────────────────────────────────────────────────────────
// Brace engine — tracks block depth and the classes / namespaces each line sits in
// ─────────────────────────────────────────────────────────────────────────────

interface Container {
  /** 'class' bodies hold members; 'namespace' bodies are transparent (their contents count as top level). */
  kind: 'class' | 'namespace' | 'opaque'
  name: string
  exported: boolean
  /** Language-specific flags (e.g. interface, C++ access level, React component). */
  flags: Record<string, string | boolean>
  bodyDepth: number
  declLine: number
  parenAtDecl: number
}

type Scope = { kind: 'top' } | { kind: 'member'; container: Container } | { kind: 'nested' }

interface Decl {
  kind: Container['kind']
  name: string
  exported: boolean
  flags?: Record<string, string | boolean>
}

const CONTINUES_END = /(?:[,(<:=&|]|\bextends|\bimplements|\bwhere|\bwith|\bthrows|\bfor|->)\s*$/
const CONTINUES_START = /^\s*(?:[{:,]|extends\b|implements\b|where\b|with\b|throws\b|->|=>|\))/

function braceEngine(
  lines: Lines,
  onLine: (i: number, scope: Scope) => Decl | null | void,
  onClose?: (c: Container, closeLine: number) => void,
): void {
  const { code } = lines
  let depth = 0
  let paren = 0
  const stack: Container[] = []
  let pending: Container | null = null
  for (let i = 0; i < code.length; i++) {
    const line = code[i]
    const top = stack[stack.length - 1]
    let scope: Scope
    if (paren > 0) scope = { kind: 'nested' }
    else if (top && depth === top.bodyDepth) scope = top.kind === 'namespace' ? { kind: 'top' } : top.kind === 'class' ? { kind: 'member', container: top } : { kind: 'nested' }
    else if (!top && depth === 0) scope = { kind: 'top' }
    else scope = { kind: 'nested' }

    // Minified / generated lines carry no meaningful declarations and can make regexes slow.
    if (/\S/.test(line) && line.length <= MAX_LINE) {
      const decl = scope.kind === 'nested' ? null : onLine(i, scope)
      if (decl) {
        pending = {
          kind: decl.kind,
          name: decl.name,
          exported: decl.exported,
          flags: decl.flags ?? {},
          bodyDepth: depth + 1,
          declLine: i,
          parenAtDecl: paren,
        }
      }
    }
    for (let c = 0; c < line.length; c++) {
      const ch = line.charCodeAt(c)
      if (ch === 40 || ch === 91) paren++
      else if (ch === 41 || ch === 93) paren = Math.max(0, paren - 1)
      else if (ch === 123) {
        depth++
        if (pending && depth === pending.bodyDepth && paren === pending.parenAtDecl) {
          stack.push(pending)
          pending = null
        }
      } else if (ch === 125) {
        depth = Math.max(0, depth - 1)
        while (stack.length && stack[stack.length - 1].bodyDepth > depth) {
          const closed = stack.pop() as Container
          onClose?.(closed, i)
        }
      }
    }
    // A declaration that never opens a body (`class X;`, `data class P(val x: Int)`) stops being pending.
    if (pending && paren === pending.parenAtDecl) {
      const trimmed = line.trimEnd()
      let next = ''
      for (let k = i + 1; k < code.length && k < i + 4; k++) {
        if (/\S/.test(code[k])) {
          next = code[k]
          break
        }
      }
      if (/;\s*$/.test(trimmed) || (!CONTINUES_END.test(trimmed) && !CONTINUES_START.test(next))) pending = null
    }
  }
  while (stack.length) onClose?.(stack.pop() as Container, code.length - 1)
}

/** Previous non-blank text lines (for annotations / decorators on their own lines). */
function annotationsBefore(lines: Lines, i: number, max = 4): string {
  const out: string[] = []
  for (let k = i - 1; k >= 0 && out.length < max; k--) {
    const t = lines.text[k]?.trim() ?? ''
    if (!t) continue
    if (!/^[@#[]/.test(t)) break
    out.push(t)
  }
  return out.join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// JavaScript / TypeScript
// ─────────────────────────────────────────────────────────────────────────────

const JS_FUNC = /^\s*(export\s+)?(default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>]*>)?\s*\(/
const JS_CLASS = /^\s*(export\s+)?(default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)?(?:\s*<[^{]*?>)?(?:\s+extends\s+([\w$.]+))?/
const JS_INTERFACE = /^\s*(export\s+)?(?:default\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/
const JS_TYPE = /^\s*(export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^=]*>)?\s*=/
const JS_ENUM = /^\s*(export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/
const JS_NAMESPACE = /^\s*(export\s+)?(?:declare\s+)?(?:namespace|module)\s+([A-Za-z_$][\w$.]*)\s*(?:\{|$)/
const JS_VAR_HEAD = /^\s*(export\s+)?(?:declare\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/

/** Split `const x: T = value` after the name into its type annotation and value (linear scan, no backtracking). */
function splitAssignment(rest: string): { type: string; value: string } | null {
  let depth = 0
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++
    else if (c === ')' || c === ']' || c === '}' || (c === '>' && rest[i - 1] !== '=')) depth = Math.max(0, depth - 1)
    else if (c === '=' && depth === 0) {
      const next = rest[i + 1]
      const prev = rest[i - 1]
      if (next === '>' || next === '=' || prev === '!' || prev === '=' || prev === '<' || prev === '>') continue
      return { type: rest.slice(0, i).replace(/^\s*!?\s*:?/, '').trim(), value: rest.slice(i + 1) }
    }
  }
  return null
}
const JS_EXPORT_LIST = /^\s*export\s*(?:type\s*)?\{([^}]*)\}\s*;?\s*$/
const JS_EXPORT_DEFAULT_ID = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/
const JS_MODULE_EXPORTS = /^\s*module\.exports\s*=\s*(?:\{([^}]*)\}?|([A-Za-z_$][\w$]*)\s*;?\s*$)/
const JS_EXPORTS_PROP = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=\s*(.*)$/
const JS_PROP_FUNC = /^\s*((?:[A-Za-z_$][\w$]*\.)+)([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/
const JS_FUNC_RHS = /^(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+?)?\s*=>|\(\s*$|\([^)]*$|[A-Za-z_$][\w$]*\s*=>|<[^>]*>\s*\()/
const JS_WRAPPER_RHS = /^(?:React\.)?(?:memo|forwardRef|lazy|observer|defineComponent|defineAsyncComponent|withRouter|connect\([^)]*\)|styled(?:\.\w+|\([^)]*\)))\s*[(`<]/
const JS_METHOD = /^\s*((?:(?:public|private|protected|static|async|override|readonly|abstract|declare|get|set|accessor)\s+)*)\*?\s*(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(?:<[^>(]*>)?\s*\(/
const JS_ARROW_PROP = /^\s*((?:(?:public|private|protected|static|readonly|override)\s+)*)(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>/
const JSX_RETURN = /(?:\breturn|=>)\s*(?:\(\s*)?<(?:[A-Za-z][\w.]*|>)/

function jsSymbols(lines: Lines, out: Out, componentFile: boolean): void {
  const joined = lines.match.join('\n')
  const jsxFile = componentFile || JSX_RETURN.test(joined)
  const exportedNames: string[] = []

  const fnKind = (name: string): SymbolKind => (isHook(name) ? 'hook' : jsxFile && isPascal(name) ? 'component' : 'function')

  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    if (scope.kind === 'member') {
      const cls = scope.container
      let m = JS_ARROW_PROP.exec(code)
      if (m && !CONTROL.has(m[2])) {
        out.add(m[2], 'method', line, cls.exported && !/private/.test(m[1]) && !m[2].startsWith('#'), signature(lines, i, 'arrow'))
        return
      }
      m = JS_METHOD.exec(code)
      if (m && !CONTROL.has(m[2])) {
        out.add(m[2], 'method', line, cls.exported && !/private/.test(m[1]) && !m[2].startsWith('#'), signature(lines, i, 'brace'))
      }
      return
    }
    let m = JS_FUNC.exec(code)
    if (m) {
      const name = m[3] ?? (m[2] ? 'default' : '')
      if (name) out.add(name, fnKind(name), line, !!m[1], signature(lines, i, 'brace'))
      return
    }
    m = JS_CLASS.exec(code)
    if (m) {
      const name = m[3] ?? (m[2] ? 'default' : '')
      const isComponent = !!m[4] && /(?:^|\.)(?:Component|PureComponent)$/.test(m[4])
      if (name) out.add(name, isComponent ? 'component' : 'class', line, !!m[1], signature(lines, i, 'brace'))
      return { kind: 'class', name, exported: !!m[1] }
    }
    m = JS_INTERFACE.exec(code)
    if (m) {
      out.add(m[2], 'interface', line, !!m[1], signature(lines, i, 'brace'))
      return { kind: 'opaque', name: m[2], exported: !!m[1] }
    }
    m = JS_TYPE.exec(code)
    if (m) {
      out.add(m[2], 'type', line, !!m[1], signature(lines, i, 'none'))
      return
    }
    m = JS_ENUM.exec(code)
    if (m) {
      out.add(m[2], 'enum', line, !!m[1], signature(lines, i, 'brace'))
      return { kind: 'opaque', name: m[2], exported: !!m[1] }
    }
    m = JS_NAMESPACE.exec(code)
    if (m && !/^\s*(?:export\s+)?module\s*\./.test(code)) {
      out.add(m[2], 'module', line, !!m[1], signature(lines, i, 'brace'))
      return { kind: 'namespace', name: m[2], exported: !!m[1] }
    }
    m = JS_VAR_HEAD.exec(code)
    const assignment = m ? splitAssignment(code.slice(m[0].length)) : null
    if (m && assignment) {
      const name = m[3]
      const exported = !!m[1]
      // The value may continue on the next lines ("const X = (\n props\n) => {").
      let rhs = assignment.value.trim()
      for (let k = i + 1; rhs.length < 200 && k < Math.min(lines.code.length, i + 4); k++) rhs += ' ' + lines.match[k].trim()
      const typeAnn = assignment.type
      if (JS_FUNC_RHS.test(rhs) || /(?:^|\b)(?:React\.)?FC\b|FunctionComponent|=>/.test(typeAnn)) {
        out.add(name, fnKind(name), line, exported, signature(lines, i, /^(?:async\s*)?function\b/.test(rhs) ? 'brace' : 'arrow'))
      } else if (isPascal(name) && JS_WRAPPER_RHS.test(rhs)) {
        out.add(name, 'component', line, exported, signature(lines, i, 'none'))
      } else if (isHook(name) && /^[\w$.]+\s*[(<]/.test(rhs)) {
        out.add(name, 'hook', line, exported, signature(lines, i, 'none'))
      } else if (isUpperConst(name)) {
        out.add(name, 'constant', line, exported, signature(lines, i, 'none'))
      } else if (exported) {
        out.add(name, m[2] === 'const' ? 'constant' : 'variable', line, exported, signature(lines, i, 'none'))
      }
      return
    }
    m = JS_EXPORT_LIST.exec(code)
    if (m) {
      for (const part of m[1].split(',')) {
        const local = part.trim().replace(/^type\s+/, '').split(/(?<!\s)\s+as\s+/)[0]?.trim()
        if (local) exportedNames.push(local)
      }
      return
    }
    m = JS_EXPORT_DEFAULT_ID.exec(code)
    if (m) {
      exportedNames.push(m[1])
      return
    }
    m = JS_MODULE_EXPORTS.exec(code)
    if (m) {
      if (m[2]) exportedNames.push(m[2])
      else for (const part of (m[1] ?? '').split(',')) {
        const local = part.trim().split(':').pop()?.trim()
        if (local && /^[A-Za-z_$][\w$]*$/.test(local)) exportedNames.push(local)
      }
      return
    }
    m = JS_EXPORTS_PROP.exec(code)
    if (m) {
      const rhs = m[2].trim()
      if (JS_FUNC_RHS.test(rhs)) out.add(m[1], fnKind(m[1]), line, true, signature(lines, i, /^(?:async\s*)?function\b/.test(rhs) ? 'brace' : 'arrow'))
      else exportedNames.push(m[1])
      return
    }
    // Classic object/prototype style: `app.use = function use(fn) {…}`, `Router.prototype.handle = function () {…}`.
    m = JS_PROP_FUNC.exec(code)
    if (m && !/^(?:this|window|globalThis|self)\./.test(m[1])) {
      const owner = m[1].replace(/\.prototype\./g, '.').replace(/\.$/, '')
      const fn = /=\s*(?:async\s+)?function\b/.test(code)
      out.add(`${owner}.${m[2]}`, 'method', line, true, signature(lines, i, fn ? 'brace' : 'arrow'))
    }
  })
  out.markExported(exportedNames)
}

// ─────────────────────────────────────────────────────────────────────────────
// Python (indentation based)
// ─────────────────────────────────────────────────────────────────────────────

function pythonSymbols(lines: Lines, out: Out): void {
  const { code } = lines
  let classIndent = -1
  let memberIndent = -1
  let depth = 0
  for (let i = 0; i < code.length && !out.full(); i++) {
    const line = code[i]
    const inBrackets = depth > 0
    for (const ch of line) {
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
    }
    if (inBrackets || !/\S/.test(line)) continue
    const indent = line.length - line.trimStart().length
    const t = lines.match[i].trim()
    if (classIndent >= 0 && indent <= classIndent) {
      classIndent = -1
      memberIndent = -1
    }
    if (t.startsWith('@')) continue
    let m = /^(async\s+)?def\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/.exec(t)
    if (m) {
      const name = m[2]
      if (indent === 0) out.add(name, 'function', i + 1, !name.startsWith('_'), signature(lines, i, 'colon'))
      else if (classIndent >= 0) {
        if (memberIndent < 0) memberIndent = indent
        if (indent === memberIndent) out.add(name, 'method', i + 1, !name.startsWith('_'), signature(lines, i, 'colon'))
      }
      continue
    }
    m = /^class\s+([A-Za-z_]\w*)/.exec(t)
    if (m) {
      if (indent === 0) {
        const name = m[1]
        const bases = /^class\s+\w+\s*\(([^)]*)\)/.exec(t)?.[1] ?? ''
        const kind: SymbolKind = /\bEnum\b|IntEnum|StrEnum|Flag\b/.test(bases) ? 'enum' : /\bProtocol\b/.test(bases) ? 'interface' : 'class'
        out.add(name, kind, i + 1, !name.startsWith('_'), signature(lines, i, 'colon'))
        classIndent = 0
        memberIndent = -1
      } else if (classIndent >= 0 && memberIndent < 0) memberIndent = indent
      continue
    }
    if (classIndent >= 0 && memberIndent < 0 && indent > classIndent) memberIndent = indent
    if (indent !== 0) continue
    m = /^type\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*=/.exec(t)
    if (m) {
      out.add(m[1], 'type', i + 1, !m[1].startsWith('_'), signature(lines, i, 'none'))
      continue
    }
    m = /^([A-Za-z_]\w*)\s*(?::\s*([^=]+))?=(?!=)/.exec(t)
    if (m) {
      const name = m[1]
      if (/TypeAlias/.test(m[2] ?? '')) out.add(name, 'type', i + 1, !name.startsWith('_'), signature(lines, i, 'none'))
      else if (isUpperConst(name.replace(/^_+/, '')) && name !== '__all__') out.add(name, 'constant', i + 1, !name.startsWith('_'), signature(lines, i, 'none'))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Go
// ─────────────────────────────────────────────────────────────────────────────

function goSymbols(lines: Lines, out: Out): void {
  const { code } = lines
  let depth = 0
  let group: 'const' | 'var' | 'type' | null = null
  for (let i = 0; i < code.length && !out.full(); i++) {
    const line = lines.match[i]
    const atTop = depth === 0
    if (group && /^\s*\)/.test(line)) group = null
    else if (group && atTop) {
      const m = /^\s*([A-Za-z_]\w*)\b(?:\s*(=|[^\s=]+))?/.exec(line)
      if (m && m[1] !== '_') {
        const name = m[1]
        const exported = /^[A-Z]/.test(name)
        if (group === 'type') {
          const rest = line.slice(line.indexOf(name) + name.length)
          const kind: SymbolKind = /^\s*struct\b/.test(rest) ? 'struct' : /^\s*interface\b/.test(rest) ? 'interface' : 'type'
          out.add(name, kind, i + 1, exported, `type ${signature(lines, i, 'brace')}`)
        } else if (group === 'const') out.add(name, 'constant', i + 1, exported, `const ${signature(lines, i, 'none')}`)
        else if (exported) out.add(name, 'variable', i + 1, exported, `var ${signature(lines, i, 'none')}`)
      }
    } else if (atTop) {
      let m = /^func\s*(\([^)]*\))?\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/.exec(line)
      if (m) {
        const name = m[2]
        out.add(name, m[1] ? 'method' : 'function', i + 1, /^[A-Z]/.test(name), signature(lines, i, 'brace'))
      } else if ((m = /^type\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(=\s*)?(struct|interface)?/.exec(line))) {
        const kind: SymbolKind = m[3] === 'struct' ? 'struct' : m[3] === 'interface' ? 'interface' : 'type'
        out.add(m[1], kind, i + 1, /^[A-Z]/.test(m[1]), signature(lines, i, 'brace'))
      } else if ((m = /^(const|var|type)\s*\(\s*$/.exec(line))) {
        group = m[1] as 'const' | 'var' | 'type'
      } else if ((m = /^(const|var)\s+([A-Za-z_]\w*)/.exec(line))) {
        const name = m[2]
        if (m[1] === 'const') out.add(name, 'constant', i + 1, /^[A-Z]/.test(name), signature(lines, i, 'none'))
        else if (/^[A-Z]/.test(name)) out.add(name, 'variable', i + 1, true, signature(lines, i, 'none'))
      }
    }
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rust
// ─────────────────────────────────────────────────────────────────────────────

const RS_VIS = String.raw`(pub(?:\s*\([^)]*\))?\s+)?`
const RS_FN = new RegExp(String.raw`^\s*${RS_VIS}(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)`)
const RS_ITEM = new RegExp(String.raw`^\s*${RS_VIS}(struct|enum|trait|union|type|mod|const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)`)
const RS_IMPL = /^\s*(?:unsafe\s+)?impl\b(?:\s*<[^{]*?>)?\s+(?:[^{]*?\bfor\s+)?([A-Za-z_][\w:]*)/
const RS_MACRO = /^\s*(?:#\[macro_export\]\s*)?macro_rules!\s*([A-Za-z_]\w*)/

function rustSymbols(lines: Lines, out: Out): void {
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    if (scope.kind === 'member') {
      const m = RS_FN.exec(code)
      if (m) out.add(m[2], 'method', line, !!m[1] || scope.container.flags.trait === true, signature(lines, i, 'brace'))
      return
    }
    let m = RS_FN.exec(code)
    if (m) {
      out.add(m[2], 'function', line, !!m[1], signature(lines, i, 'brace'))
      return
    }
    m = RS_IMPL.exec(code)
    if (m) return { kind: 'class', name: m[1].split('::').pop() ?? m[1], exported: true }
    m = RS_ITEM.exec(code)
    if (m) {
      const [, vis, item, name] = m
      const kind: SymbolKind =
        item === 'struct' || item === 'union' ? 'struct' : item === 'enum' ? 'enum' : item === 'trait' ? 'trait' : item === 'type' ? 'type' : item === 'mod' ? 'module' : 'constant'
      out.add(name, kind, line, !!vis, signature(lines, i, item === 'const' || item === 'static' || item === 'type' ? 'none' : 'brace'))
      if (item === 'trait') return { kind: 'class', name, exported: !!vis, flags: { trait: true } }
      if (item === 'mod') return { kind: 'opaque', name, exported: !!vis }
      return item === 'struct' || item === 'enum' || item === 'union' ? { kind: 'opaque', name, exported: !!vis } : undefined
    }
    m = RS_MACRO.exec(code)
    if (m) out.add(m[1], 'function', line, /#\[macro_export\]/.test(annotationsBefore(lines, i) + code), `macro_rules! ${m[1]}`)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Java / Kotlin / Scala / Groovy
// ─────────────────────────────────────────────────────────────────────────────

const ANNOT = String.raw`((?:@[\w.]+(?:\([^)]*\))?\s+)*)`
const JAVA_TYPE = new RegExp(
  String.raw`^\s*${ANNOT}((?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp)\s+)*)(class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)`,
)
const JAVA_METHOD = new RegExp(
  String.raw`^\s*${ANNOT}((?:(?:public|protected|private|abstract|final|static|synchronized|native|default|strictfp)\s+)*)(?:<[^>]+>\s+)?([\w$.]+(?:<[^()]*?>)?(?:\[\])*)\s+([a-zA-Z_$][\w$]*)\s*\(`,
)
const JAVA_CTOR = /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*((?:public|protected|private)\s+)?([A-Z][\w$]*)\s*\(/
const JAVA_CONST = /^\s*(?:(?:public|protected|private)\s+)?(?:static\s+final|final\s+static)\s+[\w$.<>\[\], ?]+?\s+([A-Z][A-Z0-9_]*)\s*=/

const KT_MODS = '(?:public|private|protected|internal|open|abstract|sealed|data|inner|enum|annotation|value|inline|expect|actual|final|companion|override|suspend|infix|operator|tailrec|external|const|lateinit|case|implicit|lazy)'
const KT_TYPE = new RegExp(String.raw`^\s*${ANNOT}((?:${KT_MODS}\s+)*)(class|interface|object|trait|fun\s+interface)\b\s*([A-Za-z_][\w]*)?`)
const KT_FUN = new RegExp(String.raw`^\s*${ANNOT}((?:${KT_MODS}\s+)*)(?:fun|def)\s+(?:<[^>]+>\s+)?(?:[\w.<>?,\s]+\.)?([A-Za-z_][\w]*|\x60[^\x60]+\x60)\s*[([:<]`)
const KT_PROP = new RegExp(String.raw`^\s*${ANNOT}((?:${KT_MODS}\s+)*)(val|var)\s+([A-Za-z_][\w]*)`)
const KT_ALIAS = /^\s*((?:public|private|internal)\s+)?(?:typealias|type)\s+([A-Za-z_]\w*)/

function jvmSymbols(lines: Lines, out: Out, lang: string): void {
  const java = lang === 'java' || lang === 'groovy' || lang === 'apex'
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    const before = annotationsBefore(lines, i)
    if (java) {
      const t = JAVA_TYPE.exec(code)
      if (t) {
        const kind: SymbolKind = t[3] === 'interface' || t[3] === '@interface' ? 'interface' : t[3] === 'enum' ? 'enum' : 'class'
        const exported = /public|protected/.test(t[2]) || (scope.kind === 'member' && scope.container.flags.iface === true)
        out.add(t[4], kind, line, exported, signature(lines, i, 'brace'))
        return { kind: 'class', name: t[4], exported, flags: { iface: kind === 'interface' } }
      }
      if (scope.kind === 'member') {
        const cls = scope.container
        let m = JAVA_CONST.exec(code)
        if (m) {
          out.add(m[1], 'constant', line, !/private/.test(code), signature(lines, i, 'none'))
          return
        }
        m = JAVA_CTOR.exec(code)
        if (m && m[2] === cls.name) {
          out.add(m[2], 'method', line, !!m[1] && !/private/.test(m[1]), signature(lines, i, 'brace'))
          return
        }
        m = JAVA_METHOD.exec(code)
        if (m && !CONTROL.has(m[4]) && !CONTROL.has(m[3]) && m[3] !== 'return') {
          const exported = cls.flags.iface === true ? !/private/.test(m[2]) : /public|protected/.test(m[2])
          out.add(m[4], 'method', line, exported, signature(lines, i, 'brace'))
          return
        }
        if (lang === 'groovy') {
          const g = /^\s*(?:(?:public|private|protected|static)\s+)*def\s+([A-Za-z_]\w*)\s*\(/.exec(code)
          if (g) out.add(g[1], 'method', line, !/private/.test(code), signature(lines, i, 'brace'))
        }
        return
      }
      if (lang === 'groovy') {
        const g = /^\s*(?:(?:public|private|static)\s+)*def\s+([A-Za-z_]\w*)\s*\(/.exec(code)
        if (g) out.add(g[1], 'function', line, !/private/.test(code), signature(lines, i, 'brace'))
      }
      return
    }
    // Kotlin / Scala
    let m = KT_TYPE.exec(code)
    if (m) {
      const mods = m[2]
      const word = m[3]
      const isCompanion = /\bcompanion\b/.test(mods)
      const name = m[4] ?? (isCompanion ? 'Companion' : '')
      const kind: SymbolKind = /\benum\b/.test(mods) ? 'enum' : word === 'interface' || word.startsWith('fun') || word === 'trait' ? (word === 'trait' ? 'trait' : 'interface') : 'class'
      const exported = !/\bprivate\b/.test(mods)
      if (name && !isCompanion) out.add(name, kind, line, exported, signature(lines, i, 'brace'))
      return { kind: 'class', name, exported }
    }
    m = KT_FUN.exec(code)
    if (m) {
      const name = m[3].replace(/`/g, '')
      const exported = !/\bprivate\b/.test(m[2])
      const composable = /@Composable/.test(before + m[1])
      const kind: SymbolKind = scope.kind === 'member' ? 'method' : composable && isPascal(name) ? 'component' : 'function'
      out.add(name, kind, line, exported && (scope.kind !== 'member' || scope.container.exported), signature(lines, i, 'brace'))
      return
    }
    if (scope.kind === 'top') {
      m = KT_ALIAS.exec(code)
      if (m) {
        out.add(m[2], 'type', line, !/private/.test(m[1] ?? ''), signature(lines, i, 'none'))
        return
      }
      m = KT_PROP.exec(code)
      if (m) {
        const name = m[4]
        const isConst = /\bconst\b/.test(m[2]) || isUpperConst(name)
        out.add(name, isConst ? 'constant' : 'variable', line, !/\bprivate\b/.test(m[2]), signature(lines, i, 'none'))
      }
    } else if (scope.kind === 'member') {
      m = KT_PROP.exec(code)
      if (m && /\bconst\b/.test(m[2])) out.add(m[4], 'constant', line, !/\bprivate\b/.test(m[2]), signature(lines, i, 'none'))
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// C#
// ─────────────────────────────────────────────────────────────────────────────

const CS_MODS = '(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|ref|unsafe|file|new|virtual|override|async|extern|required|volatile)'
const CS_TYPE = new RegExp(String.raw`^\s*((?:\[[^\]]*\]\s*)*)((?:${CS_MODS}\s+)*)(class|interface|struct|enum|record(?:\s+struct|\s+class)?)\s+([A-Za-z_]\w*)`)
const CS_NAMESPACE = /^\s*namespace\s+([\w.]+)\s*(;)?/
const CS_METHOD = new RegExp(String.raw`^\s*((?:\[[^\]]*\]\s*)*)((?:${CS_MODS}\s+)*)([\w.]+(?:<[^()]*?>)?(?:\[\])?\??|\([^)]*\))\s+([A-Za-z_]\w*)\s*(?:<[^>(]*>)?\s*\(`)
const CS_CTOR = new RegExp(String.raw`^\s*((?:${CS_MODS}\s+)*)([A-Z]\w*)\s*\(`)
const CS_CONST = new RegExp(String.raw`^\s*((?:${CS_MODS}\s+)*)const\s+[\w.<>?]+\s+([A-Za-z_]\w*)\s*=`)

function csharpSymbols(lines: Lines, out: Out): void {
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    let m = CS_NAMESPACE.exec(code)
    if (m && scope.kind === 'top') {
      out.add(m[1], 'module', line, true, `namespace ${m[1]}`)
      return m[2] ? undefined : { kind: 'namespace', name: m[1], exported: true }
    }
    m = CS_TYPE.exec(code)
    if (m) {
      const word = m[3]
      const kind: SymbolKind = word === 'interface' ? 'interface' : word === 'enum' ? 'enum' : word === 'struct' || word === 'record struct' ? 'struct' : 'class'
      const exported = scope.kind === 'member' ? /public|internal|protected/.test(m[2]) : !/private/.test(m[2])
      out.add(m[4], kind, line, exported, signature(lines, i, 'brace'))
      return { kind: 'class', name: m[4], exported, flags: { iface: kind === 'interface' } }
    }
    if (scope.kind !== 'member') return
    const cls = scope.container
    m = CS_CONST.exec(code)
    if (m) {
      out.add(m[2], 'constant', line, /public|internal|protected/.test(m[1]), signature(lines, i, 'none'))
      return
    }
    m = CS_CTOR.exec(code)
    if (m && m[2] === cls.name) {
      out.add(m[2], 'method', line, /public|internal|protected/.test(m[1]), signature(lines, i, 'brace'))
      return
    }
    m = CS_METHOD.exec(code)
    if (m && !CONTROL.has(m[4]) && !CONTROL.has(m[3]) && m[3] !== 'return' && m[3] !== 'await') {
      const exported = cls.flags.iface === true || /public|internal|protected/.test(m[2])
      out.add(m[4], 'method', line, exported, signature(lines, i, 'brace'))
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Swift
// ─────────────────────────────────────────────────────────────────────────────

const SW_MODS = '(?:public|private|fileprivate|internal|open|final|indirect|static|class|override|mutating|nonmutating|convenience|required|async|nonisolated|dynamic|lazy|weak|unowned|package)'
const SW_TYPE = new RegExp(String.raw`^\s*${ANNOT}((?:${SW_MODS}\s+)*)(class|struct|enum|protocol|actor|extension)\s+([A-Za-z_][\w.]*)([^{]*)`)
const SW_FUNC = new RegExp(String.raw`^\s*${ANNOT}((?:${SW_MODS}\s+)*)func\s+([A-Za-z_]\w*|[^\s(<]+)\s*(?:<[^>]*>)?\s*\(`)
const SW_INIT = new RegExp(String.raw`^\s*${ANNOT}((?:${SW_MODS}\s+)*)init[?!]?\s*(?:<[^>]*>)?\s*\(`)
const SW_ALIAS = new RegExp(String.raw`^\s*((?:${SW_MODS}\s+)*)typealias\s+([A-Za-z_]\w*)`)
const SW_LET = new RegExp(String.raw`^\s*((?:${SW_MODS}\s+)*)(let|var)\s+([A-Za-z_]\w*)`)

function swiftSymbols(lines: Lines, out: Out): void {
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    const visible = (mods: string) => !/\b(?:private|fileprivate)\b/.test(mods)
    let m = SW_TYPE.exec(code)
    if (m) {
      const word = m[3]
      const name = m[4]
      const exported = visible(m[2])
      if (word !== 'extension') {
        const isView = word === 'struct' && /:\s*(?:[\w.]+\s*,\s*)*(?:SwiftUI\.)?View\b/.test(m[5])
        const kind: SymbolKind = isView ? 'component' : word === 'struct' ? 'struct' : word === 'enum' ? 'enum' : word === 'protocol' ? 'interface' : 'class'
        out.add(name, kind, line, exported, signature(lines, i, 'brace'))
      }
      return { kind: 'class', name, exported, flags: { iface: word === 'protocol' } }
    }
    m = SW_FUNC.exec(code)
    if (m) {
      const exported = visible(m[2]) && (scope.kind !== 'member' || scope.container.exported)
      out.add(m[3], scope.kind === 'member' ? 'method' : 'function', line, exported, signature(lines, i, 'brace'))
      return
    }
    if (scope.kind === 'member') {
      m = SW_INIT.exec(code)
      if (m) out.add('init', 'method', line, visible(m[2]) && scope.container.exported, signature(lines, i, 'brace'))
      return
    }
    m = SW_ALIAS.exec(code)
    if (m) {
      out.add(m[2], 'type', line, visible(m[1]), signature(lines, i, 'none'))
      return
    }
    m = SW_LET.exec(code)
    if (m && m[2] === 'let') out.add(m[3], 'constant', line, visible(m[1]), signature(lines, i, 'none'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dart
// ─────────────────────────────────────────────────────────────────────────────

const DART_TYPE = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*((?:abstract|sealed|base|final|interface|mixin)\s+)*(class|mixin|enum|extension(?:\s+type)?)\s+([A-Za-z_]\w*)?([^{]*)/
const DART_FUNC = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*((?:static|external|factory|const)\s+)*(?:([\w<>?,\[\] ]+?)\s+)?(?:(get|set|operator)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*(?:<[^>(]*>)?\s*\(/
const DART_GETTER = /^\s*(?:@\w+\s+)*(?:static\s+)?(?:[\w<>?,\[\] ]+\s+)?get\s+([A-Za-z_]\w*)\s*(?:=>|\{|async)/
const DART_TYPEDEF = /^\s*typedef\s+([A-Za-z_]\w*)/

function dartSymbols(lines: Lines, out: Out): void {
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    let m = DART_TYPE.exec(code)
    if (m && (m[3] || m[2].startsWith('extension'))) {
      const name = m[3] ?? 'extension'
      const rest = m[4] ?? ''
      const isWidget = /\bextends\s+(?:StatelessWidget|StatefulWidget|HookWidget|ConsumerWidget|HookConsumerWidget|ConsumerStatefulWidget)\b/.test(rest)
      const kind: SymbolKind = isWidget ? 'component' : m[2] === 'enum' ? 'enum' : m[2] === 'mixin' ? 'trait' : /interface/.test(m[1] ?? '') ? 'interface' : 'class'
      if (m[3]) out.add(name, kind, line, !name.startsWith('_'), signature(lines, i, 'brace'))
      return { kind: 'class', name, exported: !name.startsWith('_') }
    }
    m = DART_TYPEDEF.exec(code)
    if (m && scope.kind === 'top') {
      out.add(m[1], 'type', line, !m[1].startsWith('_'), signature(lines, i, 'none'))
      return
    }
    m = DART_GETTER.exec(code)
    if (m && scope.kind === 'member') {
      out.add(m[1], 'method', line, !m[1].startsWith('_'), signature(lines, i, 'brace'))
      return
    }
    m = DART_FUNC.exec(code)
    if (m) {
      const name = m[4]
      const ret = (m[2] ?? '').trim()
      if (CONTROL.has(name) || CONTROL.has(ret.split(/\s+/).pop() ?? '') || /=/.test(ret)) return
      if (scope.kind === 'top' && !ret && name !== 'main') return
      const local = name.split('.').pop() ?? name
      out.add(name, scope.kind === 'member' ? 'method' : 'function', line, !local.startsWith('_'), signature(lines, i, 'brace'))
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PHP
// ─────────────────────────────────────────────────────────────────────────────

const PHP_TYPE = /^\s*(?:#\[[^\]]*\]\s*)*((?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)/
const PHP_FUNC = /^\s*(?:#\[[^\]]*\]\s*)*((?:(?:public|private|protected|static|abstract|final|readonly)\s+)*)function\s+&?\s*([A-Za-z_]\w*)\s*\(/
const PHP_CONST = /^\s*((?:public|private|protected|final)\s+)*const\s+(?:[\w?|]+\s+)?([A-Za-z_]\w*)\s*=/
const PHP_NAMESPACE = /^\s*namespace\s+([\w\\]+)\s*(;|\{)?/

function phpSymbols(lines: Lines, out: Out): void {
  braceEngine(lines, (i, scope) => {
    const code = lines.match[i]
    const line = i + 1
    let m = PHP_NAMESPACE.exec(code)
    if (m && scope.kind === 'top') {
      out.add(m[1], 'module', line, true, `namespace ${m[1]}`)
      return m[2] === '{' ? { kind: 'namespace', name: m[1], exported: true } : undefined
    }
    m = PHP_TYPE.exec(code)
    if (m && scope.kind === 'top') {
      const kind: SymbolKind = m[2] === 'interface' ? 'interface' : m[2] === 'trait' ? 'trait' : m[2] === 'enum' ? 'enum' : 'class'
      out.add(m[3], kind, line, true, signature(lines, i, 'brace'))
      return { kind: 'class', name: m[3], exported: true }
    }
    m = PHP_FUNC.exec(code)
    if (m) {
      out.add(m[2], scope.kind === 'member' ? 'method' : 'function', line, !/private|protected/.test(m[1]), signature(lines, i, 'brace'))
      return
    }
    m = PHP_CONST.exec(code)
    if (m) out.add(m[2], 'constant', line, !/private|protected/.test(m[1] ?? ''), signature(lines, i, 'none'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// C / C++ / Objective-C
// ─────────────────────────────────────────────────────────────────────────────

const C_NAMESPACE = /^\s*(?:inline\s+)?namespace\s+([\w:]+)?\s*(?:\{|$)/
const C_EXTERN_C = /^\s*extern\s+" *"\s*\{/
const C_TYPE = /^\s*(?:template\s*<[^>]*>\s*)?(typedef\s+)?(class|struct|union|enum(?:\s+class|\s+struct)?)\s+(?:(?:__declspec\([^)]*\)|alignas\([^)]*\)|[A-Z_][A-Z0-9_]*_API|[A-Z_]+_EXPORT)\s+)*([A-Za-z_]\w*)?\s*(?:final\s*)?(?::[^;{]*)?\s*(\{.*|$)/
const C_FUNC = /^\s*(?:template\s*<[^>]*>\s*)?((?:(?:static|inline|extern|virtual|constexpr|consteval|explicit|friend|unsigned|signed|long|short|const|volatile|struct|enum|__inline|__forceinline|[A-Z_][A-Z0-9_]*_API)\s+)*)([A-Za-z_][\w:<>,]*(?:\s*[*&]+\s*|\s+))+([A-Za-z_~][\w:~]*|operator\s*[^\s(]+)\s*\(/
const C_FUNC_NAME_ONLY = /^([A-Za-z_]\w*)\s*\(/
/** Real declarations have a handful of words before their "(": more than this and C_FUNC is not even tried. */
const C_MAX_HEAD_WORDS = 24

/**
 * C_FUNC on a line, only when the line could be a declaration: it has a "(" with few words before it.
 * Qualifiers (static, const …) can be read as part of the type or as qualifiers, so a line of hundreds of them
 * makes C_FUNC try every split, which is slow; no real declaration looks like that.
 */
function cFunc(code: string): RegExpExecArray | null {
  const open = code.indexOf('(')
  if (open === -1) return null
  let words = 0
  let inWord = false
  for (let k = 0; k < open; k++) {
    const c = code.charCodeAt(k)
    const w = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
    if (w && !inWord && ++words > C_MAX_HEAD_WORDS) return null
    inWord = w
  }
  return C_FUNC.exec(code)
}
const C_DEFINE = /^\s*#\s*define\s+([A-Za-z_]\w*)(\()?/
const C_TYPEDEF = /^\s*typedef\s+[^;{]+?\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;/
const C_ACCESS = /^\s*(public|private|protected)\s*:/
const C_NOT_TYPES = new Set(['return', 'else', 'new', 'delete', 'case', 'goto', 'throw', 'co_return', 'co_yield', 'co_await', 'using', 'typedef', 'namespace', 'sizeof', 'if', 'while', 'for', 'switch'])

/** Whether the declaration starting at line i is a definition (has a body), not a prototype or a call. */
function hasBody(lines: Lines, i: number): boolean {
  let depth = 0
  for (let k = i; k < Math.min(lines.code.length, i + 10); k++) {
    const code = lines.code[k]
    for (let c = 0; c < code.length; c++) {
      const ch = code[c]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (depth <= 0) {
        if (ch === '{') return true
        if (ch === ';' || ch === '=') return false
      }
    }
  }
  return false
}

function cSymbols(lines: Lines, out: Out, lang: string): void {
  const objc = lang.startsWith('objective-c')
  const cpp = lang !== 'c'
  braceEngine(
    lines,
    (i, scope): Decl | void => {
      const code = lines.match[i]
      const line = i + 1
      let m = C_DEFINE.exec(code)
      if (m) {
        if (!/^_*[A-Z0-9_]*_H(?:PP)?_*$|_INCLUDED$/.test(m[1])) out.add(m[1], m[2] ? 'function' : 'constant', line, true, signature(lines, i, 'none'))
        return
      }
      if (/^\s*#/.test(code)) return
      if (objc) {
        const o = /^\s*@(interface|implementation|protocol)\s+([A-Za-z_]\w*)/.exec(code)
        if (o) {
          if (o[1] !== 'implementation') out.add(o[2], o[1] === 'protocol' ? 'interface' : 'class', line, true, signature(lines, i, 'none'))
          return
        }
        const meth = /^\s*([-+])\s*\([^)]*\)\s*([A-Za-z_]\w*)/.exec(code)
        if (meth) {
          out.add(meth[2], 'method', line, true, signature(lines, i, 'brace'))
          return
        }
      }
      if (C_NAMESPACE.test(code) && cpp) {
        const name = C_NAMESPACE.exec(code)?.[1]
        if (name) out.add(name, 'module', line, true, `namespace ${name}`)
        return { kind: 'namespace', name: name ?? '', exported: true }
      }
      if (C_EXTERN_C.test(code)) return { kind: 'namespace', name: 'extern "C"', exported: true }
      if (scope.kind === 'member') {
        const cls = scope.container
        const acc = C_ACCESS.exec(code)
        if (acc) {
          cls.flags.access = acc[1]
          return
        }
        const exported = (cls.flags.access ?? (cls.flags.isStruct ? 'public' : 'private')) !== 'private'
        const ctor = new RegExp(String.raw`^\s*(?:(?:explicit|virtual|constexpr|inline)\s+)*(~?${cls.name})\s*\(`).exec(code)
        if (ctor) {
          out.add(ctor[1], 'method', line, exported, signature(lines, i, 'brace'))
          return
        }
        m = cFunc(code)
        if (m && !C_NOT_TYPES.has(m[2].trim()) && !CONTROL.has(m[3])) {
          out.add(m[3], 'method', line, exported, signature(lines, i, 'brace'))
          return
        }
      }
      m = C_TYPE.exec(code)
      if (m && !/;\s*$/.test(code.replace(/\{.*\}/, ''))) {
        const word = m[2]
        const name = m[3] ?? ''
        const kind: SymbolKind = word.startsWith('enum') ? 'enum' : word === 'class' ? 'class' : 'struct'
        if (name) out.add(name, kind, line, true, signature(lines, i, 'brace'))
        if (word.startsWith('enum')) return { kind: 'opaque', name, exported: true, flags: { typedef: !!m[1], declLine: String(line), kind } }
        return { kind: 'class', name, exported: true, flags: { isStruct: word !== 'class', typedef: !!m[1] && !name, declLine: String(line), kind } }
      }
      m = C_TYPEDEF.exec(code)
      if (m && scope.kind === 'top') {
        out.add(m[1], 'type', line, true, signature(lines, i, 'none'))
        return
      }
      if (scope.kind !== 'top') return
      m = cFunc(code)
      if (m && !C_NOT_TYPES.has(m[2].trim().split(/\s+/)[0] ?? '') && !CONTROL.has(m[3]) && hasBody(lines, i)) {
        const name = m[3]
        out.add(name, name.includes('::') ? 'method' : 'function', line, !/\bstatic\b/.test(m[1]), signature(lines, i, 'brace'))
        return
      }
      // GNU style: return type on the previous line, name at column 0.
      m = C_FUNC_NAME_ONLY.exec(code)
      if (m && !CONTROL.has(m[1]) && i > 0 && /^[A-Za-z_][\w\s*]*$/.test(lines.match[i - 1].trim()) && hasBody(lines, i)) {
        const prev = lines.match[i - 1].trim()
        if (prev && !/[;{}]$/.test(prev)) out.add(m[1], 'function', line, !/\bstatic\b/.test(prev), `${prev} ${signature(lines, i, 'brace')}`)
      }
    },
    (c, closeLine) => {
      // typedef struct { … } Name;
      if (c.flags.typedef && !c.name) {
        const m = /^\s*\}\s*([A-Za-z_]\w*)\s*;/.exec(lines.match[closeLine] ?? '')
        if (m) out.add(m[1], (c.flags.kind as SymbolKind) || 'struct', Number(c.flags.declLine) || closeLine + 1, true, `typedef ${String(c.flags.kind)} ${m[1]}`)
      }
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ruby, Elixir, Lua, Shell, R and the long tail (line based)
// ─────────────────────────────────────────────────────────────────────────────

function rubySymbols(lines: Lines, out: Out): void {
  const stack: { indent: number; kind: 'class' | 'module'; visibility: 'public' | 'private' | 'protected' }[] = []
  lines.code.forEach((line, i) => {
    if (!/\S/.test(line)) return
    const indent = line.length - line.trimStart().length
    const t = lines.match[i].trim()
    while (stack.length && /^end\b/.test(t) && indent <= stack[stack.length - 1].indent) {
      if (indent === stack[stack.length - 1].indent) {
        stack.pop()
        return
      }
      stack.pop()
    }
    while (stack.length && indent < stack[stack.length - 1].indent) stack.pop()
    const top = stack[stack.length - 1]
    let m = /^(class|module)\s+([A-Z][\w:]*)(?:\s*<\s*([\w:]+))?/.exec(t)
    if (m && !/^class\s*<</.test(t)) {
      out.add(m[2], m[1] === 'class' ? 'class' : 'module', i + 1, true, signature(lines, i, 'none'))
      if (!/\bend\s*$/.test(t)) stack.push({ indent, kind: m[1] as 'class' | 'module', visibility: 'public' })
      return
    }
    if (top && /^(private|protected|public)\s*$/.test(t)) {
      top.visibility = t as 'public' | 'private' | 'protected'
      return
    }
    m = /^def\s+(self\.)?([A-Za-z_]\w*[?!=]?|\[\]=?|[+\-*/<=>!%&|^~]+)/.exec(t)
    if (m) {
      const inClass = !!top && indent > top.indent
      const privateInline = /^private\s+def\b/.test(t)
      out.add(m[2], inClass ? 'method' : 'function', i + 1, !privateInline && (!inClass || top.visibility === 'public' || !!m[1]), signature(lines, i, 'none'))
      return
    }
    m = /^private\s+def\s+([A-Za-z_]\w*[?!=]?)/.exec(t)
    if (m) {
      out.add(m[1], top ? 'method' : 'function', i + 1, false, signature(lines, i, 'none'))
      return
    }
    m = /^([A-Z][A-Z0-9_]*)\s*=(?!=)/.exec(t)
    if (m && (!top || indent > top.indent)) out.add(m[1], 'constant', i + 1, true, signature(lines, i, 'none'))
  })
}

function elixirSymbols(lines: Lines, out: Out): void {
  lines.match.forEach((line, i) => {
    let m = /^\s*defmodule\s+([A-Z][\w.]*)\s+do\b/.exec(line)
    if (m) return out.add(m[1], 'module', i + 1, true, `defmodule ${m[1]}`)
    m = /^\s*(def|defp|defmacro|defmacrop|defguard|defguardp|defdelegate)\s+([a-z_][\w]*[?!]?)/.exec(line)
    if (m) return out.add(m[2], 'function', i + 1, !m[1].endsWith('p'), signature(lines, i, 'none').replace(/\s+do$/, ''))
    m = /^\s*(defprotocol|defimpl)\s+([A-Z][\w.]*)/.exec(line)
    if (m) return out.add(m[2], m[1] === 'defprotocol' ? 'interface' : 'module', i + 1, true, signature(lines, i, 'none'))
    m = /^\s*defstruct\b/.exec(line)
    if (m) return out.add('struct', 'struct', i + 1, true, signature(lines, i, 'none'))
    m = /^\s*@type\s+([a-z_]\w*)/.exec(line)
    if (m) out.add(m[1], 'type', i + 1, true, signature(lines, i, 'none'))
  })
}

function luaSymbols(lines: Lines, out: Out): void {
  lines.match.forEach((line, i) => {
    let m = /^\s*(local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(/.exec(line)
    if (m) return out.add(m[2], m[2].includes(':') ? 'method' : 'function', i + 1, !m[1], signature(lines, i, 'none'))
    m = /^\s*(local\s+)?([A-Za-z_][\w.:]*)\s*=\s*function\s*\(/.exec(line)
    if (m) out.add(m[2], 'function', i + 1, !m[1], signature(lines, i, 'none'))
  })
}

function shellSymbols(lines: Lines, out: Out): void {
  lines.match.forEach((line, i) => {
    const m = /^\s*(?:function\s+([A-Za-z_][\w:.-]*)\s*(?:\(\s*\))?|([A-Za-z_][\w:.-]*)\s*\(\s*\))\s*\{?/.exec(line)
    if (m && (m[1] || m[2])) out.add((m[1] ?? m[2]) as string, 'function', i + 1, true, signature(lines, i, 'brace'))
  })
}

function rSymbols(lines: Lines, out: Out): void {
  lines.match.forEach((line, i) => {
    const m = /^([A-Za-z.][\w.]*)\s*(?:<-|=)\s*function\s*\(/.exec(line)
    if (m) out.add(m[1], 'function', i + 1, !m[1].startsWith('.'), signature(lines, i, 'brace'))
  })
}

type LineRule = [RegExp, SymbolKind, (m: RegExpExecArray) => { name: string; exported?: boolean } | null]

const name1 = (m: RegExpExecArray) => ({ name: m[1] })

const OTHER_RULES: Record<string, LineRule[]> = {
  solidity: [
    [/^\s*(?:abstract\s+)?contract\s+([A-Za-z_]\w*)/, 'class', name1],
    [/^\s*interface\s+([A-Za-z_]\w*)/, 'interface', name1],
    [/^\s*library\s+([A-Za-z_]\w*)/, 'module', name1],
    [/^\s*function\s+([A-Za-z_]\w*)\s*\(([^)]*\))?([^{;]*)/, 'function', (m) => ({ name: m[1], exported: !/\b(?:private|internal)\b/.test(m[3] ?? '') })],
    [/^\s*(?:event|modifier)\s+([A-Za-z_]\w*)/, 'function', name1],
    [/^\s*struct\s+([A-Za-z_]\w*)/, 'struct', name1],
    [/^\s*enum\s+([A-Za-z_]\w*)/, 'enum', name1],
  ],
  zig: [
    [/^\s*(pub\s+)?(?:export\s+|inline\s+)*fn\s+([A-Za-z_]\w*)/, 'function', (m) => ({ name: m[2], exported: !!m[1] })],
    [/^\s*(pub\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:extern\s+|packed\s+)?struct\b/, 'struct', (m) => ({ name: m[2], exported: !!m[1] })],
    [/^\s*(pub\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:enum|union)\b/, 'enum', (m) => ({ name: m[2], exported: !!m[1] })],
  ],
  haskell: [
    [/^([a-z_][\w']*)\s*::/, 'function', name1],
    [/^(?:data|newtype)\s+([A-Z][\w']*)/, 'type', name1],
    [/^type\s+([A-Z][\w']*)/, 'type', name1],
    [/^class\s+(?:\([^)]*\)\s*=>\s*)?([A-Z][\w']*)/, 'interface', name1],
    [/^module\s+([A-Z][\w.']*)/, 'module', name1],
  ],
  elm: [
    [/^([a-z_][\w']*)\s*:(?!:)/, 'function', name1],
    [/^type\s+alias\s+([A-Z]\w*)/, 'type', name1],
    [/^type\s+([A-Z]\w*)/, 'type', name1],
    [/^(?:port\s+)?module\s+([A-Z][\w.]*)/, 'module', name1],
  ],
  julia: [
    [/^\s*function\s+([A-Za-z_][\w.!]*)/, 'function', name1],
    [/^\s*(?:mutable\s+)?struct\s+([A-Za-z_]\w*)/, 'struct', name1],
    [/^\s*(?:abstract\s+type)\s+([A-Za-z_]\w*)/, 'type', name1],
    [/^\s*module\s+([A-Za-z_]\w*)/, 'module', name1],
    [/^\s*macro\s+([A-Za-z_]\w*)/, 'function', name1],
    [/^([A-Za-z_][\w!]*)\([^)]*\)\s*=[^=]/, 'function', name1],
  ],
  perl: [
    [/^\s*sub\s+([A-Za-z_]\w*)/, 'function', (m) => ({ name: m[1], exported: !m[1].startsWith('_') })],
    [/^\s*package\s+([\w:]+)\s*;/, 'module', name1],
  ],
  clojure: [
    [/^\s*\(defn-\s+([^\s()[\]]+)/, 'function', (m) => ({ name: m[1], exported: false })],
    [/^\s*\(defn\s+([^\s()[\]]+)/, 'function', name1],
    [/^\s*\(defmacro\s+([^\s()[\]]+)/, 'function', name1],
    [/^\s*\(def\s+([^\s()[\]]+)/, 'constant', name1],
    [/^\s*\(defprotocol\s+([^\s()[\]]+)/, 'interface', name1],
    [/^\s*\(def(?:record|type)\s+([^\s()[\]]+)/, 'struct', name1],
    [/^\s*\(ns\s+([^\s()[\]]+)/, 'module', name1],
  ],
  erlang: [
    [/^-module\(([a-z]\w*)\)/, 'module', name1],
    [/^([a-z]\w*)\s*\([^)]*\)\s*(?:when\b.*)?->/, 'function', name1],
    [/^-record\(([a-z]\w*)/, 'struct', name1],
  ],
  ocaml: [
    [/^let\s+(?:rec\s+)?([a-z_][\w']*)/, 'function', name1],
    [/^type\s+(?:'?\w+\s+)?([a-z_][\w']*)/, 'type', name1],
    [/^module\s+(?:type\s+)?([A-Z][\w']*)/, 'module', name1],
  ],
  'f#': [
    [/^\s*let\s+(?:rec\s+|inline\s+|private\s+)*([A-Za-z_][\w']*)/, 'function', name1],
    [/^\s*type\s+([A-Z][\w']*)/, 'type', name1],
    [/^\s*module\s+([A-Z][\w.']*)/, 'module', name1],
  ],
  nim: [
    [/^\s*(?:proc|func|method|iterator|template|macro)\s+`?([A-Za-z_]\w*)`?(\*)?/, 'function', (m) => ({ name: m[1], exported: !!m[2] })],
    [/^\s*([A-Z]\w*)(\*)?\s*(?:\[[^\]]*\])?\s*=\s*(?:ref\s+|ptr\s+)?object\b/, 'struct', (m) => ({ name: m[1], exported: !!m[2] })],
    [/^\s*([A-Z]\w*)(\*)?\s*=\s*enum\b/, 'enum', (m) => ({ name: m[1], exported: !!m[2] })],
  ],
  gdscript: [
    [/^\s*(?:static\s+)?func\s+([A-Za-z_]\w*)/, 'function', (m) => ({ name: m[1], exported: !m[1].startsWith('_') })],
    [/^\s*class_name\s+([A-Za-z_]\w*)/, 'class', name1],
    [/^\s*class\s+([A-Za-z_]\w*)/, 'class', name1],
    [/^\s*signal\s+([A-Za-z_]\w*)/, 'function', name1],
    [/^\s*enum\s+([A-Za-z_]\w*)/, 'enum', name1],
    [/^\s*const\s+([A-Za-z_]\w*)/, 'constant', name1],
  ],
  powershell: [
    [/^\s*function\s+([A-Za-z_][\w-]*)/i, 'function', name1],
    [/^\s*class\s+([A-Za-z_]\w*)/i, 'class', name1],
  ],
  crystal: [
    [/^\s*(?:abstract\s+)?(?:class|struct)\s+([A-Z][\w:]*)/, 'class', name1],
    [/^\s*module\s+([A-Z][\w:]*)/, 'module', name1],
    [/^\s*(?:private\s+)?def\s+(?:self\.)?([a-z_]\w*[?!]?)/, 'function', name1],
  ],
  sql: [
    [/^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i, 'struct', (m) => ({ name: m[1].replace(/["`[\]]/g, '') })],
    [/^\s*create\s+(?:or\s+replace\s+)?(?:function|procedure|trigger)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i, 'function', (m) => ({ name: m[1].replace(/["`[\]]/g, '') })],
    [/^\s*create\s+(?:type)\s+([\w."`[\]]+)/i, 'type', (m) => ({ name: m[1].replace(/["`[\]]/g, '') })],
  ],
  graphql: [
    [/^\s*(?:extend\s+)?type\s+([A-Za-z_]\w*)/, 'type', name1],
    [/^\s*(?:interface)\s+([A-Za-z_]\w*)/, 'interface', name1],
    [/^\s*(?:input)\s+([A-Za-z_]\w*)/, 'type', name1],
    [/^\s*enum\s+([A-Za-z_]\w*)/, 'enum', name1],
    [/^\s*(?:query|mutation|subscription|fragment)\s+([A-Za-z_]\w*)/, 'function', name1],
    [/^\s*scalar\s+([A-Za-z_]\w*)/, 'type', name1],
  ],
  'protocol buffer': [
    [/^\s*message\s+([A-Za-z_]\w*)/, 'struct', name1],
    [/^\s*service\s+([A-Za-z_]\w*)/, 'interface', name1],
    [/^\s*enum\s+([A-Za-z_]\w*)/, 'enum', name1],
    [/^\s*rpc\s+([A-Za-z_]\w*)/, 'method', name1],
  ],
  vyper: [
    [/^\s*def\s+([A-Za-z_]\w*)/, 'function', name1],
    [/^\s*(?:struct|event)\s+([A-Za-z_]\w*)/, 'struct', name1],
  ],
}

function lineRules(lines: Lines, out: Out, rules: LineRule[], cut: Cut = 'none'): void {
  lines.match.forEach((line, i) => {
    for (const [re, kind, pick] of rules) {
      const m = re.exec(line)
      if (!m) continue
      const r = pick(m)
      if (r?.name) out.add(r.name, kind, i + 1, r.exported ?? true, signature(lines, i, cut))
      break
    }
  })
}

/**
 * Prisma schema: only top-level blocks — `model User {`, `view X {`, `enum Role {`, `type Address {`.
 * Inside a block every line is a field, and fields are often called `type` or `model` (NextAuth's Account model has
 * `type String`), so those must never be read as declarations.
 */
function prismaSymbols(lines: Lines, out: Out): void {
  let depth = 0
  lines.match.forEach((line, i) => {
    if (depth === 0) {
      const m = /^[ \t]*(model|view|enum|type)[ \t]+([A-Za-z_]\w*)[ \t]*\{/.exec(line)
      if (m) out.add(m[2], m[1] === 'enum' ? 'enum' : m[1] === 'type' ? 'type' : 'struct', i + 1, true, signature(lines, i, 'brace'))
    }
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
  })
}

/** HCL / Terraform: names live in strings ("resource "aws_s3_bucket" "logs""), so read them from the text view. */
function hclSymbols(lines: Lines, out: Out): void {
  lines.text.forEach((line, i) => {
    const m = /^\s*(resource|data|module|variable|output|provider)\s+"([^"]+)"(?:\s+"([^"]+)")?/.exec(line)
    if (!m) return
    const name = m[3] ? `${m[2]}.${m[3]}` : m[2]
    const kind: SymbolKind = m[1] === 'variable' ? 'variable' : m[1] === 'output' ? 'constant' : 'module'
    out.add(name, kind, i + 1, true, signature(lines, i, 'brace'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-file components
// ─────────────────────────────────────────────────────────────────────────────

function componentNameFromFile(path: string): string {
  const base = basename(path).replace(/\.[^.]+$/, '')
  const cleaned = base.replace(/^\+/, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) || 'Component'
}

function sfcSymbols(path: string, content: string, lang: string, out: Out): void {
  const text = maskSource(content, lang).text
  const firstTag = /<(template|script|style)\b|^---/m.exec(text)
  const line = firstTag ? text.slice(0, firstTag.index).split('\n').length : 1
  out.add(componentNameFromFile(path), 'component', line, true, `${lang === 'astro' ? 'Astro' : lang === 'svelte' ? 'Svelte' : 'Vue'} component`)
  const ranges: [number, number][] = []
  if (lang === 'astro') {
    const fm = /^﻿?[ \t]*---[ \t]*\r?\n/.exec(content)
    if (fm) {
      const close = /^[ \t]*---[ \t]*$/m.exec(content.slice(fm[0].length))
      ranges.push([fm[0].length, close ? fm[0].length + close.index : content.length])
    }
  }
  for (const b of findTagBlocks(text, 'script')) if (b.end > b.start) ranges.push([b.start, b.end])
  if (!ranges.length) return
  const script = keepRanges(content, ranges)
  jsSymbols(toLines(script, 'TypeScript'), out, true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract top-level named definitions (regex-based) with 1-based line numbers and a short one-line signature.
 * JS/TS: functions, arrow-function consts, classes (+ methods), interfaces, types, enums, namespaces, React components
 * (PascalCase function/const in .jsx/.tsx/.vue/.svelte files or in any file that returns JSX, memo/forwardRef/styled
 * wrappers, class components) and hooks (use[A-Z]…); exported flag (incl. `export { … }`, `module.exports`).
 * Vue/Svelte/Astro: the component itself (named after the file) + symbols of the <script> block(s).
 * Python: def/async def/class at column 0, methods of top-level classes, UPPER_CASE constants, type aliases;
 * exported = not starting with "_".
 * Go: func (incl. methods with receivers), type X struct/interface (incl. grouped), consts; exported = Capitalized.
 * Rust: fn, struct, enum, trait, type, mod, const/static, macro_rules!, methods inside impl/trait blocks; exported = pub.
 * Java/Kotlin/Scala/Groovy/C#: class/interface/enum/record/object + methods/constructors/constants (Jetpack Compose
 * @Composable functions → component). Swift: func/class/struct/enum/protocol/actor (+ methods; SwiftUI Views →
 * component). Dart: classes/mixins/enums/functions (Flutter widgets → component). Ruby: class/module/def (+ visibility).
 * PHP: namespace/class/interface/trait/enum/function/method/const. C/C++/Objective-C: function definitions,
 * struct/class/enum/union (incl. typedef struct), methods, #define. Plus Elixir, Lua, Shell, R, Solidity, Zig, Haskell,
 * Elm, Julia, Perl, Clojure, Erlang, OCaml, F#, Nim, GDScript, PowerShell, Crystal, SQL, GraphQL, Protobuf, Prisma,
 * Terraform. Signatures are one line, at most 120 characters. Capped at 200 symbols per file.
 */
export function extractSymbols(path: string, content: string, language: string): CodeSymbol[] {
  if (!content || content.length > MAX_CONTENT) return []
  const lang = (language || detectLanguage(path)?.name || '').toLowerCase()
  const out = new Out()
  try {
    if (lang === 'vue' || lang === 'svelte' || lang === 'astro') {
      sfcSymbols(path, content, lang, out)
      return out.list
    }
    const family = languageFamily(lang)
    switch (family) {
      case 'js': {
        const ext = extname(path)
        jsSymbols(toLines(content, lang), out, ext === 'jsx' || ext === 'tsx')
        break
      }
      case 'python':
        if (lang === 'jupyter notebook') break
        pythonSymbols(toLines(content, lang), out)
        break
      case 'go':
        goSymbols(toLines(content, lang), out)
        break
      case 'rust':
        rustSymbols(toLines(content, lang), out)
        break
      case 'jvm':
        jvmSymbols(toLines(content, lang), out, lang)
        break
      case 'csharp':
        csharpSymbols(toLines(content, lang), out)
        break
      case 'swift':
        swiftSymbols(toLines(content, lang), out)
        break
      case 'dart':
        dartSymbols(toLines(content, lang), out)
        break
      case 'php':
        if (lang === 'blade') break
        phpSymbols(toLines(content, lang), out)
        break
      case 'c':
        cSymbols(toLines(content, lang), out, lang)
        break
      case 'ruby':
        rubySymbols(toLines(content, lang), out)
        break
      case 'elixir':
        elixirSymbols(toLines(content, lang), out)
        break
      case 'lua':
        luaSymbols(toLines(content, lang), out)
        break
      case 'shell':
        shellSymbols(toLines(content, lang), out)
        break
      case 'r':
        rSymbols(toLines(content, lang), out)
        break
      default: {
        if (lang === 'hcl') {
          hclSymbols(toLines(content, lang), out)
          break
        }
        if (lang === 'prisma') {
          prismaSymbols(toLines(content, lang), out)
          break
        }
        if (lang === 'coffeescript') {
          lineRules(toLines(content, lang), out, [
            [/^\s*class\s+([A-Z]\w*)/, 'class', name1],
            [/^\s*(?:module\.exports\.|exports\.|@)?([A-Za-z_$][\w$]*)\s*[=:]\s*(?:\([^)]*\)\s*)?[-=]>/, 'function', name1],
          ])
          break
        }
        const rules = OTHER_RULES[lang === 'purescript' ? 'haskell' : lang === 'plpgsql' || lang === 'tsql' ? 'sql' : lang === 'raku' ? 'perl' : lang]
        if (rules?.length) lineRules(toLines(content, lang), out, rules, lang === 'solidity' ? 'brace' : 'none')
      }
    }
  } catch {
    // Symbol extraction is best effort; never let a strange file break the analysis.
  }
  return out.list.sort((a, b) => a.line - b.line)
}
