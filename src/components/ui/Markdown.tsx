import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from './cn'

export interface MarkdownProps {
  children: string
  className?: string
  /** Show a blinking caret at the end (while streaming). */
  streaming?: boolean
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
 * Safe markdown renderer (no raw HTML) with the app's prose styles.
 * Links open in a new tab; javascript:/data: URLs are dropped.
 */
export const Markdown = memo(function Markdown({ children, className, streaming, resolveUrl, onCodeClick, isCodeLink }: MarkdownProps) {
  const safe = (url: string | undefined, kind: 'link' | 'image'): string | undefined => {
    if (!url) return undefined
    const trimmed = url.trim()
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return undefined
    if (resolveUrl) return resolveUrl(trimmed, kind) ?? undefined
    return trimmed
  }
  const components: Components = {
    a: ({ href, children: c, node: _node, ...rest }) => {
      const url = safe(href, 'link')
      if (!url) return <span>{c}</span>
      const external = /^https?:/i.test(url)
      return (
        <a href={url} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})} {...rest}>
          {c}
        </a>
      )
    },
    img: ({ src, alt, node: _node, ...rest }) => {
      const url = safe(typeof src === 'string' ? src : undefined, 'image')
      if (!url) return null
      return <img src={url} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" {...rest} />
    },
    code: ({ className: cls, children: c, node: _node, ...rest }) => {
      const text = String(c ?? '')
      const isBlock = /language-/.test(cls ?? '') || text.includes('\n')
      if (!isBlock && isCodeLink?.(text) && onCodeClick) {
        return (
          <button
            type="button"
            onClick={() => onCodeClick(text)}
            className="cursor-pointer rounded-[5px] border border-line bg-brand-soft px-[0.35em] py-[0.08em] font-mono text-[0.86em] text-brand-text hover:underline"
            title="Open this file"
          >
            {text}
          </button>
        )
      }
      return (
        <code className={cls} {...rest}>
          {c}
        </code>
      )
    },
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
