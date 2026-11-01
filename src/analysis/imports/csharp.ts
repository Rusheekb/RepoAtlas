import { matchAll, type ImportSink, type Source } from './util'

const USING = /^[ \t]*(?:global\s+)?using\s+(static\s+)?(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_][\w]*(?:\s*\.\s*[A-Za-z_]\w*)*)(?:\s*<[^>;]*>)?\s*;/dgm

/** C#: `using X.Y;`, `global using`, `using static X.Y;`, `using Alias = X.Y;` (not `using (…)` / `using var`). */
export function extractCsharp(src: Source, sink: ImportSink): void {
  for (const m of matchAll(USING, src.code)) {
    const ns = m[3].replace(/\s+/g, '')
    if (ns === 'var') continue
    sink.add(ns, m.index, m[1] ? 'static' : 'using', m[2] ? [m[2]] : undefined)
  }
}
