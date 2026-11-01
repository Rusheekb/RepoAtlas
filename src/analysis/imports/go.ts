import { groupStart, groupText, matchAll, untilTerminator, type ImportSink, type Source } from './util'

const GROUP_HEAD = /\bimport\s*\(/g
const ENTRY = /(?:^|[\n;(])[ \t]*([\w.]+[ \t]+)?(["`])( *)\2/dg
const SINGLE = /\bimport[ \t]+([\w.]+[ \t]+)?(["`])( *)\2/dg

/** Go: single and grouped imports, with aliases and `_` / `.` imports. Each grouped entry keeps its own line. */
export function extractGo(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const { body, bodyStart } of untilTerminator(code, GROUP_HEAD, ')')) {
    for (const e of matchAll(ENTRY, body)) {
      const contentStart = bodyStart + groupStart(e, 3)
      const len = e[3].length
      const spec = text.slice(contentStart, contentStart + len)
      const alias = e[1]?.trim()
      sink.add(spec, contentStart, 'import', alias ? [alias] : undefined)
    }
  }
  for (const m of matchAll(SINGLE, code)) {
    const alias = m[1]?.trim()
    sink.add(groupText(text, m, 3), m.index, 'import', alias ? [alias] : undefined)
  }
}
