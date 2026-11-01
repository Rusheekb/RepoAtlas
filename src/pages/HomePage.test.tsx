import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { checkRepoInput } from '@/components/shell/repoInput'
import { renderAt, stubBrowser } from '@/components/shell/testUtils'
import { useProgress } from '@/state/progress'
import { useUi } from '@/state/ui'
import HomePage from './HomePage'

beforeEach(() => {
  stubBrowser()
  useProgress.setState({ seen: {}, recent: [] })
  useUi.setState({ settingsOpen: false, settingsSection: 'ai' })
})

function input() {
  return screen.getByRole('textbox', { name: /github project link/i })
}

describe('HomePage', () => {
  it('shows the name, tagline and examples', () => {
    renderAt(<HomePage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('See how any GitHub project works — explained visually, in plain English.')
    expect(screen.getAllByText('RepoAtlas').length).toBeGreaterThan(0)
    for (const name of ['Express', 'Flask', 'Gin', 'HTTPie', 'Excalidraw', 'RepoAtlas itself']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('explains what is wrong with invalid input and does not navigate', async () => {
    const user = userEvent.setup()
    renderAt(<HomePage />)
    await user.click(screen.getByRole('button', { name: /explore/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/paste a link to a github project first/i)

    await user.type(input(), 'not a repo !!{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn’t look like a GitHub project link/i)
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()

    // Typing again clears the error.
    await user.type(input(), 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('navigates to the repository (keeping a branch from the link)', async () => {
    const user = userEvent.setup()
    renderAt(<HomePage />)
    await user.type(input(), 'https://github.com/pallets/flask/tree/stable')
    expect(screen.getByText(/ready to open/i)).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('location')).toHaveTextContent('/gh/pallets/flask?ref=stable')
  })

  it('opens an example', async () => {
    const user = userEvent.setup()
    renderAt(<HomePage />)
    await user.click(screen.getByRole('link', { name: /gin.*a fast web framework in go/i }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/gh/gin-gonic/gin')
  })

  it('lists recent projects and lets you remove one', async () => {
    const user = userEvent.setup()
    useProgress.setState({ recent: [{ fullName: 'pallets/flask', description: 'Web framework', openedAt: Date.now() }] })
    renderAt(<HomePage />)
    const section = screen.getByRole('region', { name: /pick up where you left off/i })
    expect(within(section).getByText('pallets/flask')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: /remove pallets\/flask/i }))
    expect(useProgress.getState().recent).toHaveLength(0)
  })

  it('opens Settings from the Claude callout', async () => {
    const user = userEvent.setup()
    renderAt(<HomePage />)
    await user.click(screen.getByRole('button', { name: /add your claude api key/i }))
    expect(useUi.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'ai' })
  })
})

describe('checkRepoInput', () => {
  it('accepts the usual forms', () => {
    expect(checkRepoInput('pallets/flask')).toEqual({ ok: true, ref: { owner: 'pallets', repo: 'flask' } })
    expect(checkRepoInput('  github.com/expressjs/express  ')).toMatchObject({ ok: true, ref: { owner: 'expressjs', repo: 'express' } })
  })

  it('gives specific, friendly reasons', () => {
    expect(checkRepoInput('')).toMatchObject({ ok: false, message: expect.stringMatching(/paste a link/i) })
    expect(checkRepoInput('https://gitlab.com/a/b')).toMatchObject({ ok: false, message: expect.stringMatching(/only works with projects on GitHub/i) })
    expect(checkRepoInput('https://github.com/pallets')).toMatchObject({ ok: false, message: expect.stringMatching(/not to a specific project/i) })
    expect(checkRepoInput('flask')).toMatchObject({ ok: false, message: expect.stringMatching(/owner and the project name/i) })
  })
})
