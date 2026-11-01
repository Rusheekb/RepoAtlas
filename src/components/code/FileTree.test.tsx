import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFile } from '@/ai/testFixtures'
import { FileTree } from './FileTree'

const FILES = [
  makeFile('src/main.ts', { role: 'entry', isEntry: true, layer: 'ui' }),
  makeFile('src/App.tsx', { role: 'component', layer: 'ui' }),
  makeFile('src/state/cart.ts', { role: 'state', layer: 'data' }),
  makeFile('src/api/client.ts', { role: 'client', layer: 'api' }),
  makeFile('README.md', { role: 'docs', layer: 'docs' }),
  makeFile('package.json', { role: 'config', layer: 'config' }),
]

/** Run queued requestAnimationFrame callbacks (focus moves happen there). */
async function flushFrames() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function names() {
  return screen.getAllByRole('treeitem').map((el) => el.getAttribute('aria-label')?.split(',')[0])
}

describe('FileTree', () => {
  it('shows folders first, then files, with the folders around the selection open', () => {
    render(<FileTree files={FILES} selectedPath="src/state/cart.ts" onSelect={() => {}} />)
    expect(screen.getByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(names()).toEqual(['src', 'api', 'state', 'cart.ts', 'App.tsx', 'main.ts', 'package.json', 'README.md'])
    const cart = screen.getByRole('treeitem', { name: /^cart\.ts/ })
    expect(cart).toHaveAttribute('aria-selected', 'true')
    expect(cart).toHaveAttribute('aria-level', '3')
    expect(screen.getByRole('treeitem', { name: /^src, folder/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('treeitem', { name: /^api, folder/ })).toHaveAttribute('aria-expanded', 'false')
    // The selection is the one row reachable with Tab.
    expect(cart).toHaveAttribute('tabindex', '0')
  })

  it('labels files with their job (entry points get the rocket) and folders with their size', () => {
    render(<FileTree files={FILES} onSelect={() => {}} isSeen={(p) => p === 'README.md'} />)
    expect(screen.getByRole('treeitem', { name: 'src, folder, 4 files' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'README.md, Documentation, already read' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'package.json, Settings' })).toHaveTextContent('🎛️')
  })

  it('opens and closes folders on click and selects files', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<FileTree files={FILES} onSelect={onSelect} />)
    expect(names()).toEqual(['src', 'package.json', 'README.md'])
    await user.click(screen.getByRole('treeitem', { name: /^src, folder/ }))
    expect(names()).toContain('main.ts')
    await user.click(screen.getByRole('treeitem', { name: /^main\.ts/ }))
    expect(onSelect).toHaveBeenCalledWith('src/main.ts')
    await user.click(screen.getByRole('treeitem', { name: /^src, folder/ }))
    expect(names()).toEqual(['src', 'package.json', 'README.md'])
  })

  it('filters by the query and opens every folder holding a match', () => {
    const { rerender } = render(<FileTree files={FILES} onSelect={() => {}} query="cart" />)
    expect(names()).toEqual(['src/state', 'cart.ts'])
    expect(screen.getByText('cart', { selector: 'mark' })).toBeInTheDocument()
    rerender(<FileTree files={FILES} onSelect={() => {}} query="zzz" />)
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.getByText(/No files match/)).toHaveTextContent('No files match “zzz”')
    rerender(<FileTree files={FILES} onSelect={() => {}} query="" />)
    expect(names()).toEqual(['src', 'package.json', 'README.md'])
  })

  it('moves with the arrow keys, opens folders with Right, goes up with Left and selects with Enter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<FileTree files={FILES} onSelect={onSelect} />)
    const tree = screen.getByRole('tree')
    const src = screen.getByRole('treeitem', { name: /^src, folder/ })
    act(() => src.focus())

    await user.keyboard('{ArrowRight}')
    expect(src).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowRight}')
    await flushFrames()
    expect(screen.getByRole('treeitem', { name: /^api, folder/ })).toHaveFocus()

    await user.keyboard('{ArrowDown}{ArrowDown}')
    await flushFrames()
    expect(screen.getByRole('treeitem', { name: /^App\.tsx/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('src/App.tsx')

    await user.keyboard('{ArrowLeft}')
    await flushFrames()
    expect(src).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(src).toHaveAttribute('aria-expanded', 'false')

    await user.keyboard('{End}')
    await flushFrames()
    expect(screen.getByRole('treeitem', { name: /^README\.md/ })).toHaveFocus()
    await user.keyboard('p')
    await flushFrames()
    expect(screen.getByRole('treeitem', { name: /^package\.json/ })).toHaveFocus()
    expect(within(tree).getAllByRole('treeitem').filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('opens a folder it is asked to reveal', () => {
    render(<FileTree files={FILES} onSelect={() => {}} revealPath="src/api" />)
    expect(screen.getByRole('treeitem', { name: /^api, folder/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('treeitem', { name: /^client\.ts/ })).toBeInTheDocument()
  })

  it('only renders the rows on screen for a 10,000-file project', () => {
    const big = Array.from({ length: 10_000 }, (_, i) => makeFile(`pkg${i % 40}/file${i}.ts`))
    render(<FileTree files={big} onSelect={() => {}} selectedPath="pkg7/file7.ts" />)
    const rows = screen.getAllByRole('treeitem')
    // 40 folders + the open folder's first page of files + its "show more" row.
    expect(rows.length).toBeLessThan(300)
    expect(screen.getByRole('treeitem', { name: /Show 50 more files/ })).toBeInTheDocument()
  })
})
