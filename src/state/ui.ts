import { create } from 'zustand'

export type SettingsSection = 'ai' | 'github' | 'preferences' | 'data'

/** Small global UI state. */
export interface UiState {
  settingsOpen: boolean
  settingsSection: SettingsSection
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  /** Mobile sidebar drawer. */
  navOpen: boolean
  setNavOpen: (open: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  settingsSection: 'ai',
  openSettings: (section = 'ai') => set({ settingsOpen: true, settingsSection: section }),
  closeSettings: () => set({ settingsOpen: false }),
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
}))
