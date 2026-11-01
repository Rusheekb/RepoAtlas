import { groupText, matchAll, type ImportSink, type Source } from './util'

const INCLUDE = /^[ \t]*#[ \t]*(include|import|include_next)[ \t]*(?:(")( *)"|<([^>\n]+)>)/dgm
const OBJC_MODULE = /^[ \t]*@import\s+([\w.]+)\s*;/dgm

/**
 * C / C++ / Objective-C / CUDA: `#include "x.h"` (kind "include"), `#include <x>` (kind "include-system"),
 * Objective-C `#import` and `@import Module;`.
 */
export function extractC(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(INCLUDE, code)) {
    if (m[2]) sink.add(groupText(text, m, 3), m.index, 'include')
    else if (m[4]) sink.add(m[4].trim(), m.index, 'include-system')
  }
  if (code.includes('@import')) {
    for (const m of matchAll(OBJC_MODULE, code)) sink.add(m[1], m.index, 'module')
  }
}
