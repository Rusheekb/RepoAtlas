import type { HighlighterCore, ThemedToken } from 'shiki/core'
import { GRAMMAR_LOADERS, type GrammarId } from './languages'

/**
 * Lazy, shared Shiki highlighter. Nothing Shiki-related is downloaded until the first file is colored; each grammar is
 * fetched the first time a file needs it. Tokens carry both theme colors as CSS variables (--shiki-light /
 * --shiki-dark), so switching the app theme recolors code instantly without re-highlighting.
 */

/** One colored piece of a line. `light`/`dark` are hex colors (absent = use the default text color). */
export interface CodeToken {
  content: string
  light?: string
  dark?: string
  italic?: boolean
  bold?: boolean
}

export type CodeTokenLine = CodeToken[]

/** Lines longer than this are left uncolored (minified code would otherwise stall the tokenizer). */
export const MAX_TOKENIZED_LINE_LENGTH = 2000
/** Lines per tokenizing batch; the browser gets a breather between batches so scrolling stays smooth. */
const BATCH_LINES = 400

const THEMES = { light: 'github-light', dark: 'github-dark' } as const

let highlighterPromise: Promise<HighlighterCore> | null = null
const grammarPromises = new Map<GrammarId, Promise<void>>()

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ])
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      // Forgiving: a grammar pattern the JavaScript engine can't express is skipped instead of failing the whole file.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    })
  })()
  // A failed download (offline, deploy in progress) shouldn't poison every later attempt.
  highlighterPromise.catch(() => {
    highlighterPromise = null
  })
  return highlighterPromise
}

function loadGrammar(highlighter: HighlighterCore, id: GrammarId): Promise<void> {
  let p = grammarPromises.get(id)
  if (!p) {
    p = highlighter.loadLanguage(GRAMMAR_LOADERS[id])
    grammarPromises.set(id, p)
    p.catch(() => grammarPromises.delete(id))
  }
  return p
}

function styleValue(style: Record<string, string> | undefined, key: string): string | undefined {
  const v = style?.[key]
  return v ? v : undefined
}

/** Shiki's dual-theme token → our compact token. Exported for tests. */
export function toCodeToken(t: Pick<ThemedToken, 'content' | 'htmlStyle'>): CodeToken {
  const s = t.htmlStyle
  const token: CodeToken = { content: t.content }
  const light = styleValue(s, '--shiki-light')
  const dark = styleValue(s, '--shiki-dark')
  if (light) token.light = light
  if (dark) token.dark = dark
  if (styleValue(s, '--shiki-light-font-style') === 'italic') token.italic = true
  if (styleValue(s, '--shiki-light-font-weight') === 'bold') token.bold = true
  return token
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Color `lines` with grammar `id`, in batches. `onProgress` receives every line colored so far (a growing array), so
 * the viewer can paint the top of a long file while the rest is still being worked on. Resolves with all lines.
 * Pass an AbortSignal to stop early (resolves with what was done).
 */
export async function highlightLines(
  lines: readonly string[],
  id: GrammarId,
  opts: { signal?: AbortSignal; onProgress?: (done: CodeTokenLine[]) => void } = {},
): Promise<CodeTokenLine[]> {
  const highlighter = await loadHighlighter()
  await loadGrammar(highlighter, id)
  const out: CodeTokenLine[] = []
  let grammarState: ReturnType<HighlighterCore['codeToTokens']>['grammarState']
  for (let i = 0; i < lines.length; i += BATCH_LINES) {
    if (opts.signal?.aborted) return out
    const batch = lines.slice(i, i + BATCH_LINES)
    const result = highlighter.codeToTokens(batch.join('\n'), {
      lang: id,
      themes: THEMES,
      defaultColor: false,
      tokenizeMaxLineLength: MAX_TOKENIZED_LINE_LENGTH,
      grammarState,
    })
    grammarState = result.grammarState
    for (let j = 0; j < batch.length; j++) {
      const row = result.tokens[j]
      out.push(row ? row.map(toCodeToken) : [{ content: batch[j] }])
    }
    opts.onProgress?.(out.slice())
    if (i + BATCH_LINES < lines.length) await yieldToBrowser()
  }
  return out
}

/** Start downloading the highlighter early (e.g. when the reader hovers into the code view). Errors are ignored. */
export function preloadHighlighter(id?: GrammarId | null): void {
  void loadHighlighter()
    .then((h) => (id ? loadGrammar(h, id) : undefined))
    .catch(() => undefined)
}
