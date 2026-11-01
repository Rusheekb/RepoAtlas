/**
 * Comment stripping and source masking.
 *
 * The scanner walks the source once and records two kinds of regions:
 *  - comments (always blanked), and
 *  - string-literal contents (kept by stripComments, blanked by maskSource().code).
 * Blanking replaces every character except \r and \n with a space, so offsets, columns and line numbers never move.
 * That lets callers run regexes on the fully masked `code` (no false matches inside strings or comments) and then read
 * string values (import specifiers, route paths) from `text` at the very same offsets.
 */

/** How one language writes comments and strings. */
interface Syntax {
  /** Line comment markers. */
  line: string[]
  /** Markers that only count as a line comment at the start of a line (after indentation). */
  lineStart?: string[]
  /** Block comment delimiters. */
  block: [open: string, close: string][]
  nested?: boolean
  /** Quote chars for ordinary strings with backslash escapes that end at a newline. */
  quotes: string
  /** Quote chars whose strings may span lines (with backslash escapes). */
  multiQuotes?: string
  /** Quote chars whose strings may span lines and have no escapes (Go raw strings, shell single quotes). */
  rawQuotes?: string
  /** Quote chars that can form triple-quoted strings (""" or '''). */
  triple?: string
  /** JavaScript template literals with ${…} nesting. */
  template?: boolean
  /** JavaScript regex literals. */
  regex?: boolean
  /** '#' is a comment only at the start of a word (shell, YAML). */
  hashWordStart?: boolean
  /** Rust: ' is a char literal only when it looks like one (otherwise a lifetime). */
  rustChar?: boolean
  /** Rust raw strings r"…" / r#"…"#. */
  rustRaw?: boolean
  /** C++ raw strings R"delim(…)delim". */
  cppRaw?: boolean
  /** C# verbatim strings @"…" (doubled quote escapes). */
  csharp?: boolean
  /** Swift raw strings #"…"#. */
  swiftRaw?: boolean
  /** Dart raw strings r'…' (no escapes). */
  dartRaw?: boolean
  /** Lua long brackets [[…]] / [==[…]==] for strings and --[[…]] comments. */
  luaLong?: boolean
  /** Ruby =begin … =end, Perl POD (=pod … =cut). */
  podBlocks?: 'ruby' | 'perl'
  /** Doubled quote is an escape ('it''s'); backslash is not. */
  doubledQuotes?: boolean
  /** PHP: "#[" starts an attribute, not a comment. */
  phpAttr?: boolean
  /** SCSS/Less: "//" right after ':' (as in url(http://…)) is not a comment. */
  cssUrl?: boolean
  /** Heredoc flavor. */
  heredoc?: 'shell' | 'ruby' | 'php'
}

type MarkupFlavor = 'html' | 'vue' | 'svelte' | 'astro' | 'xml'

type Mode =
  | { type: 'none' }
  | { type: 'code'; syntax: Syntax }
  | { type: 'markup'; flavor: MarkupFlavor; extraBlocks: [string, string][] }

const C_BLOCK: [string, string][] = [['/*', '*/']]

