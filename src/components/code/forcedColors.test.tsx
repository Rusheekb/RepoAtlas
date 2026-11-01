import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Composer } from '@/components/views/reading/Composer'
import { CodeViewer } from './CodeViewer'

vi.mock('./highlighter', () => ({ highlightLines: () => new Promise(() => {}) }))

/**
 * Windows High Contrast (forced colors) removes box-shadow rings and forces border colors. Where a ring replaces the
 * browser's focus outline, the outline must be hidden with `outline-hidden` (which turns back into a real outline in
 * forced colors), never `outline-none`, or keyboard users there lose sight of where they are.
 */
describe('focus indicators in forced-colors mode', () => {
  it('the code viewer hides its outline with outline-hidden, not outline-none', () => {
    render(<CodeViewer path="a.py" code={'print(1)\n'} language="Python" />)
    const region = screen.getByTestId('code-viewer')
    expect(region.className).toMatch(/focus-visible:outline-hidden/)
    expect(region.className).not.toMatch(/(^|\s)outline-none/)
  })

  it('the question box keeps an outline in forced colors', () => {
    render(<Composer value="" onChange={() => {}} onSubmit={() => {}} />)
    const box = screen.getByRole('textbox', { name: 'Your question' })
    expect(box.className).toMatch(/focus-visible:outline-hidden/)
    expect(box.className).not.toMatch(/outline-none/)
    const css = readFileSync(join(__dirname, '../views/reading/reading.css'), 'utf8')
    expect(css).toMatch(/@media not \(forced-colors: active\)\s*\{\s*\.atlas-composer textarea:focus-visible \{ outline: none; \}/)
  })
})
