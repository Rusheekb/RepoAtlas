/** Small helpers for writing friendly, plain-English sentences from analysis data. */

import { formatNumber } from '@/core/format'

/** "a" → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b and c". */
export function listJoin(items: string[], conjunction = 'and'): string {
  const xs = items.filter(Boolean)
  if (xs.length === 0) return ''
  if (xs.length === 1) return xs[0]
  return `${xs.slice(0, -1).join(', ')} ${conjunction} ${xs[xs.length - 1]}`
}

/** "3 files", "1 file", with thousands separators. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

/** Spelled-out numbers for small counts read more naturally in prose ("three parts"). */
export function numberWord(n: number): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return n >= 0 && n < words.length && Number.isInteger(n) ? words[n] : formatNumber(n)
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function lowerFirst(s: string): string {
  if (!s) return s
  // Keep acronyms and proper-noun-looking words ("API", "React") as they are.
  if (/^[A-Z]{2,}/.test(s) || /^[A-Z][a-z]+[A-Z]/.test(s)) return s
  return s[0].toLowerCase() + s.slice(1)
}

/** Ensure a sentence ends with terminal punctuation. */
export function sentence(s: string): string {
  const t = s.trim()
  if (!t) return t
  return /[.!?…:)"”’]$/.test(t) ? t : `${t}.`
}

/** The first sentence of a paragraph (best effort). */
export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const m = /^(.+?[.!?])(\s|$)/.exec(t)
  return (m ? m[1] : t).trim()
}

export function wordCount(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Trim to at most `max` words, adding an ellipsis when something was cut. */
export function truncateWords(s: string, max: number): string {
  const words = s.trim().split(/\s+/)
  if (words.length <= max) return s.trim()
  return `${words.slice(0, max).join(' ').replace(/[,;:—–-]+$/, '')}…`
}

/** Trim to at most `max` characters at a word boundary. */
export function truncateChars(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:—–-]+$/, '')}…`
}

/**
 * Make an untrusted name safe to put inside inline code (`…`) in Markdown: no backticks, no line breaks,
 * bounded length.
 */
export function safeName(name: string, max = 60): string {
  const clean = name.replace(/[`\r\n\t]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** `name` wrapped as inline code, made safe. */
export function code(name: string): string {
  const s = safeName(name)
  return s ? `\`${s}\`` : ''
}

/**
 * Make untrusted text safe to embed in our own Markdown prose: strips HTML tags, images, link targets,
 * reference-style definitions, emphasis noise and line breaks. Links keep their visible text only.
 */
export function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/\|/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:nbsp|quot|apos|lt|gt);|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The first real paragraph of a README in plain text (skipping the title, badges, HTML blocks, tables of contents,
 * code blocks and lists), or null when there is none worth quoting.
 */
export function readmeIntro(readme: string | null | undefined, maxChars = 320): string | null {
  if (!readme) return null
  const withoutCode = readme.replace(/```[\s\S]*?```/g, '\n\n').replace(/~~~[\s\S]*?~~~/g, '\n\n')
  const blocks = withoutCode.split(/\r?\n\s*\r?\n/)
  for (const block of blocks) {
    const b = block.trim()
    if (!b) continue
    if (/^(#|=+$|-+$|\||- |\* |\+ |\d+\.\s|>?\s*\[!)/.test(b)) continue // headings, rules, tables, lists, callouts
    if (/^\s*(\[!\[|!\[|<)/.test(b) && plainText(b).length < 40) continue // badges / pure HTML
    const text = plainText(b.replace(/^>\s?/gm, ''))
    if (text.length < 25) continue
    if (!/[a-z]{3,}/i.test(text) || /^(table of contents|contents|toc)\b/i.test(text)) continue
    // News, banners and housekeeping notes don't describe the project.
    if (/\b(announc\w*|we['’]re excited|we are excited|is now available|new release|release notes|sponsor\w*|deprecated|no longer maintained|looking for maintainers|breaking changes?|star (us|this repo)|join our|discord server|hiring)\b/i.test(text)) continue
    // Mostly words, not a wall of links or symbols.
    const letters = (text.match(/[a-z]/gi) ?? []).length
    if (letters / text.length < 0.55) continue
    return truncateChars(text, maxChars)
  }
  return null
}

/** Words of an identifier: "UserProfileCard" → ["user","profile","card"], "user_profile-card" → same. */
export function identifierWords(name: string): string[] {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

/** "user_profile" → "user profile"; "UserProfile" → "user profile". */
export function humanize(name: string): string {
  return identifierWords(name).join(' ')
}

/** "user-profile" → "User profile". */
export function titleize(name: string): string {
  return capitalize(humanize(name))
}

/** A cheap stable hash, used to pick between phrasing variants deterministically. */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Pick one of several variants, stable for the same key. */
export function pick<T>(key: string, variants: readonly T[]): T {
  return variants[hashString(key) % variants.length]
}

/** kebab-case id from any text: "User Profile!" → "user-profile". */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'item'
  )
}

/** Simple English plural for labels ("UI building block" → "UI building blocks", "Data access" stays). */
export function pluralLabel(label: string): string {
  const uncountable = /(access|memory|setup|styling|documentation|logic|data|code|behavior|information|storage|settings|rules|definitions|values|translations)$/i
  if (uncountable.test(label)) return label
  if (/(s|x|ch|sh)$/i.test(label)) return `${label}es`
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`
  return `${label}s`
}

/** Escape characters that would turn untrusted text into Markdown formatting, links or HTML. */
export function escapeMd(s: string): string {
  return s.replace(/[\\`*_[\]<>#|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ')
}

/** "a" or "an" for a word ("an API", "a UI building block", "an infrastructure setup", "a user"). */
export function article(word: string): string {
  const w = word.trim()
  if (!w) return 'a'
  // Acronyms and single letters are read letter by letter: "an HTML file", "a UI piece", "an R script".
  if (/^[A-Z](?:[A-Z0-9#+]|$|[^a-z])/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a'
  if (/^(?:hour|honest|honou?r|heir)/i.test(w)) return 'an'
  return /^(?:[aeio]|u(?:n(?!i)|m|p|s(?![eua])|g|t(?!i)|l|r(?![eaoi])))/i.test(w) ? 'an' : 'a'
}

/** Escape Markdown in generated text while keeping its `code` spans intact. */
export function escapeMdKeepCode(s: string): string {
  return s
    .split(/(`[^`\n]*`)/)
    .map((part) => (part.length >= 2 && part.startsWith('`') && part.endsWith('`') ? part : escapeMd(part)))
    .join('')
}
