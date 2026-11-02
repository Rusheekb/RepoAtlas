import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { makeFixture } from '@/ai/testFixtures'
import { LocationProbe, stubBrowser } from '@/components/shell/testUtils'
import { markdownPreview } from '@/components/shell/text'
import { makeReadmeResolver } from '@/components/shell/urls'
import type { RepoAnalysis } from '@/core/types'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import GlossaryPage from './GlossaryPage'
import OverviewPage from './OverviewPage'
import { Markdown } from '@/components/ui'
import RepoLayout, { focusViewHeading, viewFromPath } from './RepoLayout'

let analysis: RepoAnalysis
const load = vi.fn()

function richAnalysis(): RepoAnalysis {
  const a = makeFixture().analysis
  a.overview = '## What is this?\n\nA tiny shop. It starts in `src/main.tsx`.'
  a.learningPath = [
    { id: 'readme', title: 'Read the welcome note', description: 'Start here.', target: { type: 'readme' }, minutes: 2 },
    { id: 'map', title: 'Look at the map', description: 'See the parts.', target: { type: 'view', view: 'map' }, minutes: 4 },
    { id: 'module:src', title: 'Explore the app', description: 'The heart.', target: { type: 'module', id: 'src' }, minutes: 5 },
  ]
  a.warnings = ['We only read part of this project.']
  return a
}

function renderRepo(path: string, page: React.ReactNode = <OverviewPage />) {
  const router = createMemoryRouter(
    [
      {
        path: '/gh/:owner/:repo',
        element: <RepoLayout />,
        children: [
          { index: true, element: page },
          { path: 'glossary', element: <GlossaryPage /> },
          { path: '*', element: <LocationProbe /> },
        ],
      },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

beforeEach(() => {
  stubBrowser()
  analysis = richAnalysis()
  load.mockReset()
  useRepoStore.setState({ key: 'acme/shop', ref: { owner: 'acme', repo: 'shop' }, status: 'ready', analysis, snapshot: makeFixture().snapshot, error: null, progress: null, load })
  useExplain.setState({ target: null, history: [] })
  useProgress.setState({ seen: {}, recent: [] })
  useUi.setState({ settingsOpen: false, settingsSection: 'ai', navOpen: false })
  useSettings.setState({ anthropicApiKey: '', seenIntro: false })
})

describe('RepoLayout', () => {
  it('loads the repository from the URL (with ?ref)', () => {
    useRepoStore.setState({ key: null, status: 'idle', analysis: null })
    renderRepo('/gh/pallets/flask?ref=stable')
    expect(load).toHaveBeenCalledWith({ owner: 'pallets', repo: 'flask', ref: 'stable' })
    expect(screen.getByText(/getting to know/i)).toHaveTextContent('pallets/flask@stable')
  })

  it('shows a friendly error with the right actions', async () => {
    const user = userEvent.setup()
    useRepoStore.setState({ key: 'nobody/missing', status: 'error', analysis: null, error: { kind: 'not-found', message: 'We couldn’t find it.', detail: '404' } })
    renderRepo('/gh/nobody/missing')
    expect(screen.getByRole('heading', { name: /couldn’t find that project/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add a github token/i }))
    expect(useUi.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'github' })
    act(() => useUi.getState().closeSettings())
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(load).toHaveBeenLastCalledWith({ owner: 'nobody', repo: 'missing', ref: undefined }, { force: true })
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })

  it('retries automatically after a GitHub token is added from the error screen', () => {
    useRepoStore.setState({ key: 'nobody/missing', status: 'error', analysis: null, error: { kind: 'rate-limited', message: 'Slow down.' } })
    renderRepo('/gh/nobody/missing')
    load.mockClear()
    act(() => useUi.getState().openSettings('github'))
    act(() => useSettings.setState({ githubToken: 'github_pat_x' }))
    expect(load).not.toHaveBeenCalled()
    act(() => useUi.getState().closeSettings())
    expect(load).toHaveBeenCalledWith({ owner: 'nobody', repo: 'missing', ref: undefined }, { force: true })
    useSettings.setState({ githubToken: '' })
  })

  it('frames a ready repository: header, views, recent list and title', () => {
    renderRepo('/gh/acme/shop')
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: /the big picture/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(useProgress.getState().recent[0]).toMatchObject({ fullName: 'acme/shop', description: 'A tiny online shop' })
    expect(document.title).toBe('The big picture · acme/shop · RepoAtlas')
  })

  it('names each view in the tab title and moves focus to its heading when the reader switches views', async () => {
    const { router } = renderRepo('/gh/acme/shop')
    // The first view after loading leaves focus alone.
    expect(document.activeElement).toBe(document.body)
    expect(document.title).toBe('The big picture · acme/shop · RepoAtlas')
    await act(() => router.navigate('/gh/acme/shop/glossary'))
    expect(document.title).toBe('Glossary · acme/shop · RepoAtlas')
    expect(screen.getByRole('heading', { level: 1, name: /glossary/i })).toHaveFocus()
    // Only the query changed (same view): focus stays where the reader put it.
    const search = screen.getByRole('searchbox')
    search.focus()
    await act(() => router.navigate('/gh/acme/shop/glossary?from=sidebar'))
    expect(search).toHaveFocus()
  })

  it('lets Claude’s answers show pictures from this repository only', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/gh/:owner/:repo',
          element: <RepoLayout />,
          children: [{ index: true, element: <Markdown>{'![a](https://raw.githubusercontent.com/acme/shop/main/a.png) ![b](https://evil.example/b.png)'}</Markdown> }],
        },
      ],
      { initialEntries: ['/gh/acme/shop'] },
    )
    render(<RouterProvider router={router} />)
    const imgs = screen.getByRole('main').querySelectorAll('img')
    expect([...imgs].map((i) => i.getAttribute('src'))).toEqual(['https://raw.githubusercontent.com/acme/shop/main/a.png'])
    expect(screen.getByRole('link', { name: /picture: b \(on evil\.example\)/i })).toBeInTheDocument()
  })

  it('works out the view from the path', () => {
    expect(viewFromPath('/gh/a/b')).toBe('overview')
    expect(viewFromPath('/gh/a/b/map')).toBe('map')
    expect(viewFromPath('/gh/a/b/nonsense')).toBe('overview')
  })
})

