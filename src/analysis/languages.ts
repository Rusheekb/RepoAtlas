export interface LanguageDef {
  /** Display name, e.g. "TypeScript" */
  name: string
  /** Hex color (GitHub linguist colors). */
  color: string
  /** true for programming languages (counted as "code"); false for markup/data/prose/config formats. */
  isCode: boolean
}

/**
 * Detect a file's language from its path (extension, special basenames like Dockerfile/Makefile/Gemfile/.bashrc,
 * and compound names like "*.d.ts"). Returns null for unknown / binary types.
 * Cover 80+ languages & formats: TS, TSX, JS, JSX, MJS, CJS, Vue, Svelte, Astro, Python, Go, Rust, Java, Kotlin, Scala,
 * Groovy, C, C++, C#, F#, Swift, Objective-C, Ruby, PHP, Dart, Elixir, Erlang, Haskell, OCaml, Clojure, Lua, R, Julia,
 * Perl, Shell, PowerShell, Zig, Nim, Solidity, SQL, GraphQL, Protocol Buffers, HTML, CSS, SCSS, Sass, Less, Markdown,
 * MDX, reStructuredText, JSON, YAML, TOML, XML, INI, Dockerfile, Makefile, CMake, Nix, HCL/Terraform, Jupyter Notebook …
 */
export function detectLanguage(path: string): LanguageDef | null {
  void path
  return null
}

/** Color for a language display name (fallback neutral gray). */
export function languageColor(name: string): string {
  void name
  return '#9b9a94'
}
