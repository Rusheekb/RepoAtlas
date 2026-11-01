import type { RawImport } from '@/core/types'

/**
 * Extract import/dependency statements from source code (regex-based, after stripComments).
 * Languages: JavaScript/TypeScript/JSX/TSX/Vue/Svelte/Astro (import … from, export … from, require(), import(),
 * import 'x'), Python (import a.b, from .x import y, from . import z), Go (single & grouped imports),
 * Rust (mod x;, use crate::/super::/self::, extern crate), Java/Kotlin/Scala/Groovy (import a.b.C; static imports),
 * C#  (using X.Y;), C/C++/Objective-C (#include "x.h" — angle-bracket includes are external), Ruby (require,
 * require_relative, load), PHP (use A\B; require/include 'x.php'), Swift (import X), Dart (import 'package:…'/'x.dart'),
 * Elixir (alias/import/use), Lua (require), R (library/source), Shell (source/.), CSS/SCSS/Less (@import, @use),
 * HTML (<script src>, <link href>).
 * Line numbers are 1-based. Deduplicate identical specifiers (keep first line).
 */
export function extractImports(path: string, content: string, language: string): RawImport[] {
  void path; void content; void language
  return []
}
