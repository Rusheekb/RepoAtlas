import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_MODEL } from '@/core/labels'
import type { AnalysisDepth, ContextSize, ModelId, ReadingLevel, ThemePref } from '@/core/types'

/**
 * User settings. Persisted to localStorage under "repoatlas:settings".
 *
 * Secrets (Claude API key, GitHub token) are only written to localStorage when
 * `rememberKeys` is true; otherwise they live in sessionStorage and vanish when the tab closes.
 * They are only ever sent directly to api.anthropic.com / api.github.com.
 */
export interface SettingsState {
  anthropicApiKey: string
  githubToken: string
  rememberKeys: boolean
  model: ModelId
  readingLevel: ReadingLevel
  contextSize: ContextSize
  analysisDepth: AnalysisDepth
  theme: ThemePref
  /** Has the user dismissed the first-run welcome tips? */
  seenIntro: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

const SECRET_KEYS = ['anthropicApiKey', 'githubToken'] as const
const SESSION_SECRETS = 'repoatlas:session-secrets'

function readSessionSecrets(): Partial<Pick<SettingsState, (typeof SECRET_KEYS)[number]>> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_SECRETS) ?? '{}')
  } catch {
    return {}
  }
}

function writeSessionSecrets(s: Pick<SettingsState, (typeof SECRET_KEYS)[number]>) {
  try {
    sessionStorage.setItem(SESSION_SECRETS, JSON.stringify({ anthropicApiKey: s.anthropicApiKey, githubToken: s.githubToken }))
  } catch {
    /* storage unavailable */
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      anthropicApiKey: '',
      githubToken: '',
      rememberKeys: false,
      model: DEFAULT_MODEL,
      readingLevel: 'beginner',
      contextSize: 'medium',
      analysisDepth: 'standard',
      theme: 'system',
      seenIntro: false,
      set: (patch) =>
        set((prev) => {
          const next = { ...prev, ...patch }
          writeSessionSecrets(next)
          return patch
        }),
    }),
    {
      name: 'repoatlas:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { set: _set, ...rest } = s
        if (!s.rememberKeys) return { ...rest, anthropicApiKey: '', githubToken: '' }
        return rest
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<SettingsState>) }
        if (!merged.rememberKeys) Object.assign(merged, readSessionSecrets())
        return merged
      },
    },
  ),
)

/** Resolve the theme preference to an actual theme and apply it to <html data-theme>. */
export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121211' : '#f6f5f2')
}

export function hasClaudeKey(): boolean {
  return useSettings.getState().anthropicApiKey.trim().length > 0
}
