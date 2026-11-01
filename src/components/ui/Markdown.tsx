import { createContext, memo, useContext, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from './cn'

export interface MarkdownProps {
  children: string
  className?: string
  /** Show a blinking caret at the end (while streaming). */
  streaming?: boolean
  /**
   * Text the project's own authors wrote (a README or a markdown file from the repository), rather than text Claude
   * generated. Only trusted markdown shows pictures from other websites (https only). Default false: pictures become
   * plain links, except ones stored in the current repository (see MarkdownImageSources).
   */
  trusted?: boolean
  /**
   * Resolve relative links/images (e.g. README images) to absolute URLs.
   * Return null to drop the link.
   */
  resolveUrl?: (url: string, kind: 'link' | 'image') => string | null
  /** Called when an inline `code` span matches a repo path — lets callers turn file mentions into navigation. */
  onCodeClick?: (code: string) => boolean
  /** Return true if inline code text is a clickable reference (e.g. a known file path). */
  isCodeLink?: (code: string) => boolean
}

/**
 * URL prefixes whose pictures may load inside untrusted (AI-written) markdown, e.g.
 * "https://raw.githubusercontent.com/<owner>/<repo>/" for the repository being explored. Provided by the repo layout.
 */
export const MarkdownImageSources = /* @__PURE__ */ createContext<readonly string[]>([])

/** Set inside a link, so nothing clickable is nested in it. */
const InsideLink = /* @__PURE__ */ createContext(false)

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

/** "//host/x" → "https://host/x", so protocol-relative links are treated (and opened) like any other website. */
function withProtocol(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

function parseWebUrl(url: string): URL | null {
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/** True when `url` is https and starts with one of the allowed prefixes (both compared after URL normalisation). */
export function isAllowedImage(url: string, allowed: readonly string[]): boolean {
  const u = parseWebUrl(url)
  if (!u || u.protocol !== 'https:') return false
  const href = u.href.toLowerCase()
  return allowed.some((p) => {
    const prefix = parseWebUrl(p)?.href.toLowerCase()
    return Boolean(prefix && prefix.endsWith('/') && href.startsWith(prefix))
  })
}

/** A repository path from a relative link ("./src/app.py#L3" → "src/app.py"), or null for anything else. */
function relativePath(url: string): string | null {
  if (!url || url.startsWith('#') || url.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null
  const path = url.split(/[?#]/, 1)[0].replace(/^\.\//, '').replace(/^\/+/, '')
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

interface CodeLinks {
  onCodeClick?: (code: string) => boolean
  isCodeLink?: (code: string) => boolean
}

function FileButton({ path, onCodeClick, children }: { path: string; onCodeClick: (code: string) => boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onCodeClick(path)}
      className="cursor-pointer rounded-[5px] border border-line bg-brand-soft px-[0.35em] py-[0.08em] font-mono text-[0.86em] text-brand-text hover:underline"
      title="Open this file"
    >
      <InsideLink.Provider value>{children}</InsideLink.Provider>
    </button>
  )
}

/** A picture we chose not to load: a plain link naming the website it lives on (plain text inside another link). */
function PictureLink({ url, alt }: { url: URL; alt: string }) {
  const inLink = useContext(InsideLink)
  const text = `${alt.trim() ? `Picture: ${alt.trim()}` : 'Picture'} (on ${url.host})`
  if (inLink) return <span data-blocked-image>{text}</span>
  return (
    <a href={url.href} {...EXTERNAL} data-blocked-image>
      <span aria-hidden className="mr-1 inline-block">
        🖼️
      </span>
      {text}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function CodeSpan({ className, children, onCodeClick, isCodeLink, ...rest }: CodeLinks & ComponentProps<'code'>) {
  const inLink = useContext(InsideLink)
  const text = String(children ?? '')
  const isBlock = /language-/.test(className ?? '') || text.includes('\n')
  if (!isBlock && !inLink && onCodeClick && isCodeLink?.(text)) {
    return (
      <FileButton path={text} onCodeClick={onCodeClick}>
        {text}
      </FileButton>
    )
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  )
}

/**
 * Safe markdown renderer (no raw HTML) with the app's prose styles.
 * Links to websites open in a new tab; javascript:/data: URLs are dropped.
 *
 * Untrusted markdown (the default, used for everything Claude writes) never loads a picture by itself: a planted
 * instruction could make Claude write an image address that quietly sends the reader's question or code to another
 * website. Pictures show as links instead, and relative links become in-app file links (or plain text).
 */
export const Markdown = /* @__PURE__ */ memo(function Markdown({ children, className, streaming, trusted = false, resolveUrl, onCodeClick, isCodeLink }: MarkdownProps) {
  const imageSources = useContext(MarkdownImageSources)

  const resolve = (raw: string | undefined, kind: 'link' | 'image'): string | null => {
    const trimmed = withProtocol((raw ?? '').trim())
    if (!trimmed || /^(javascript|data|vbscript|file):/i.test(trimmed)) return null
    return resolveUrl ? resolveUrl(trimmed, kind) : trimmed
  }

  const components: Components = {
    a: ({ href, children: c, node: _node, ...rest }) => {
      const raw = typeof href === 'string' ? href.trim() : ''
      if (!trusted) {
        const path = relativePath(raw)
        if (path != null) {
          // A link to a file in this repository opens it in the app; anything else relative would leave the app.
          return onCodeClick && isCodeLink?.(path) ? (
            <FileButton path={path} onCodeClick={onCodeClick}>
              {c}
            </FileButton>
          ) : (
            <span>{c}</span>
          )
        }
      }
      const url = resolve(raw, 'link')
      const web = url ? parseWebUrl(url) : null
      if (!url || (!trusted && !web)) return <span>{c}</span>
      return (
        <a {...rest} href={web ? web.href : url} {...(web ? EXTERNAL : {})}>
          <InsideLink.Provider value>{c}</InsideLink.Provider>
        </a>
      )
    },
    img: ({ src, alt, node: _node, ...rest }) => {
      const url = resolve(typeof src === 'string' ? src : undefined, 'image')
      const web = url ? parseWebUrl(url) : null
      if (!web) return alt ? <span>{alt}</span> : null
      const allowed = web.protocol === 'https:' && (trusted || isAllowedImage(web.href, imageSources))
      if (!allowed) return <PictureLink url={web} alt={alt ?? ''} />
      return <img {...rest} src={web.href} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
    },
    code: ({ node: _node, ...props }) => <CodeSpan {...props} onCodeClick={onCodeClick} isCodeLink={isCodeLink} />,
    table: ({ node: _node, ...rest }) => (
      <div className="overflow-x-auto">
        <table {...rest} />
      </div>
    ),
  }
  return (
    <div className={cn('prose-atlas', streaming && 'ai-caret', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  )
})