describe('OverviewPage', () => {
  it('shows the big picture sections', () => {
    renderRepo('/gh/acme/shop')
    expect(screen.getByRole('heading', { level: 1, name: /acme/ })).toHaveTextContent('acme / shop')
    for (const name of ['In plain English', 'Your learning path', 'What it’s built with', 'What the code is made of', 'The main parts', 'Where it starts', 'The welcome note']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText('We only read part of this project.')).toBeInTheDocument()
    expect(screen.getByText('“A tiny online shop”')).toBeInTheDocument()
  })

  it('has the "Explain this project in depth" button when a key is set', () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    renderRepo('/gh/acme/shop')
    expect(screen.getByRole('button', { name: 'Explain this project in depth' })).toBeInTheDocument()
    useSettings.setState({ anthropicApiKey: '' })
  })

  it('opens files mentioned in the overview and parts from their cards', async () => {
    const user = userEvent.setup()
    renderRepo('/gh/acme/shop')
    await user.click(screen.getAllByRole('button', { name: 'src/main.tsx' })[0])
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/main.tsx' })
    const parts = screen.getByRole('region', { name: 'The main parts' })
    await user.click(within(parts).getByRole('button', { name: /components/ }))
    expect(useExplain.getState().target).toEqual({ type: 'module', id: 'src/components' })
  })

  it('follows learning-path steps and ticks them off', async () => {
    const user = userEvent.setup()
    renderRepo('/gh/acme/shop')
    const path = screen.getByRole('list', { name: /learning path steps/i })
    await user.click(within(path).getByRole('button', { name: /explore the app/i }))
    expect(useExplain.getState().target).toEqual({ type: 'module', id: 'src' })
    expect(useProgress.getState().isSeen('acme/shop', 'step:module:src')).toBe(true)
    expect(screen.getByText(/1 of 3 steps done/i)).toBeInTheDocument()

    await user.click(within(path).getByRole('button', { name: /look at the map/i }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/gh/acme/shop/map')
    expect(useProgress.getState().isSeen('acme/shop', 'step:map')).toBe(true)
  })

  it('the welcome note can be dismissed', async () => {
    const user = userEvent.setup()
    renderRepo('/gh/acme/shop')
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(useSettings.getState().seenIntro).toBe(true)
  })
})

describe('GlossaryPage', () => {
  it('lists this project’s words first and filters by search', async () => {
    const user = userEvent.setup()
    renderRepo('/gh/acme/shop/glossary')
    const project = screen.getByRole('region', { name: /words you’ll meet in this project/i })
    expect(within(project).getByRole('button', { name: /component/i })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /search the glossary/i }), 'zzzzqqq')
    expect(screen.getByText('No words match')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show all words/i }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('filters by topic', async () => {
    const user = userEvent.setup()
    renderRepo('/gh/acme/shop/glossary')
    await user.click(screen.getByRole('button', { name: /^security/i }))
    const cards = screen.getAllByRole('article')
    expect(cards.length).toBeGreaterThan(3)
    for (const c of cards) expect(c).toHaveTextContent('Security')
  })

  it('?term= highlights and focuses that word', () => {
    renderRepo('/gh/acme/shop/glossary?term=api')
    const card = document.getElementById('term-api')!
    expect(card).toHaveAttribute('data-highlighted', 'true')
    expect(card).toHaveFocus()
    expect(card.scrollIntoView).toHaveBeenCalled()
  })

  it('related words jump within the page and "How is it used" opens the panel', async () => {
    const user = userEvent.setup()
    const { router } = renderRepo('/gh/acme/shop/glossary?term=api')
    const card = document.getElementById('term-api')!
    await user.click(within(card).getByRole('button', { name: 'REST' }))
    expect(router.state.location.search).toBe('?term=rest')
    expect(document.getElementById('term-rest')).toHaveAttribute('data-highlighted', 'true')
    await user.click(within(card).getByRole('button', { name: /how is it used in this project/i }))
    expect(useExplain.getState().target).toEqual({ type: 'term', id: 'api' })
  })
})

describe('README helpers', () => {
  it('previews long markdown at a paragraph break, never inside a code block', () => {
    const md = ['# Title', '', 'a'.repeat(300), '', '```', 'code', '', 'more code', '```', '', 'b'.repeat(300), '', 'c'.repeat(300)].join('\n')
    const { text, truncated } = markdownPreview(md, 400)
    expect(truncated).toBe(true)
    expect(text.split('```').length % 2).toBe(1)
    expect(markdownPreview('short', 400)).toEqual({ text: 'short', truncated: false })
  })

  it('resolves README images to raw files and links to GitHub, relative to the README folder', () => {
    const resolve = makeReadmeResolver({ owner: 'o', repo: 'r', sha: 'abc', readmePath: 'docs/README.md' })
    expect(resolve('img/logo.png', 'image')).toBe('https://raw.githubusercontent.com/o/r/abc/docs/img/logo.png')
    expect(resolve('../CONTRIBUTING.md', 'link')).toBe('https://github.com/o/r/blob/abc/CONTRIBUTING.md')
    expect(resolve('javascript:alert(1)', 'link')).toBeNull()
    expect(resolve('https://example.com/x', 'link')).toBe('https://example.com/x')
  })
})

describe('focusViewHeading', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('waits for a view that is still loading, then focuses its heading', async () => {
    const main = document.createElement('main')
    document.body.append(main)
    const stop = focusViewHeading(main)
    const h1 = document.createElement('h1')
    h1.textContent = 'How it connects'
    main.append(h1)
    await new Promise((r) => setTimeout(r, 0))
    expect(h1).toHaveFocus()
    expect(h1).toHaveAttribute('tabindex', '-1')
    stop()
  })

  it('leaves focus alone when it moved into a dialog (like the explain panel) meanwhile', async () => {
    const main = document.createElement('main')
    const panel = document.createElement('div')
    panel.setAttribute('role', 'dialog')
    const close = document.createElement('button')
    panel.append(close)
    document.body.append(main, panel)
    close.focus()
    focusViewHeading(main)
    main.append(document.createElement('h1'))
    await new Promise((r) => setTimeout(r, 0))
    expect(close).toHaveFocus()
  })

  it('gives up after a while', async () => {
    vi.useFakeTimers()
    const main = document.createElement('main')
    document.body.append(main)
    focusViewHeading(main, 100)
    vi.advanceTimersByTime(150)
    const h1 = document.createElement('h1')
    h1.tabIndex = -1
    main.append(h1)
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 0))
    expect(h1).not.toHaveFocus()
  })
})
