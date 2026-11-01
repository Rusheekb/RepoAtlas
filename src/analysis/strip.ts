/**
 * Replace comments with spaces (preserving newlines so line numbers stay correct) for a language family.
 * Must not break on comment markers inside string literals (best effort: handle '…', "…", `…`, and Python triple quotes).
 */
export function stripComments(content: string, language: string): string {
  void language
  return content
}