const S = {
  js: { line: ['//'], block: C_BLOCK, quotes: `"'`, template: true, regex: true },
  json: { line: ['//'], block: C_BLOCK, quotes: `"'` },
  c: { line: ['//'], block: C_BLOCK, quotes: `"'`, cppRaw: true },
  go: { line: ['//'], block: C_BLOCK, quotes: `"'`, rawQuotes: '`' },
  rust: { line: ['//'], block: C_BLOCK, nested: true, quotes: '', multiQuotes: '"', rustChar: true, rustRaw: true },
  java: { line: ['//'], block: C_BLOCK, quotes: `"'`, triple: '"' },
  kotlin: { line: ['//'], block: C_BLOCK, nested: true, quotes: `"'`, triple: '"' },
  groovy: { line: ['//'], block: C_BLOCK, quotes: `"'`, triple: `"'` },
  csharp: { line: ['//'], block: C_BLOCK, quotes: `"'`, triple: '"', csharp: true },
  swift: { line: ['//'], block: C_BLOCK, nested: true, quotes: `"'`, triple: '"', swiftRaw: true },
  dart: { line: ['//'], block: C_BLOCK, nested: true, quotes: `"'`, triple: `"'`, dartRaw: true },
  php: { line: ['//', '#'], block: C_BLOCK, quotes: '', multiQuotes: `"'`, phpAttr: true, heredoc: 'php' },
  lineOnlySlash: { line: ['//'], block: [], quotes: `"'` },
  css: { line: [], block: C_BLOCK, quotes: `"'` },
  scss: { line: ['//'], block: C_BLOCK, quotes: `"'`, cssUrl: true },
  python: { line: ['#'], block: [], quotes: `"'`, triple: `"'` },
  ruby: { line: ['#'], block: [], quotes: '', multiQuotes: `"'`, podBlocks: 'ruby', heredoc: 'ruby' },
  perl: { line: ['#'], block: [], quotes: '', multiQuotes: `"'`, podBlocks: 'perl' },
  shell: { line: ['#'], block: [], quotes: '', multiQuotes: '"', rawQuotes: "'", hashWordStart: true, heredoc: 'shell' },
  hash: { line: ['#'], block: [], quotes: `"'` },
  hashMulti: { line: ['#'], block: [], quotes: '', multiQuotes: `"'` },
  elixir: { line: ['#'], block: [], quotes: `"'`, triple: `"'` },
  yaml: { line: ['#'], block: [], quotes: `"'`, hashWordStart: true },
  toml: { line: ['#'], block: [], quotes: `"'`, triple: `"'` },
  julia: { line: ['#'], block: [['#=', '=#']], nested: true, quotes: `"`, triple: '"' },
  nim: { line: ['#'], block: [['#[', ']#']], nested: true, quotes: `"'`, triple: '"' },
  coffee: { line: ['#'], block: [['###', '###']], quotes: `"'`, triple: `"'` },
  powershell: { line: ['#'], block: [['<#', '#>']], quotes: `"'` },
  cmake: { line: ['#'], block: [['#[[', ']]']], quotes: '"' },
  nix: { line: ['#'], block: C_BLOCK, quotes: '"' },
  hcl: { line: ['#', '//'], block: C_BLOCK, quotes: '"' },
  make: { line: ['#'], block: [], quotes: '' },
  dockerfile: { line: [], lineStart: ['#'], block: [], quotes: `"'` },
  hashLineStart: { line: [], lineStart: ['#'], block: [], quotes: '' },
  ini: { line: [], lineStart: ['#', ';'], block: [], quotes: `"` },
  lua: { line: ['--'], block: [], quotes: `"'`, luaLong: true },
  sql: { line: ['--'], block: C_BLOCK, quotes: '', multiQuotes: `'"`, doubledQuotes: true },
  haskell: { line: ['--'], block: [['{-', '-}']], nested: true, quotes: '"' },
  dash: { line: ['--'], block: [], quotes: '"' },
  lisp: { line: [';'], block: [['#|', '|#']], nested: true, quotes: '"' },
  clojure: { line: [';'], block: [], quotes: '"' },
  asm: { line: [';', '#'], block: [], quotes: `"'` },
  percent: { line: ['%'], block: [], quotes: '"' },
  erlang: { line: ['%'], block: [], quotes: '"' },
  matlab: { line: ['%'], block: [['%{', '%}']], quotes: '"' },
  prolog: { line: ['%'], block: C_BLOCK, quotes: `"'` },
  ocaml: { line: [], block: [['(*', '*)']], nested: true, quotes: '"' },
  fsharp: { line: ['//'], block: [['(*', '*)']], nested: true, quotes: '"', triple: '"' },
  pascal: { line: ['//'], block: [['{', '}'], ['(*', '*)']], quotes: "'", doubledQuotes: true },
  fortran: { line: ['!'], block: [], quotes: `"'` },
  vb: { line: ["'"], block: [], quotes: '"', doubledQuotes: true },
  batch: { line: [], lineStart: ['REM ', 'rem ', '::', '@REM ', '@rem '], block: [], quotes: '"' },
  vim: { line: [], lineStart: ['"'], block: [], quotes: "'" },
} satisfies Record<string, Syntax>

type SyntaxKey = keyof typeof S

const code = (key: SyntaxKey): Mode => ({ type: 'code', syntax: S[key] })
const markup = (flavor: MarkupFlavor, extraBlocks: [string, string][] = []): Mode => ({ type: 'markup', flavor, extraBlocks })
const NONE: Mode = { type: 'none' }

