import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { stubBrowser } from '@/components/shell/testUtils'
import { useExplain } from '@/state/explain'
import { GlossaryText, placePopover, segmentGlossaryText, Term } from './Glossary'

beforeEach(() => {
  stubBrowser()
  useExplain.setState({ target: null, history: [] })
})

describe('GlossaryText', () => {
  it('links the first mention of each glossary term only', () => {
    render(<GlossaryText text="An API is a menu. Every API has rules, and a framework helps." />)
    const terms = screen.getAllByRole('button')
    expect(terms.map((t) => t.textContent)).toEqual(['API', 'framework'])
    expect(screen.getByText(/is a menu\. Every API has rules/)).toBeInTheDocument()
  })

  it('renders backticked code and never links inside it', () => {
    const { container } = render(<GlossaryText text="Open `api.ts` to see the API." />)
    expect(container.querySelector('code')).toHaveTextContent('api.ts')
    expect(screen.getByRole('button')).toHaveTextContent('API')
  })

  it('keeps plain text intact', () => {
    const { container } = render(<GlossaryText text="Nothing technical here at all." />)
    expect(container).toHaveTextContent('Nothing technical here at all.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('respects "only" and "max"', () => {
    const only = segmentGlossaryText('An API and a framework.', { only: ['framework'] }).filter((s) => s.kind === 'term')
    expect(only.map((s) => s.termId)).toEqual(['framework'])
    const capped = segmentGlossaryText('An API and a framework.', { max: 1 }).filter((s) => s.kind === 'term')
    expect(capped).toHaveLength(1)
  })
})

describe('Term', () => {
  it('shows a popover on focus with the definition, and Escape closes it', async () => {
    const user = userEvent.setup()
    render(
      <p>
        Uses an <Term id="api">API</Term> to talk.
      </p>,
    )
    const trigger = screen.getByRole('button', { name: 'API' })
    await user.tab()
    expect(trigger).toHaveFocus()
    const pop = screen.getByRole('group', { name: /what “API” means/i })
    expect(pop).toHaveTextContent(/agreed way for one program to ask another/i)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAccessibleDescription(/agreed way for one program/i)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /what “API” means/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('shows on hover and "Learn more" opens the explain panel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Term id="api">API</Term>)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'API' }))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    await user.click(screen.getByRole('button', { name: /learn more/i }))
    expect(useExplain.getState().target).toEqual({ type: 'term', id: 'api' })
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('keyboard activation moves focus to "Learn more"', async () => {
    const user = userEvent.setup()
    render(<Term id="api">API</Term>)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /learn more/i })).toHaveFocus()
  })

  it('renders plain children for unknown terms', () => {
    render(<Term id="definitely-not-a-term">thing</Term>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('thing')).toBeInTheDocument()
  })
})

describe('placePopover', () => {
  const rect = (left: number, top: number, width = 40, height = 20) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  it('sits below and stays inside the viewport', () => {
    expect(placePopover(rect(5, 100), 150, { width: 1000, height: 800 })).toMatchObject({ placement: 'below', left: 8, top: 128 })
    const right = placePopover(rect(980, 100), 150, { width: 1000, height: 800 })
    expect(right.left + right.width).toBeLessThanOrEqual(992)
  })

  it('flips above when there is no room below', () => {
    expect(placePopover(rect(100, 700), 150, { width: 1000, height: 800 })).toMatchObject({ placement: 'above', top: 542 })
  })

  it('narrows on small screens', () => {
    expect(placePopover(rect(10, 10), 100, { width: 300, height: 600 }).width).toBe(284)
  })
})
