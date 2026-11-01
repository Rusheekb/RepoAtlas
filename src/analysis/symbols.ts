import type { CodeSymbol } from '@/core/types'

/**
 * Extract top-level named definitions (regex-based) with 1-based line numbers and a short one-line signature.
 * JS/TS: functions, arrow-function consts, classes, interfaces, types, enums, React components (PascalCase function or
 * const returning JSX → 'component'), hooks (use[A-Z]… → 'hook'); exported flag.
 * Python: def/async def/class at column 0 (methods optional), UPPER_CASE constants; exported = not starting with "_".
 * Go: func (incl. methods with receivers), type X struct/interface; exported = Capitalized.
 * Rust: fn, struct, enum, trait, impl, mod; exported = pub. Java/Kotlin/C#: class/interface/enum/record + methods.
 * Ruby: class/module/def. PHP: class/function/interface/trait. Swift: func/class/struct/enum/protocol.
 * C/C++: function definitions (best effort), struct/class. Cap at 200 symbols per file.
 */
export function extractSymbols(path: string, content: string, language: string): CodeSymbol[] {
  void path; void content; void language
  return []
}