/** Lower-case language display names, family ids and common aliases → scanning mode. */
const MODES: Record<string, Mode> = {
  // JavaScript family
  javascript: code('js'),
  typescript: code('js'),
  tsx: code('js'),
  jsx: code('js'),
  js: code('js'),
  ts: code('js'),
  vue: markup('vue'),
  svelte: markup('svelte'),
  astro: markup('astro'),
  coffeescript: code('coffee'),
  // C-like
  go: code('go'),
  rust: code('rust'),
  java: code('java'),
  apex: code('java'),
  kotlin: code('kotlin'),
  scala: code('kotlin'),
  jvm: code('kotlin'),
  groovy: code('groovy'),
  gradle: code('groovy'),
  'c#': code('csharp'),
  csharp: code('csharp'),
  c: code('c'),
  'c++': code('c'),
  cpp: code('c'),
  'objective-c': code('c'),
  'objective-c++': code('c'),
  cuda: code('c'),
  metal: code('c'),
  glsl: code('c'),
  hlsl: code('c'),
  d: code('c'),
  v: code('c'),
  verilog: code('c'),
  swift: code('swift'),
  dart: code('dart'),
  php: code('php'),
  hack: code('php'),
  blade: markup('html', [['{{--', '--}}']]),
  json: code('json'),
  json5: code('json'),
  jsonc: code('json'),
  'jupyter notebook': code('json'),
  'protocol buffer': code('json'),
  thrift: code('json'),
  solidity: code('json'),
  move: code('json'),
  haxe: code('json'),
  rescript: code('json'),
  bicep: code('json'),
  zig: code('lineOnlySlash'),
  prisma: code('lineOnlySlash'),
  gleam: code('lineOnlySlash'),
  cairo: code('lineOnlySlash'),
  pug: code('lineOnlySlash'),
  // CSS
  css: code('css'),
  postcss: code('css'),
  scss: code('scss'),
  sass: code('scss'),
  less: code('scss'),
  stylus: code('scss'),
  // Hash-comment languages
  python: code('python'),
  cython: code('python'),
  starlark: code('python'),
  gdscript: code('python'),
  vyper: code('python'),
  ruby: code('ruby'),
  crystal: code('ruby'),
  perl: code('perl'),
  raku: code('perl'),
  shell: code('shell'),
  bash: code('shell'),
  sh: code('shell'),
  zsh: code('shell'),
  fish: code('shell'),
  awk: code('hash'),
  tcl: code('hash'),
  r: code('hashMulti'),
  elixir: code('elixir'),
  julia: code('julia'),
  nim: code('nim'),
  powershell: code('powershell'),
  cmake: code('cmake'),
  meson: code('hash'),
  just: code('hash'),
  nix: code('nix'),
  hcl: code('hcl'),
  terraform: code('hcl'),
  puppet: code('nix'),
  graphql: code('hash'),
  yaml: code('yaml'),
  yml: code('yaml'),
  toml: code('toml'),
  'pip requirements': code('yaml'),
  dotenv: code('yaml'),
  makefile: code('make'),
  make: code('make'),
  dockerfile: code('dockerfile'),
  'ignore list': code('hashLineStart'),
  'git attributes': code('hashLineStart'),
  procfile: code('hashLineStart'),
  caddyfile: code('yaml'),
  nginx: code('yaml'),
  ini: code('ini'),
  'git config': code('ini'),
  editorconfig: code('ini'),
  // Dash-comment languages
  lua: code('lua'),
  luau: code('lua'),
  sql: code('sql'),
  plpgsql: code('sql'),
  tsql: code('sql'),
  haskell: code('haskell'),
  elm: code('haskell'),
  purescript: code('haskell'),
  ada: code('dash'),
  vhdl: code('dash'),
  // Others
  'common lisp': code('lisp'),
  scheme: code('lisp'),
  racket: code('lisp'),
  'emacs lisp': code('clojure'),
  clojure: code('clojure'),
  assembly: code('asm'),
  erlang: code('erlang'),
  matlab: code('matlab'),
  tex: code('percent'),
  bibtex: code('percent'),
  prolog: code('prolog'),
  ocaml: code('ocaml'),
  'f#': code('fsharp'),
  pascal: code('pascal'),
  fortran: code('fortran'),
  'visual basic .net': code('vb'),
  batchfile: code('batch'),
  'vim script': code('vim'),
  // Markup
  html: markup('html'),
  xml: markup('xml'),
  svg: markup('xml'),
  markup: markup('html'),
  handlebars: markup('html', [['{{!--', '--}}'], ['{{!', '}}']]),
  mustache: markup('html', [['{{!', '}}']]),
  ejs: markup('html', [['<%#', '%>']]),
  twig: markup('html', [['{#', '#}']]),
  jinja: markup('html', [['{#', '#}']]),
  liquid: markup('html', [['{% comment %}', '{% endcomment %}']]),
  // Prose / data without comments
  markdown: NONE,
  mdx: NONE,
  text: NONE,
  csv: NONE,
  tsv: NONE,
  lockfile: NONE,
  diff: NONE,
  other: NONE,
}

