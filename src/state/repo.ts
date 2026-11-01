import { create } from 'zustand'
import { analyzeRepo } from '@/analysis'
import { GitHubError, fetchFileText, loadRepoSnapshot } from '@/github'
import { repoKey } from '@/core/routes'
import type { LoadProgress, RepoAnalysis, RepoRef, RepoSnapshot } from '@/core/types'
import { useSettings } from './settings'

export type RepoStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface RepoState {
  key: string | null
  ref: RepoRef | null
  status: RepoStatus
  progress: LoadProgress | null
  snapshot: RepoSnapshot | null
  analysis: RepoAnalysis | null
  error: { kind: string; message: string; detail?: string } | null
  /** Load (or reuse) a repository. Safe to call repeatedly with the same ref. */
  load: (ref: RepoRef, opts?: { force?: boolean }) => Promise<void>
  /** Get a file's text, downloading it on demand if it wasn't part of the initial snapshot. */
  getFileContent: (path: string) => Promise<string>
  reset: () => void
}

let controller: AbortController | null = null
/** Files downloaded on demand, keyed by repository, commit and path (see extraKey). Emptied on every load. */
const extraFiles = new Map<string, string>()
const extraKey = (snapshot: RepoSnapshot, path: string) => `${snapshot.meta.fullName.toLowerCase()}@${snapshot.commitSha}:${path}`

export const useRepoStore = create<RepoState>()((set, get) => ({
  key: null,
  ref: null,
  status: 'idle',
  progress: null,
  snapshot: null,
  analysis: null,
  error: null,

  load: async (ref, opts) => {
    const key = repoKey(ref)
    const cur = get()
    if (!opts?.force && cur.key === key && (cur.status === 'ready' || cur.status === 'loading')) return

    controller?.abort()
    const ctrl = new AbortController()
    controller = ctrl
    extraFiles.clear()
    set({ key, ref, status: 'loading', progress: { stage: 'meta', message: 'Finding the repository on GitHub…' }, snapshot: null, analysis: null, error: null })

    const { githubToken, analysisDepth, rememberKeys } = useSettings.getState()
    try {
      const snapshot = await loadRepoSnapshot(ref, {
        token: githubToken.trim() || undefined,
        depth: analysisDepth,
        force: opts?.force,
        // Private code is only kept on this computer when the user asked us to remember their keys.
        persistPrivate: rememberKeys,
        signal: ctrl.signal,
        onProgress: (progress) => {
          if (controller === ctrl) set({ progress })
        },
      })
      if (controller !== ctrl) return
      set({ snapshot, progress: { stage: 'analyze', message: 'Mapping how the pieces fit together…' } })
      // Yield so the progress message paints before the (synchronous-ish) analysis runs.
      await new Promise((r) => setTimeout(r, 30))
      const analysis = await analyzeRepo(snapshot)
      if (controller !== ctrl) return
      set({ analysis, status: 'ready', progress: { stage: 'done', message: 'Ready!' } })
    } catch (err) {
      if (controller !== ctrl || ctrl.signal.aborted) return
      console.error(err)
      if (err instanceof GitHubError) {
        set({ status: 'error', error: { kind: err.kind, message: err.message, detail: err.detail } })
      } else {
        set({
          status: 'error',
          error: { kind: 'unknown', message: 'Something went wrong while reading this repository.', detail: err instanceof Error ? err.message : String(err) },
        })
      }
    }
  },

  getFileContent: async (path) => {
    const { snapshot } = get()
    if (!snapshot) throw new Error('No repository loaded')
    if (Object.hasOwn(snapshot.files, path)) return snapshot.files[path]
    const key = extraKey(snapshot, path)
    const hit = extraFiles.get(key)
    if (hit != null) return hit
    // Opening another repository or branch aborts this download (it belongs to the load that was current when it began).
    const ctrl = controller
    const text = await fetchFileText({
      owner: snapshot.meta.owner,
      repo: snapshot.meta.repo,
      commitSha: snapshot.commitSha,
      path,
      token: useSettings.getState().githubToken.trim() || undefined,
      isPrivate: snapshot.meta.isPrivate,
      signal: ctrl?.signal,
    })
    // A late answer for a repository or branch that is no longer open must not be remembered for the new one.
    if (get().snapshot === snapshot && controller === ctrl) extraFiles.set(key, text)
    return text
  },

  reset: () => {
    controller?.abort()
    controller = null
    extraFiles.clear()
    set({ key: null, ref: null, status: 'idle', progress: null, snapshot: null, analysis: null, error: null })
  },
}))

/** For components rendered inside a loaded repo route. Throws if used too early. */
export function useAnalysis(): RepoAnalysis {
  const analysis = useRepoStore((s) => s.analysis)
  if (!analysis) throw new Error('useAnalysis() used before the repository finished loading')
  return analysis
}

export function useSnapshot(): RepoSnapshot {
  const snapshot = useRepoStore((s) => s.snapshot)
  if (!snapshot) throw new Error('useSnapshot() used before the repository finished loading')
  return snapshot
}
