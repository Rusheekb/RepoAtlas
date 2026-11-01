import { maskSource } from '../strip'
import { extractJs } from './js'
import {
  attrOffset,
  attrValue,
  findTagBlocks,
  groupStart,
  isNonFileReference,
  keepRanges,
  matchAll,
  untilTerminator,
  type ImportSink,
  type Source,
} from './util'

// ─── CSS / SCSS / Less / Stylus / Sass ───────────────────────────────────────

const CSS_AT = /@(import|use|forward|require|config|plugin|reference)\b([^;\n{]*)/dg
const QUOTED = /(['"])( *)\1/dg
const URL_BARE = /url\(\s*([^'")\s]+)\s*\)/dg
const COMPOSES = /\bcomposes\s*:[^;]{0,1000}?\bfrom\s+(['"])( *)\1/dg

/**
 * CSS-family: @import (quoted, url(), comma lists, Less options), @use/@forward, Tailwind @config/@plugin, CSS-modules
 * composes. Kinds are the at-rule with its "@" ("@import", "@use" …) or "composes", so CSS imports stay recognizable
 * when they come from a <style> block inside a Vue/Svelte/HTML file.
 */
export function extractCss(src: Source, sink: ImportSink): void {
  const { code, text } = src
  const sass = src.language.toLowerCase() === 'sass' || src.language.toLowerCase() === 'stylus'
  for (const m of matchAll(CSS_AT, code)) {
    const bodyStart = groupStart(m, 2)
    const body = m[2]
    let found = false
    for (const q of matchAll(QUOTED, body)) {
      const a = bodyStart + groupStart(q, 2)
      const spec = text.slice(a, a + q[2].length).trim()
      found = true
      if (spec && !isNonFileReference(spec)) sink.add(spec, m.index, `@${m[1]}`)
    }
    for (const u of matchAll(URL_BARE, body)) {
      found = true
      const spec = u[1]
      if (!isNonFileReference(spec)) sink.add(spec, m.index, `@${m[1]}`)
    }
    if (!found && sass) {
      // Indented Sass / Stylus allow unquoted paths: "@import foo/bar".
      for (const part of body.split(',')) {
        const spec = part.trim()
        if (/^[\w./~@-]+$/.test(spec)) sink.add(spec, m.index, `@${m[1]}`)
      }
    }
  }
  for (const m of matchAll(COMPOSES, code)) {
    const a = groupStart(m, 2)
    sink.add(text.slice(a, a + m[2].length), m.index, 'composes')
  }
}

// ─── HTML ────────────────────────────────────────────────────────────────────

/** Longest attribute list read from one tag. */
const MAX_TAG = 4000

/** Tag openers; the attributes run to the next ">" (read with untilTerminator, so many unclosed tags stay fast). */
const LINK_TAG = /<link\b/gi
const SCRIPT_SRC_TAG = /<script\b/gi

function viewsFor(raw: string, language: string, ranges: [number, number][]): Source {
  const kept = keepRanges(raw, ranges)
  const masked = maskSource(kept, language)
  return { path: '', language, raw: kept, text: masked.text, code: masked.code }
}

/** Inline <script> blocks → JS extraction; inline <style> blocks → CSS extraction (line numbers preserved). */
function embedded(src: Source, sink: ImportSink, onlyScripts = false): void {
  const scripts = findTagBlocks(src.text, 'script').filter((b) => {
    const type = attrValue(b.attrs, 'type')?.toLowerCase()
    return b.end > b.start && (!type || /module|(java|ecma|type)script|babel|jsx|tsx/.test(type))
  })
  if (scripts.length) {
    const js = viewsFor(src.raw, 'TypeScript', scripts.map((b) => [b.start, b.end]))
    extractJs({ ...js, path: src.path }, sink)
  }
  if (onlyScripts) return
  const styles = findTagBlocks(src.text, 'style').filter((b) => b.end > b.start)
  if (styles.length) {
    const lang = styles.some((b) => /scss|sass|less|styl/i.test(attrValue(b.attrs, 'lang') ?? '')) ? 'SCSS' : 'CSS'
    const css = viewsFor(src.raw, lang, styles.map((b) => [b.start, b.end]))
    extractCss({ ...css, path: src.path }, sink)
  }
}

/** HTML: <script src>, <link rel="stylesheet|modulepreload|preload|manifest" href>, inline module scripts and styles. */
export function extractHtml(src: Source, sink: ImportSink): void {
  const { text } = src
  for (const { head, body } of untilTerminator(text, SCRIPT_SRC_TAG, '>', MAX_TAG)) {
    const value = attrValue(body, 'src')
    if (value && !isNonFileReference(value)) sink.add(value, head.index, 'script')
  }
  for (const { head, body } of untilTerminator(text, LINK_TAG, '>', MAX_TAG)) {
    const rel = (attrValue(body, 'rel') ?? '').toLowerCase()
    if (!/\b(stylesheet|modulepreload|preload|manifest|import)\b/.test(rel)) continue
    const href = attrValue(body, 'href')
    if (href && !isNonFileReference(href)) sink.add(href, head.index, rel.includes('stylesheet') ? 'stylesheet' : 'link')
  }
  embedded(src, sink)
}

// ─── Single-file components (Vue, Svelte, Astro) ─────────────────────────────

/**
 * Vue / Svelte / Astro: only the <script> block(s) (and Astro's --- frontmatter) are scanned as JS; <style> blocks
 * as CSS; `src` attributes on <script>/<style>/<template> are dependencies too.
 */
export function extractSfc(src: Source, sink: ImportSink): void {
  const { text, raw } = src
  const ranges: [number, number][] = []
  if (src.language.toLowerCase() === 'astro') {
    const fm = /^﻿?[ \t]*---[ \t]*\r?\n/.exec(raw)
    if (fm) {
      const rest = raw.slice(fm[0].length)
      const close = /^[ \t]*---[ \t]*$/m.exec(rest)
      ranges.push([fm[0].length, close ? fm[0].length + close.index : raw.length])
    }
  }
  const scripts = findTagBlocks(text, 'script')
  for (const b of scripts) {
    const s = attrValue(b.attrs, 'src')
    if (s && !isNonFileReference(s)) sink.add(s, attrOffset(text, b.tagStart, 'src'), 'script')
    else if (b.end > b.start) ranges.push([b.start, b.end])
  }
  if (ranges.length) {
    const js = viewsFor(raw, 'TypeScript', ranges)
    extractJs({ ...js, path: src.path }, sink)
  }
  for (const tag of ['style', 'template']) {
    for (const b of findTagBlocks(text, tag)) {
      const s = attrValue(b.attrs, 'src')
      if (s && !isNonFileReference(s)) sink.add(s, attrOffset(text, b.tagStart, 'src'), tag)
    }
  }
  const styles = findTagBlocks(text, 'style').filter((b) => b.end > b.start)
  if (styles.length) {
    const lang = styles.some((b) => /scss|sass|less|styl/i.test(attrValue(b.attrs, 'lang') ?? '')) ? 'SCSS' : 'CSS'
    const css = viewsFor(raw, lang, styles.map((b) => [b.start, b.end]))
    extractCss({ ...css, path: src.path }, sink)
  }
  // Astro templates may also contain inline client scripts handled above; nothing else to scan.
}

/** MDX: ESM `import` / `export … from` lines at the start of a line. */
export function extractMdx(src: Source, sink: ImportSink): void {
  const raw = src.raw
  const ranges: [number, number][] = []
  const re = /^(?:import|export)\b[^\n]*(?:\n(?![ \t]*\n)(?!#)[^\n]*)*/gm
  let inFence = false
  let pos = 0
  // Lines already inside an earlier statement are not re-read (that would be quadratic on a file of export lines).
  let covered = 0
  for (const line of raw.split('\n')) {
    if (/^[ \t]*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && pos >= covered && /^(?:import|export)\b/.test(line)) {
      re.lastIndex = pos
      const m = re.exec(raw)
      if (m && m.index === pos) {
        ranges.push([pos, pos + m[0].length])
        covered = pos + m[0].length
      }
    }
    pos += line.length + 1
  }
  if (!ranges.length) return
  const js = viewsFor(raw, 'TypeScript', ranges)
  extractJs({ ...js, path: src.path }, sink)
}