function modeFor(language: string): Mode {
  if (!language) return NONE
  return MODES[language.toLowerCase()] ?? NONE
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner
// ─────────────────────────────────────────────────────────────────────────────

const KIND_COMMENT = 0
const KIND_STRING = 1

/** Words after which a "/" starts a regex rather than a division. */
const REGEX_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'export',
  'default',
])

function isSpace(ch: number): boolean {
  return ch === 32 || ch === 9 || ch === 13 || ch === 12 || ch === 11 || ch === 0xa0 || ch === 0xfeff
}

function isWordChar(ch: number): boolean {
  return (
    (ch >= 97 && ch <= 122) || // a-z
    (ch >= 65 && ch <= 90) || // A-Z
    (ch >= 48 && ch <= 57) || // 0-9
    ch === 95 || // _
    ch === 36 || // $
    ch > 127
  )
}

class Scanner {
  readonly out: number[] = []
  constructor(readonly s: string) {}

  push(kind: number, start: number, end: number): void {
    if (end > start) this.out.push(kind, start, end)
  }

  /** Scan [start, end) as code. With stopAtBrace, returns just past the "}" that closes a template ${…}. */
  code(start: number, end: number, syn: Syntax, stopAtBrace = false): number {
    const s = this.s
    let i = start
    let depth = 0
    // Regex-vs-division bookkeeping (JS only): 0 = start, 1 = word, 2 = punctuation, 3 = value.
    let lastKind = 0
    let lastWord = ''
    let lineStart = true
    if (start === 0 && s.startsWith('#!')) {
      const nl = s.indexOf('\n')
      const stop = nl === -1 || nl > end ? end : nl
      this.push(KIND_COMMENT, 0, stop)
      i = stop
    }
    while (i < end) {
      const ch = s.charCodeAt(i)
      if (ch === 10) {
        lineStart = true
        i++
        continue
      }
      if (isSpace(ch)) {
        i++
        continue
      }

      // Block comments (checked before line comments so "--[[" / "#=" / "#[[" win).
      if (syn.block.length) {
        const j = this.blockComment(i, end, syn)
        if (j > i) {
          this.push(KIND_COMMENT, i, j)
          i = j
          continue
        }
      }
      if (syn.luaLong && ch === 45 /* - */ && s.charCodeAt(i + 1) === 45) {
        const j = this.longBracket(i + 2, end)
        if (j > 0) {
          this.push(KIND_COMMENT, i, j)
          i = j
          continue
        }
      }
      if (syn.podBlocks && lineStart && ch === 61 /* = */) {
        const j = this.pod(i, end, syn.podBlocks)
        if (j > i) {
          this.push(KIND_COMMENT, i, j)
          i = j
          lineStart = true
          continue
        }
      }
      if (this.isLineComment(i, syn, lineStart)) {
        let j = s.indexOf('\n', i)
        if (j === -1 || j > end) j = end
        this.push(KIND_COMMENT, i, j)
        i = j
        continue
      }
      lineStart = false

      const c = s[i]

      if (stopAtBrace) {
        if (c === '{') depth++
        else if (c === '}') {
          if (depth === 0) return i + 1
          depth--
        }
      }

      // Strings.
      if (syn.triple && syn.triple.includes(c) && s.startsWith(c + c + c, i)) {
        i = this.quoted(i + 3, end, c + c + c, true, true)
        lastKind = 3
        continue
      }
      if (syn.template && c === '`') {
        i = this.templateLiteral(i, end, syn)
        lastKind = 3
        continue
      }
      if (syn.csharp && c === '@' && s[i + 1] === '"') {
        i = this.doubledQuote(i + 2, end, '"')
        lastKind = 3
        continue
      }
      if (syn.csharp && c === '$' && (s[i + 1] === '@' || s[i + 1] === '$') && s[i + 2] === '"') {
        i = s[i + 1] === '@' ? this.doubledQuote(i + 3, end, '"') : this.quoted(i + 3, end, '"', true, false)
        lastKind = 3
        continue
      }
      if (syn.swiftRaw && c === '#') {
        let h = i
        while (h < end && s[h] === '#') h++
        if (s[h] === '"') {
          const hashes = s.slice(i, h)
          const multi = s.startsWith('"""', h)
          const close = (multi ? '"""' : '"') + hashes
          i = this.until(h + (multi ? 3 : 1), end, close)
          lastKind = 3
          continue
        }
        // Not a raw string: step over the whole run of "#" at once (re-reading it from every "#" is quadratic).
        lastKind = 2
        i = h
        continue
      }
      if (syn.rustChar && c === "'") {
        const m = /'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|.)|[^\\'\n])'/y
        m.lastIndex = i
        if (m.test(s)) {
          this.push(KIND_STRING, i + 1, m.lastIndex - 1)
          i = m.lastIndex
          lastKind = 3
          continue
        }
        // A lifetime ('a): plain code.
        i++
        continue
      }
      if (syn.luaLong && c === '[') {
        const j = this.longBracket(i, end)
        if (j > 0) {
          i = j
          lastKind = 3
          continue
        }
      }
      if (syn.heredoc && c === '<' && s[i + 1] === '<') {
        const j = this.heredoc(i, end, syn.heredoc)
        if (j > i) {
          i = j
          lastKind = 3
          continue
        }
      }
      if (syn.rawQuotes && syn.rawQuotes.includes(c)) {
        i = this.quoted(i + 1, end, c, false, true)
        lastKind = 3
        continue
      }
      if (syn.multiQuotes && syn.multiQuotes.includes(c)) {
        i = syn.doubledQuotes ? this.doubledQuote(i + 1, end, c) : this.quoted(i + 1, end, c, true, true)
        lastKind = 3
        continue
      }
      if (syn.quotes.includes(c)) {
        i = syn.doubledQuotes ? this.doubledQuote(i + 1, end, c, true) : this.quoted(i + 1, end, c, true, false)
        lastKind = 3
        continue
      }

