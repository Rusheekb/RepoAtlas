import type { AnalyzedFile } from '@/core/types'
import type { ManifestInfo } from '@/knowledge'

/**
 * Likely starting points, best first, each with a plain-English reason.
 * Signals: manifest entryHints (package.json main/bin, pyproject scripts, Dockerfile CMD), conventional names at shallow
 * depth (main.*, index.* at root/src, app.*, server.*, cli.*, __main__.py, manage.py, cmd/<x>/main.go, src/main.rs,
 * src/bin/*.rs, Program.cs, Main.java with `public static void main`), content signals (`if __name__ == "__main__"`,
 * `func main()`, `fn main()`, `createRoot(`/`ReactDOM.render(`, `app.listen(`, `uvicorn.run(`), files imported by no one
 * but importing many. Return at most ~8.
 */
export function findEntryPoints(files: AnalyzedFile[], manifests: ManifestInfo, contents: Record<string, string>): { path: string; reason: string }[] {
  void files; void manifests; void contents
  return []
}

/** Files many others depend on (by importedBy count, excluding tests), most depended-on first. At most ~10. */
export function findHubs(files: AnalyzedFile[]): string[] {
  void files
  return []
}
