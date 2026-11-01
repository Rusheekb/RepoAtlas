/**
 * Hostile but legal files must never freeze the page. Analysis runs on the main thread, and a regex that backtracks
 * polynomially (or worse) on a long run of spaces, blank lines or letters can block it for minutes.
 * Every input here is about 100 KB and once took from a second to "never finishes"; each must now be read in well
 * under 50 ms by the import, symbol and route extractors together.
 */
import { extractImports } from './imports'
import { extractRoutes } from './routes'
import { maskSource } from './strip'
import { extractSymbols } from './symbols'
import { createResolver } from './resolve'

const SIZE = 100_000
const BUDGET_MS = 50

/** `unit` repeated to about SIZE characters. */
const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length))
/** Lines of `unit`, each just under the 2,000-character limit for declaration lines, filling about SIZE characters. */
const longLines = (unit: string) => fill(`${unit.repeat(Math.floor(1990 / unit.length))}\n`)

type Case = [label: string, language: string, path: string, content: string]

const CASES: Case[] = [
  // From the security review: Go route regexes on a long string literal, Python files of blank lines.
  ['Go: one long string literal', 'Go', 'main.go', `package main\n\nvar s = "${'a'.repeat(SIZE)}"\n`],
  ['Go: a long word', 'Go', 'main.go', 'a'.repeat(SIZE)],
  ['Go: a long number', 'Go', 'main.go', '1'.repeat(SIZE)],
  ['Go: unclosed import groups', 'Go', 'main.go', fill('import (\n')],
  ['Python: blank lines', 'Python', 'app/urls.py', '\n'.repeat(SIZE)],
  ['Python: blank lines with spaces', 'Python', 'app/urls.py', fill(' \n')],
  ['Python: an import list that never closes', 'Python', 'app/main.py', `import {${fill('\n \n')}`],
  // JavaScript / TypeScript.
  ['JS: import followed by blank space', 'TypeScript', 'src/a.ts', `import${' '.repeat(SIZE)}`],
  ['JS: export followed by blank space', 'TypeScript', 'src/a.ts', `export${' '.repeat(SIZE)}`],
  ['JS: many import keywords', 'TypeScript', 'src/a.ts', fill('import ')],
  ['JS: arrow then blank lines', 'TypeScript', 'src/a.tsx', `=>${fill('\n \n')}`],
  ['JS: function then spaces, line after line', 'TypeScript', 'src/a.ts', fill(`function${' '.repeat(1900)}\n`)],
  ['JS: unclosed regex-like slashes', 'JavaScript', 'src/a.js', fill('[/')],
  ['JS: unclosed destructuring requires', 'JavaScript', 'src/a.js', fill('const {')],
  ['JS: route calls without paths', 'TypeScript', 'src/server.ts', fill('app.get(')],
  ['MDX: export lines', 'MDX', 'docs/a.mdx', fill('export\n')],
  // Swift, C family, C#, Java, Kotlin, Dart.
  ['Swift: a run of #', 'Swift', 'App.swift', '#'.repeat(SIZE)],
  ['C: lines of qualifiers', 'C', 'a.c', longLines('static ')],
  ['Objective-C: lines of enum', 'Objective-C', 'a.m', longLines('enum ')],
  ['C++: many raw-string starts', 'C++', 'a.cpp', fill('R"')],
  ['C#: a long word', 'C#', 'Program.cs', 'a'.repeat(SIZE)],
  ['C#: attribute starts', 'C#', 'Api.cs', fill('[HttpGet(')],
  ['Java: annotation starts', 'Java', 'Api.java', fill('@Get(')],
  ['Java: lines of modifiers', 'Java', 'A.java', longLines('public ')],
  ['Java: thousands of stacked annotations', 'Java', 'Api.java', fill('@Get ')],
  ['Kotlin: blank lines', 'Kotlin', 'A.kt', fill(' \n')],
  ['Dart: annotation then spaces', 'Dart', 'a.dart', fill(`@A() ${' '.repeat(1900)}\n`)],
  // Rust, PHP, Ruby, Shell, Lua, Elixir, Clojure, Nim, Solidity, HTML.
  ['Rust: use lines without semicolons', 'Rust', 'src/lib.rs', fill('use a\n')],
  ['Rust: unclosed visibility', 'Rust', 'src/lib.rs', fill('pub(')],
  ['Rust: use followed by blank space', 'Rust', 'src/lib.rs', `use${' '.repeat(SIZE)}`],
  ['PHP: require followed by blank space', 'PHP', 'index.php', `<?php require${' '.repeat(SIZE)}`],
  ['PHP: use lines without semicolons', 'PHP', 'index.php', `<?php\n${fill('use\n')}`],
  ['PHP: route groups that never open', 'PHP', 'routes/web.php', `<?php\n${fill("Route::prefix('a')")}`],
  ['Ruby: require followed by blank space', 'Ruby', 'lib/a.rb', `require${' '.repeat(SIZE)}`],
  ['Rails: a route followed by blank space', 'Ruby', 'config/routes.rb', `get${' '.repeat(SIZE)}`],
  ['Shell: dot-sourcing a quoted run', 'Shell', 'run.sh', fill('. "')],
  ['fish: source followed by many words', 'fish', 'run.fish', `source${fill(' a')}`],
  ['Lua: require followed by blank space', 'Lua', 'init.lua', `require${' '.repeat(SIZE)}`],
  ['Elixir: blank lines', 'Elixir', 'lib/a.ex', fill(' \n')],
  ['Clojure: unclosed use forms', 'Clojure', 'src/a.clj', fill('(use(')],
  ['Nim: an import followed by blank space', 'Nim', 'a.nim', `import {${' '.repeat(SIZE)}`],
  ['Solidity: import followed by blank space', 'Solidity', 'A.sol', `import ${' '.repeat(SIZE)}`],
  ['Solidity: import lines without semicolons', 'Solidity', 'A.sol', fill('import\n')],
  ['HTML: link tags that never close', 'HTML', 'index.html', fill('<link ')],
  ['HTML: script tags that never close', 'HTML', 'index.html', fill('<script ')],
  ['Prisma: blank lines', 'Prisma', 'schema.prisma', fill(' \n')],
]

