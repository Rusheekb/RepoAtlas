import type { RepoRef } from '@/core/types'
import { parseRepoInput } from '@/github/parse'

export type RepoInputCheck = { ok: true; ref: RepoRef } | { ok: false; message: string }

/** Turn whatever was typed into a repository, or a friendly explanation of what's wrong with it. */
export function checkRepoInput(raw: string): RepoInputCheck {
  const input = raw.trim()
  if (!input) return { ok: false, message: 'Paste a link to a GitHub project first, for example github.com/pallets/flask.' }
  const ref = parseRepoInput(input)
  if (ref) return { ok: true, ref }
  if (/(^|[/.@])(gitlab\.com|bitbucket\.org|codeberg\.org|sourceforge\.net)/i.test(input)) {
    return { ok: false, message: 'RepoAtlas only works with projects on GitHub for now. Try a link that starts with github.com.' }
  }
  if (/github\.com/i.test(input)) {
    return {
      ok: false,
      message: 'That’s a GitHub link, but not to a specific project. Project links have two parts after github.com: the owner and the name, like github.com/pallets/flask.',
    }
  }
  if (!input.includes('/') && /^[\w.-]+$/.test(input)) {
    return {
      ok: false,
      message: `We need both the owner and the project name, separated by a slash, like “pallets/flask”. Is “${input.slice(0, 40)}” one of them?`,
    }
  }
  return { ok: false, message: 'That doesn’t look like a GitHub project link. Project links look like github.com/owner/name, for example github.com/pallets/flask.' }
}

export interface ExampleRepo {
  owner: string
  repo: string
  name: string
  blurb: string
  emoji: string
}

/** Hand-picked projects to try, from small and friendly to big. */
export const EXAMPLE_REPOS: ExampleRepo[] = [
  { owner: 'expressjs', repo: 'express', name: 'Express', blurb: 'A classic toolkit for building websites in JavaScript', emoji: '🚂' },
  { owner: 'pallets', repo: 'flask', name: 'Flask', blurb: 'A small Python web framework', emoji: '🧪' },
  { owner: 'gin-gonic', repo: 'gin', name: 'Gin', blurb: 'A fast web framework in Go', emoji: '🍸' },
  { owner: 'httpie', repo: 'cli', name: 'HTTPie', blurb: 'A friendly command-line tool', emoji: '⌨️' },
  { owner: 'excalidraw', repo: 'excalidraw', name: 'Excalidraw', blurb: 'A virtual whiteboard (big!)', emoji: '✏️' },
  { owner: 'Rusheekb', repo: 'RepoAtlas', name: 'RepoAtlas itself', blurb: 'The code behind this very app', emoji: '🗺️' },
]
