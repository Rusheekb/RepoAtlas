/** The first part of a markdown document, cut at a paragraph break outside code blocks. */
export function markdownPreview(md: string, maxChars: number): { text: string; truncated: boolean } {
  if (md.length <= maxChars) return { text: md, truncated: false }
  const lines = md.split('\n')
  let inFence = false
  let length = 0
  let cut = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    length += line.length + 1
    if (!inFence && line.trim() === '' && length > maxChars * 0.4) cut = i
    if (length > maxChars && cut !== -1) break
  }
  if (cut === -1) return { text: md, truncated: false }
  return { text: lines.slice(0, cut).join('\n').trimEnd(), truncated: true }
}

/**
 * Pictographic emoji (with their variation selectors, joiners and one following space), but not the copyright,
 * registered and trademark signs. Used to keep generated labels emoji-free in the interface
 * ("Explore <gear emoji> flask" becomes "Explore flask").
 */
const EMOJI_RE = /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\uFE0F? ?/gu

/** The text without emoji. Leaves everything else (including code and markdown) untouched. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '')
}