/** One plain stress input per family's usual language: blank space, blank lines, one long word. */
for (const [language, path] of [
  ['TypeScript', 'src/a.ts'],
  ['Python', 'a.py'],
  ['Go', 'a.go'],
  ['Rust', 'a.rs'],
  ['Java', 'A.java'],
  ['C#', 'A.cs'],
  ['C++', 'a.cpp'],
  ['Ruby', 'a.rb'],
  ['PHP', 'a.php'],
  ['Swift', 'a.swift'],
  ['Dart', 'a.dart'],
  ['Elixir', 'a.ex'],
  ['Lua', 'a.lua'],
  ['R', 'a.R'],
  ['Shell', 'a.sh'],
  ['CSS', 'a.css'],
  ['HTML', 'a.html'],
  ['Vue', 'A.vue'],
] as const) {
  CASES.push([`${language}: spaces`, language, path, ' '.repeat(SIZE)])
  CASES.push([`${language}: blank lines`, language, path, '\n'.repeat(SIZE)])
  CASES.push([`${language}: one long word`, language, path, 'a'.repeat(SIZE)])
  CASES.push([`${language}: spaced words`, language, path, fill('a ')])
}

/** Fastest of three runs (absorbs a garbage collection, JIT warm-up or a busy machine in the others). */
function timeIt(run: () => void): number {
  let best = Infinity
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    run()
    best = Math.min(best, performance.now() - t0)
  }
  return best
}

describe('pathological files are analysed quickly', () => {
  it.each(CASES)('%s', (_label, language, path, content) => {
    expect(content.length).toBeGreaterThanOrEqual(SIZE - 10)
    // The comment/string scanner is shared (and cached) by the extractors; give each run a fresh copy of the text.
    let n = 0
    const ms = timeIt(() => {
      const text = `${content}${' '.repeat(++n)}`
      maskSource(text, language)
      extractImports(path, text, language)
      extractSymbols(path, text, language)
      extractRoutes(path, text, language)
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})

/** Settings files the import resolver reads (go.mod, Cargo.toml, tsconfig.json …) and the code it indexes. */
const RESOLVER_CASES: [label: string, files: Record<string, string>, from: string, specifier: string, language: string][] = [
  ['go.mod of blank lines', { 'go.mod': `module example.com/x\n${'\n'.repeat(SIZE)}`, 'main.go': '' }, 'main.go', 'example.com/y', 'Go'],
  ['go.mod of replace arrows', { 'go.mod': `module example.com/x\n${fill('replace a =>')}`, 'main.go': '' }, 'main.go', 'example.com/y', 'Go'],
  ['Cargo.toml of brackets and blank lines', { 'Cargo.toml': `[package]\n${fill(' \n[')}`, 'src/main.rs': '' }, 'src/main.rs', 'crate::a', 'Rust'],
  ['tsconfig.json with an unclosed comment', { 'tsconfig.json': `{${fill(', /*')}`, 'src/a.ts': '' }, 'src/a.ts', '@/b', 'TypeScript'],
  ['tsconfig.json of commas and blank space', { 'tsconfig.json': `{${fill(',   ')}`, 'src/a.ts': '' }, 'src/a.ts', '@/b', 'TypeScript'],
  ['Kotlin files of modifier lines', { 'src/A.kt': fill('public\n'), 'src/B.kt': '' }, 'src/B.kt', 'com.acme.A', 'Kotlin'],
  ['C# files of a long word', { 'src/A.cs': 'a'.repeat(SIZE), 'src/B.cs': '' }, 'src/B.cs', 'Acme.Models', 'C#'],
  ['composer.json of blank space', { 'composer.json': `{${' '.repeat(SIZE)}`, 'index.php': '' }, 'index.php', 'App\\Models\\User', 'PHP'],
]

describe('hostile settings files are read quickly by the import resolver', () => {
  it.each(RESOLVER_CASES)('%s', (_label, files, from, specifier, language) => {
    const ms = timeIt(() => {
      // A fresh resolver each time: it caches what it learns from these files.
      const resolve = createResolver({ paths: Object.keys(files), files })
      resolve(from, { specifier, line: 1 }, language)
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