      // Words & numbers (also catches raw-string prefixes).
      if (isWordChar(ch)) {
        let j = i + 1
        while (j < end && isWordChar(s.charCodeAt(j))) j++
        const word = s.slice(i, j)
        const next = s[j]
        if (syn.rustRaw && (word === 'r' || word === 'br' || word === 'cr') && (next === '"' || next === '#')) {
          let h = j
          while (s[h] === '#') h++
          if (s[h] === '"') {
            i = this.until(h + 1, end, '"' + s.slice(j, h))
            lastKind = 3
            continue
          }
        }
        if (syn.cppRaw && next === '"' && /^(?:u8|[uUL])?R$/.test(word)) {
          // The delimiter is at most 16 characters, so only look that far for its "(".
          const near = s.slice(j + 1, j + 18).indexOf('(')
          const open = near === -1 ? -1 : j + 1 + near
          const delim = open === -1 ? '' : s.slice(j + 1, open)
          if (open !== -1 && delim.length <= 16 && !/[\s\\)]/.test(delim)) {
            i = this.until(open + 1, end, ')' + delim + '"')
            lastKind = 3
            continue
          }
        }
        if (syn.dartRaw && word === 'r' && (next === '"' || next === "'")) {
          const tripleQ = s.startsWith(next + next + next, j)
          i = tripleQ
            ? this.quoted(j + 3, end, next + next + next, false, true)
            : this.quoted(j + 1, end, next, false, false)
          lastKind = 3
          continue
        }
        const startsWithDigit = ch >= 48 && ch <= 57
        lastKind = startsWithDigit ? 3 : 1
        lastWord = word
        i = j
        continue
      }

      if (syn.regex && c === '/') {
        // "</div>" and "<Foo />" are JSX tags, not regex literals.
        const jsxTag = s[i - 1] === '<' || s[i + 1] === '>'
        const regexAllowed =
          !jsxTag && (lastKind === 0 || lastKind === 2 || (lastKind === 1 && REGEX_KEYWORDS.has(lastWord)))
        if (regexAllowed) {
          const j = this.regexLiteral(i, end)
          if (j > i) {
            i = j
            lastKind = 3
            continue
          }
        }
      }

      if (c === ')' || c === ']') lastKind = 3
      else lastKind = 2
      i++
    }
    return end
  }

  private isLineComment(i: number, syn: Syntax, lineStart: boolean): boolean {
    const s = this.s
    if (lineStart && syn.lineStart) {
      for (const m of syn.lineStart) if (s.startsWith(m, i)) return true
    }
    for (const m of syn.line) {
      if (!s.startsWith(m, i)) continue
      if (m === '#') {
        const prev = i > 0 ? s.charCodeAt(i - 1) : 10
        if (prev === 36 /* $ */) continue
        if (syn.hashWordStart && !(prev === 10 || isSpace(prev) || prev === 59 /* ; */)) continue
        if (syn.phpAttr && s[i + 1] === '[') continue
      }
      if (m === '//' && syn.cssUrl && i > 0 && s[i - 1] === ':') continue
      return true
    }
    return false
  }

  /** Returns the end of a block comment starting at i, or i when none starts there. */
  private blockComment(i: number, end: number, syn: Syntax): number {
    const s = this.s
    for (const [open, close] of syn.block) {
      if (!s.startsWith(open, i)) continue
      if (!syn.nested) {
        const k = s.indexOf(close, i + open.length)
        return k === -1 || k + close.length > end ? end : k + close.length
      }
      let depth = 1
      let j = i + open.length
      while (j < end) {
        if (s.startsWith(close, j)) {
          depth--
          j += close.length
          if (depth === 0) return j
        } else if (s.startsWith(open, j)) {
          depth++
          j += open.length
        } else j++
      }
      return end
    }
    return i
  }

  /** Quoted string body starting at `from` (just after the opening delimiter); records its content. */
  quoted(from: number, end: number, close: string, escapes: boolean, multiline: boolean): number {
    const s = this.s
    const single = close.length === 1 ? close.charCodeAt(0) : -1
    let j = from
    while (j < end) {
      const ch = s.charCodeAt(j)
      if (escapes && ch === 92 /* \ */) {
        j += 2
        continue
      }
      if (single !== -1 ? ch === single : s.startsWith(close, j)) {
        this.push(KIND_STRING, from, j)
        return j + close.length
      }
      if (ch === 10 && !multiline) {
        this.push(KIND_STRING, from, j)
        return j
      }
      j++
    }
    this.push(KIND_STRING, from, Math.min(j, end))
    return end
  }

  /** String where a doubled quote is an escape (C# verbatim, SQL, Pascal, VB). */
  private doubledQuote(from: number, end: number, q: string, singleLine = false): number {
    const s = this.s
    let j = from
    while (j < end) {
      const c = s[j]
      if (c === q) {
        if (s[j + 1] === q) {
          j += 2
          continue
        }
        this.push(KIND_STRING, from, j)
        return j + 1
      }
      if (singleLine && c === '\n') {
        this.push(KIND_STRING, from, j)
        return j
      }
      j++
    }
    this.push(KIND_STRING, from, end)
    return end
  }

  /** Raw string body up to a literal closing delimiter. */
  private until(from: number, end: number, close: string): number {
    const k = this.s.indexOf(close, from)
    if (k === -1 || k + close.length > end) {
      this.push(KIND_STRING, from, end)
      return end
    }
    this.push(KIND_STRING, from, k)
    return k + close.length
  }

  private templateLiteral(i: number, end: number, syn: Syntax): number {
    const s = this.s
    let j = i + 1
    let segStart = j
    while (j < end) {
      const c = s[j]
      if (c === '\\') {
        j += 2
        continue
      }
      if (c === '`') {
        this.push(KIND_STRING, segStart, j)
        return j + 1
      }
      if (c === '$' && s[j + 1] === '{') {
        this.push(KIND_STRING, segStart, j)
        j = this.code(j + 2, end, syn, true)
        segStart = j
        continue
      }
      j++
    }
    this.push(KIND_STRING, segStart, end)
    return end
  }

  /** A regex literal that ran to the end of its line without closing: later "/" before this point are not retried. */
  private noRegexBefore = -1

  private regexLiteral(i: number, end: number): number {
    const s = this.s
    if (i < this.noRegexBefore) return i
    let j = i + 1
    let inClass = false
    while (j < end) {
      const c = s[j]
      if (c === '\n') {
        // Retrying from every later "/" on this line would re-read it each time (quadratic on long lines).
        this.noRegexBefore = j
        return i
      }
      if (c === '\\') {
        j += 2
        continue
      }
      if (inClass) {
        if (c === ']') inClass = false
      } else if (c === '[') inClass = true
      else if (c === '/') break
      j++
    }
    if (j >= end) {
      this.noRegexBefore = end
      return i
    }
    if (j === i + 1) return i
    this.push(KIND_STRING, i + 1, j)
    j++
    while (j < end && /[a-z]/.test(s[j])) j++
    return j
  }

  /** Lua long bracket at i ("[[", "[==["); returns its end, or -1. Records the body as a string. */
  private longBracket(i: number, end: number): number {
    const s = this.s
    if (s[i] !== '[') return -1
    let j = i + 1
    while (s[j] === '=') j++
    if (s[j] !== '[') return -1
    const close = ']' + '='.repeat(j - i - 1) + ']'
    return this.until(j + 1, end, close)
  }

  private pod(i: number, end: number, flavor: 'ruby' | 'perl'): number {
    const s = this.s
    if (flavor === 'ruby') {
      if (!s.startsWith('=begin', i) || /\w/.test(s[i + 6] ?? '')) return i
      const k = s.indexOf('\n=end', i)
      if (k === -1) return end
      const nl = s.indexOf('\n', k + 1)
      return nl === -1 || nl > end ? end : nl
    }
    if (!/^=[a-zA-Z]/.test(s.slice(i, i + 2))) return i
    const k = s.indexOf('\n=cut', i)
    if (k === -1) return end
    const nl = s.indexOf('\n', k + 1)
    return nl === -1 || nl > end ? end : nl
  }

  private heredoc(i: number, end: number, flavor: 'shell' | 'ruby' | 'php'): number {
    const s = this.s
    const head = s.slice(i, i + 80)
    const re =
      flavor === 'shell'
        ? /^<<(-?)[ \t]*(['"]?)([A-Za-z_][\w-]*)\2/
        : flavor === 'ruby'
          ? /^<<([~-]?)(['"]?)([A-Z_][A-Z0-9_]*)\2/
          : /^<<<([ \t]*)(['"]?)([A-Za-z_]\w*)\2/
    if (flavor === 'shell' && head.startsWith('<<<')) return i
    const m = re.exec(head)
    if (!m) return i
    const word = m[3]
    const nl = s.indexOf('\n', i)
    if (nl === -1 || nl >= end) return i
    const indented = flavor !== 'shell' || m[1] === '-'
    const lineRe = indented
      ? new RegExp(`^[ \\t]*${word}\\b.*$`, 'gm')
      : new RegExp(`^${word}[ \\t]*;?[ \\t]*$`, 'gm')
    lineRe.lastIndex = nl + 1
    const close = lineRe.exec(s)
    const bodyEnd = close && close.index < end ? close.index : end
    // The rest of the opening line stays code; only the heredoc body is a string.
    this.code(i + m[0].length, nl, flavor === 'shell' ? S.shell : flavor === 'ruby' ? S.ruby : S.php)
    this.push(KIND_STRING, nl + 1, bodyEnd)
    if (!close || close.index >= end) return end
    return close.index + word.length + (close[0].length - close[0].trimStart().length)
  }

  /** HTML-like files: <!-- --> comments, plus embedded <script>/<style> scanned as JS/CSS. */
  markup(flavor: MarkupFlavor, extraBlocks: [string, string][]): void {
    const s = this.s
    const n = s.length
    let i = 0
    if (flavor === 'astro') {
      const fm = /^﻿?[ \t]*---[ \t]*\r?\n/.exec(s)
      if (fm) {
        const close = /^[ \t]*---[ \t]*$/m
        const rest = s.slice(fm[0].length)
        const m = close.exec(rest)
        const bodyEnd = m ? fm[0].length + m.index : n
        this.code(fm[0].length, bodyEnd, S.js)
        i = m ? bodyEnd + m[0].length : n
      }
    }
    const openers = ['<!--', '<script', '<style', ...extraBlocks.map((b) => b[0])]
    const lower = s.toLowerCase()
    // Cached next position of each opener (re-searched only once we have moved past it).
    const cached = openers.map(() => -2)
    while (i < n) {
      let next = -1
      let which = ''
      for (let o = 0; o < openers.length; o++) {
        if (cached[o] !== -1 && cached[o] < i) {
          const opener = openers[o]
          cached[o] = opener.startsWith('<s') ? lower.indexOf(opener, i) : s.indexOf(opener, i)
        }
        const k = cached[o]
        if (k !== -1 && (next === -1 || k < next)) {
          next = k
          which = openers[o]
        }
      }
      if (next === -1) break
      if (which === '<!--') {
        const k = s.indexOf('-->', next + 4)
        const stop = k === -1 ? n : k + 3
        this.push(KIND_COMMENT, next, stop)
        i = stop
        continue
      }
      if (which === '<script' || which === '<style') {
        const after = s.charCodeAt(next + which.length)
        if (isWordChar(after) || after === 45 /* - */) {
          i = next + which.length
          continue
        }
        const tagEnd = s.indexOf('>', next)
        if (tagEnd === -1) break
        const attrs = s.slice(next + which.length, tagEnd)
        const closeTag = which === '<script' ? '</script' : '</style'
        let close = lower.indexOf(closeTag, tagEnd + 1)
        if (close === -1) close = n
        if (!attrs.trimEnd().endsWith('/')) {
          const syn = which === '<script' ? scriptSyntax(attrs) : styleSyntax(attrs)
          if (syn) this.code(tagEnd + 1, close, syn)
        }
        i = close
        continue
      }
      const block = extraBlocks.find((b) => b[0] === which)
      if (block) {
        const k = s.indexOf(block[1], next + block[0].length)
        const stop = k === -1 ? n : k + block[1].length
        this.push(KIND_COMMENT, next, stop)
        i = stop
        continue
      }
      i = next + 1
    }
  }
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

function scriptSyntax(attrs: string): Syntax | null {
  const type = attr(attrs, 'type')?.toLowerCase()
  if (type && !/(java|ecma|type)script|module|babel|jsx|tsx|^text\/(ts|js)$|json/.test(type)) return null
  return S.js
}

function styleSyntax(attrs: string): Syntax {
  const lang = attr(attrs, 'lang')?.toLowerCase()
  return lang && /scss|sass|less|styl/.test(lang) ? S.scss : S.css
}

function scan(content: string, language: string): number[] {
  const mode = modeFor(language)
  if (mode.type === 'none' || !content) return []
  const sc = new Scanner(content)
  try {
    if (mode.type === 'markup') sc.markup(mode.flavor, mode.extraBlocks)
    else sc.code(0, content.length, mode.syntax)
  } catch {
    // Pathological input (e.g. thousands of nested template literals overflowing the stack): keep the regions
    // found so far, which are complete and ordered up to the point of failure.
    return trimToValid(sc.out)
  }
  return sc.out
}

/** Drop any trailing regions that overlap or go backwards (possible after an aborted nested scan). */
function trimToValid(regions: number[]): number[] {
  const out: number[] = []
  let last = 0
  for (let r = 0; r < regions.length; r += 3) {
    if (regions[r + 1] < last) break
    out.push(regions[r], regions[r + 1], regions[r + 2])
    last = regions[r + 2]
  }
  return out
}

function blank(text: string): string {
  return text.replace(/[^\r\n]/g, ' ')
}

function render(content: string, regions: number[], blankStrings: boolean): string {
  if (!regions.length) return content
  const parts: string[] = []
  let last = 0
  for (let r = 0; r < regions.length; r += 3) {
    const kind = regions[r]
    const a = regions[r + 1]
    const b = regions[r + 2]
    if (kind === KIND_STRING && !blankStrings) continue
    if (a < last) continue
    parts.push(content.slice(last, a), blank(content.slice(a, b)))
    last = b
  }
  parts.push(content.slice(last))
  return parts.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace comments with spaces (preserving newlines so line numbers stay correct) for a language family.
 * `language` is a display name ("TypeScript", "Python", "Vue" …) or a family id ("js", "python", "yaml", "sql" …).
 * String literals are preserved, including JS template literals (with nested ${…}), Python triple quotes,
 * Go/Rust/C++/C#/Swift raw strings, Lua long strings and shell heredocs. Unknown languages are returned unchanged.
 */
export function stripComments(content: string, language: string): string {
  const entry = cached(content, language)
  entry.text ??= render(content, entry.regions, false)
  return entry.text
}

/** Two aligned views of a source file. Both have exactly the same length and line breaks as the original. */
export interface MaskedSource {
  /** Comments blanked; strings intact (read string values from here). */
  text: string
  /** Comments AND string-literal contents blanked (match code structure here; quotes stay in place). */
  code: string
}

/** Strip comments and additionally blank out string-literal contents, keeping offsets identical. */
export function maskSource(content: string, language: string): MaskedSource {
  const entry = cached(content, language)
  entry.text ??= render(content, entry.regions, false)
  entry.code ??= render(content, entry.regions, true)
  return { text: entry.text, code: entry.code }
}

interface CacheEntry {
  content: string
  language: string
  regions: number[]
  text?: string
  code?: string
}

/**
 * The analysis runs imports, symbols and routes extraction back-to-back on the same file, so the last few scans are
 * kept (identity/equality of content + language) to avoid tokenizing a file three times.
 */
const recent: CacheEntry[] = []
const CACHE_SIZE = 4

function cached(content: string, lang: string): CacheEntry {
  const language = lang.toLowerCase()
  for (const e of recent) if (e.language === language && e.content === content) return e
  const entry: CacheEntry = { content, language, regions: scan(content, language) }
  recent.unshift(entry)
  if (recent.length > CACHE_SIZE) recent.pop()
  return entry
}

/** Whether we know how to find comments in this language. */
export function hasCommentSyntax(language: string): boolean {
  return modeFor(language).type !== 'none'
}
