import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { CodeTokenLine } from './highlighter'
import { CodeViewer, MAX_HIGHLIGHT_LINES, splitLines, VIRTUALIZE_FROM } from './CodeViewer'

const highlightLines = vi.fn<(lines: readonly string[], id: string) => Promise<CodeTokenLine[]>>()

vi.mock('./highlighter', () => ({
  highlightLines: (lines: readonly string[], id: string, opts?: { onProgress?: (done: CodeTokenLine[]) => void }) =>
    highlightLines(lines, id).then((tokens) => {
      opts?.onProgress?.(tokens)
      return tokens
    }),
}))

const CODE = ['import os', '', 'def main():', '    print("hi")', '', 'main()', ''].join('\n')

function gutter(n: number) {
  const el = document.querySelector(`[data-gutter="${n}"]`)
  if (!el) throw new Error(`no line ${n}`)
  return el
}

function selectedLines() {
  return [...document.querySelectorAll('[data-selected]')].map((el) => Number((el as HTMLElement).dataset.line))
}

/** A parent that keeps the selection, like the real pages do. */
function Controlled({ onChange, initial = null }: { onChange?: (r: { start: number; end: number } | null) => void; initial?: { start: number; end: number } | null }) {
  const [range, setRange] = useState(initial)
  return (
    <CodeViewer
      path="src/main.py"
      code={CODE}
      language="Python"
      highlight={range}
      onSelectLines={(r) => {
        setRange(r)
        onChange?.(r)
      }}
    />
  )
}

beforeEach(() => {
  highlightLines.mockReset()
  highlightLines.mockImplementation((lines) => Promise.resolve(lines.map((l) => [{ content: l, light: '#111111', dark: '#eeeeee' }])))
  Element.prototype.scrollIntoView = vi.fn()
})

describe('splitLines', () => {
  it('normalizes line endings and drops the empty line after a final newline', () => {
    expect(splitLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c'])
    expect(splitLines('')).toEqual([''])
    expect(splitLines('one')).toEqual(['one'])
  })
})

describe('CodeViewer', () => {
  it('numbers every line, shows plain text first, then the colored version', async () => {
    let resolve: (t: CodeTokenLine[]) => void = () => {}
    highlightLines.mockImplementation(() => new Promise((r) => (resolve = r)))
    render(<CodeViewer path="src/main.py" code={CODE} language="Python" />)
    const viewer = screen.getByTestId('code-viewer')
    expect(viewer).toHaveAttribute('data-highlighted', 'false')
    expect(viewer).toHaveTextContent('def main():')
    expect(document.querySelectorAll('[data-gutter]')).toHaveLength(6)
    expect(gutter(1)).toHaveTextContent('1')
    expect(gutter(6)).toHaveTextContent('6')
    expect(highlightLines).toHaveBeenCalledWith(splitLines(CODE), 'python')

    await act(async () => resolve(splitLines(CODE).map((l) => [{ content: l, light: '#d73a49', dark: '#f97583' }])))
    expect(viewer).toHaveAttribute('data-highlighted', 'true')
    const token = viewer.querySelector('[data-line="3"] .shiki span') as HTMLElement
    expect(token).toHaveTextContent('def main():')
    expect(token.style.getPropertyValue('--shiki-light')).toBe('#d73a49')
    expect(token.style.getPropertyValue('--shiki-dark')).toBe('#f97583')
    expect(viewer.querySelector('.shiki')).not.toBeNull()
  })

  it('starts numbering at firstLineNumber for excerpts', () => {
    render(<CodeViewer path="a.py" code={'x = 1\ny = 2\nz = 3'} language="Python" firstLineNumber={40} highlight={{ start: 41, end: 41 }} maxHeight={200} />)
    expect(gutter(40)).toBeInTheDocument()
    expect(gutter(42)).toBeInTheDocument()
    expect(document.querySelector('[data-gutter="1"]')).toBeNull()
    expect(selectedLines()).toEqual([41])
    expect(screen.getByTestId('code-viewer')).toHaveStyle({ maxHeight: '200px' })
  })

  it('stays plain for unknown languages and very long files', () => {
    render(<CodeViewer path="notes.unknownext" code="hello" language={null} />)
    expect(highlightLines).not.toHaveBeenCalled()
    const long = Array.from({ length: MAX_HIGHLIGHT_LINES + 1 }, (_, i) => `line ${i}`).join('\n')
    render(<CodeViewer path="big.py" code={long} language="Python" />)
    expect(highlightLines).not.toHaveBeenCalled()
  })

  it('selects a line on click, extends with shift-click, and clears on a second click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    await user.click(gutter(2))
    expect(onChange).toHaveBeenLastCalledWith({ start: 2, end: 2 })
    expect(selectedLines()).toEqual([2])

    await user.keyboard('{Shift>}')
    await user.click(gutter(5))
    await user.keyboard('{/Shift}')
    expect(onChange).toHaveBeenLastCalledWith({ start: 2, end: 5 })
    expect(selectedLines()).toEqual([2, 3, 4, 5])
    expect(screen.getByRole('status')).toHaveTextContent('Lines 2 to 5 selected.')

    await user.click(gutter(4))
    expect(onChange).toHaveBeenLastCalledWith({ start: 4, end: 4 })
    await user.click(gutter(4))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(selectedLines()).toEqual([])
  })

  it('extends the selection from the keyboard and clears it with Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} initial={{ start: 3, end: 3 }} />)
    act(() => screen.getByRole('region', { name: 'Code of main.py' }).focus())
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}')
    expect(onChange).toHaveBeenLastCalledWith({ start: 3, end: 5 })
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('picks a range with taps on touch screens', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    const tap = (n: number) => {
      fireEvent.pointerDown(gutter(n), { pointerType: 'touch' })
      fireEvent.mouseDown(gutter(n))
      fireEvent.click(gutter(n))
    }
    tap(2)
    expect(onChange).toHaveBeenLastCalledWith({ start: 2, end: 2 })
    tap(4)
    expect(onChange).toHaveBeenLastCalledWith({ start: 2, end: 4 })
    tap(6)
    expect(onChange).toHaveBeenLastCalledWith({ start: 6, end: 6 })
    tap(6)
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('does nothing on click when the caller does not take selections', async () => {
    const user = userEvent.setup()
    render(<CodeViewer path="a.py" code={CODE} language="Python" />)
    await user.click(gutter(2))
    expect(selectedLines()).toEqual([])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('scrolls a highlight from outside into view, but not the reader’s own clicks', async () => {
    const user = userEvent.setup()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { rerender } = render(<CodeViewer path="a.py" code={CODE} language="Python" highlight={{ start: 3, end: 3 }} />)
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    // Same range, new scrollKey: scroll again.
    rerender(<CodeViewer path="a.py" code={CODE} language="Python" highlight={{ start: 3, end: 3 }} scrollKey={1} />)
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2))
    scroll.mockClear()
    render(<Controlled />)
    await user.click(gutter(5))
    expect(scroll).not.toHaveBeenCalled()
  })

  it('only puts the visible rows on the page for very long files', () => {
    const long = Array.from({ length: VIRTUALIZE_FROM + 500 }, (_, i) => `value_${i} = ${i}`).join('\n')
    render(<CodeViewer path="big.py" code={long} language="Python" maxHeight={400} />)
    const rows = document.querySelectorAll('[data-gutter]').length
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThan(300)
  })
})
