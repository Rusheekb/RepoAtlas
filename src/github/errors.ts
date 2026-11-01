import type { GitHubErrorKind } from '@/core/types'

/** A GitHub failure with a friendly, non-technical message suitable for showing to the user. */
export class GitHubError extends Error {
  kind: GitHubErrorKind
  /** Optional technical detail (status code, raw message) for a "details" disclosure. */
  detail?: string
  /** For rate limits: when the limit resets (ms since epoch). */
  resetAt?: number
  status?: number

  constructor(kind: GitHubErrorKind, message: string, opts: { detail?: string; resetAt?: number; status?: number } = {}) {
    super(message)
    this.name = 'GitHubError'
    this.kind = kind
    this.detail = opts.detail
    this.resetAt = opts.resetAt
    this.status = opts.status
  }
}
