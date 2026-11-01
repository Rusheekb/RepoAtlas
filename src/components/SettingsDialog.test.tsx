import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { stubBrowser } from '@/components/shell/testUtils'
import { useProgress } from '@/state/progress'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import { SettingsDialog } from './SettingsDialog'

// Settings loads Claude's code and the download cache on demand, straight from these modules (never the '@/ai' barrel).
const ai = vi.hoisted(() => ({ testConnection: vi.fn(), clearAiCache: vi.fn(), forgetPrivateAiData: vi.fn() }))
vi.mock('@/ai/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/ai/client')>()), testConnection: ai.testConnection }))
vi.mock('@/ai/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ai/cache')>()),
  clearAiCache: ai.clearAiCache,
  forgetPrivateAiData: ai.forgetPrivateAiData,
}))
const gh = vi.hoisted(() => ({ clearSnapshotCache: vi.fn(), forgetPrivateData: vi.fn() }))
vi.mock('@/github/snapshot', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/github/snapshot')>()), ...gh }))

beforeEach(() => {
  stubBrowser()
  ai.testConnection.mockReset()
  ai.clearAiCache.mockReset().mockResolvedValue(undefined)
  ai.forgetPrivateAiData.mockReset().mockResolvedValue(undefined)
  gh.clearSnapshotCache.mockReset().mockResolvedValue(undefined)
  gh.forgetPrivateData.mockReset().mockResolvedValue([])
  useSettings.setState({
    anthropicApiKey: '',
    githubToken: '',
    rememberKeys: false,
    model: 'claude-opus-5-5',
    readingLevel: 'beginner',
    contextSize: 'medium',
    analysisDepth: 'standard',
    theme: 'system',
  })
  useUi.setState({ settingsOpen: false, settingsSection: 'ai' })
})

function open(section: 'ai' | 'github' | 'preferences' | 'data' = 'ai') {
  render(<SettingsDialog />)
  act(() => useUi.getState().openSettings(section))
}

describe('SettingsDialog', () => {
  it('renders nothing visible until opened, then the requested section', () => {
    render(<SettingsDialog />)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    act(() => useUi.getState().openSettings('github'))
    expect(screen.getByRole('tab', { name: /github/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('settings-github')).toBeInTheDocument()
  })

  it('saves the Claude key, model and context size as you go', async () => {
    const user = userEvent.setup()
    open('ai')
    const key = screen.getByLabelText('Claude API key')
    expect(key).toHaveAttribute('type', 'password')
    await user.type(key, ' sk-ant-abc123 ')
    expect(useSettings.getState().anthropicApiKey).toBe('sk-ant-abc123')

    await user.click(screen.getByRole('button', { name: /show claude api key/i }))
    expect(key).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('radio', { name: /claude sonnet 5\.5/i }))
    expect(useSettings.getState().model).toBe('claude-sonnet-5-5')
    await user.click(screen.getByRole('radio', { name: /thorough/i }))
    expect(useSettings.getState().contextSize).toBe('large')
  })

  it('marks Opus as recommended and links to the Anthropic console', () => {
    open('ai')
    expect(within(screen.getByRole('radio', { name: /claude opus 5\.5/i }).closest('label')!).getByText(/recommended/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /console\.anthropic\.com/i })).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys')
  })

  it('tests the key and shows the result', async () => {
    const user = userEvent.setup()
    ai.testConnection.mockResolvedValue({ ok: true, message: 'Connected! Claude Opus 5.5 is ready to explain code.' })
    useSettings.setState({ anthropicApiKey: 'sk-ant-xyz' })
    open('ai')
    await user.click(screen.getByRole('button', { name: /test key/i }))
    expect(await screen.findByText(/connected!/i)).toBeInTheDocument()
    expect(ai.testConnection).toHaveBeenCalledWith('sk-ant-xyz', 'claude-opus-5-5')
  })

  it('says so kindly when Claude’s code can’t be loaded for the test', async () => {
    const user = userEvent.setup()
    ai.testConnection.mockRejectedValue(new Error('Failed to fetch dynamically imported module'))
    useSettings.setState({ anthropicApiKey: 'sk-ant-xyz' })
    open('ai')
    await user.click(screen.getByRole('button', { name: /test key/i }))
    expect(await screen.findByText(/couldn’t reach claude just now/i)).toBeInTheDocument()
  })

  it('gives honest prices', () => {
    open('ai')
    const cost = screen.getByText(/what does it cost/i).closest('div')!.parentElement!
    expect(cost).toHaveTextContent(/about 40¢/)
    expect(cost).toHaveTextContent(/5–10¢/)
  })

  it('saves the GitHub token and links to the token page', async () => {
    const user = userEvent.setup()
    open('github')
    await user.type(screen.getByLabelText('GitHub token'), 'github_pat_123')
    expect(useSettings.getState().githubToken).toBe('github_pat_123')
    expect(screen.getByRole('link', { name: /new token/i })).toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens/new')
  })

  it('saves preferences', async () => {
    const user = userEvent.setup()
    open('preferences')
    await user.click(screen.getByRole('radio', { name: /totally new/i }))
    await user.click(screen.getByRole('radio', { name: /^dark$/i }))
    await user.click(screen.getByRole('radio', { name: /deep/i }))
    expect(useSettings.getState()).toMatchObject({ readingLevel: 'eli5', theme: 'dark', analysisDepth: 'deep' })
  })

  it('switches sections with the arrow keys', async () => {
    const user = userEvent.setup()
    open('ai')
    screen.getByRole('tab', { name: /claude ai/i }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('tab', { name: /github/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /github/i })).toHaveFocus()
  })

  it('remembers keys only when asked, and clears saved data after confirming', async () => {
    const user = userEvent.setup()
    useProgress.setState({ seen: { 'a/b': { 'module:x': 1 } }, recent: [{ fullName: 'a/b', description: null, openedAt: 1 }] })
    open('data')
    const toggle = screen.getByRole('switch', { name: /remember my keys/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(useSettings.getState().rememberKeys).toBe(true)

    await user.click(screen.getByRole('button', { name: /clear saved data/i }))
    expect(gh.clearSnapshotCache).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /yes, clear it/i }))
    await waitFor(() => expect(screen.getByText(/all clear/i)).toBeInTheDocument())
    expect(gh.clearSnapshotCache).toHaveBeenCalled()
    expect(ai.clearAiCache).toHaveBeenCalled()
    expect(useProgress.getState()).toMatchObject({ seen: {}, recent: [] })
  })

  it('warns that remembered keys are stored in plain text, readable by other pages on the same address', async () => {
    const user = userEvent.setup()
    open('data')
    const toggle = screen.getByRole('switch', { name: /remember my keys/i })
    expect(toggle).toHaveAccessibleDescription(/plain text in this browser.*other pages on this same web address/i)
    await user.click(toggle)
    expect(toggle).toHaveAccessibleDescription(/stored in plain text.*other pages on this same web address can read them/i)
  })

  it('forgets private projects with the keys: downloads, Claude’s answers, Recent entries and progress', async () => {
    const user = userEvent.setup()
    gh.forgetPrivateData.mockResolvedValue(['corp/old-secret'])
    useSettings.setState({ anthropicApiKey: 'sk-ant-1', githubToken: 'ghp_1', rememberKeys: true })
    useProgress.setState({
      seen: { 'corp/secret': { 'file:src/keys.py': 1 }, 'corp/old-secret': { 'module:x': 1 }, 'pallets/flask': { 'module:src': 1 } },
      recent: [
        { fullName: 'corp/secret', description: null, openedAt: 3, isPrivate: true },
        { fullName: 'corp/old-secret', description: null, openedAt: 2 },
        { fullName: 'pallets/flask', description: null, openedAt: 1 },
      ],
    })
    open('data')
    await user.click(screen.getByRole('button', { name: /forget my keys now/i }))
    expect(useSettings.getState()).toMatchObject({ anthropicApiKey: '', githubToken: '' })
    await waitFor(() => expect(ai.forgetPrivateAiData).toHaveBeenCalled())
    expect(gh.forgetPrivateData).toHaveBeenCalled()
    expect(ai.forgetPrivateAiData.mock.calls[0][0].repos.sort()).toEqual(['corp/old-secret', 'corp/secret'])
    expect(useProgress.getState().recent.map((r) => r.fullName)).toEqual(['pallets/flask'])
    expect(Object.keys(useProgress.getState().seen)).toEqual(['pallets/flask'])
  })

  it('forgets private projects when “Remember my keys” is turned off (not when it is turned on)', async () => {
    const user = userEvent.setup()
    useProgress.setState({ seen: {}, recent: [{ fullName: 'corp/secret', description: null, openedAt: 1, isPrivate: true }] })
    open('data')
    const toggle = screen.getByRole('switch', { name: /remember my keys/i })
    await user.click(toggle)
    expect(gh.forgetPrivateData).not.toHaveBeenCalled()
    await user.click(toggle)
    await waitFor(() => expect(gh.forgetPrivateData).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useProgress.getState().recent).toEqual([]))
  })

  it('closes with Done', async () => {
    const user = userEvent.setup()
    open('ai')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(useUi.getState().settingsOpen).toBe(false)
  })
})
