import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from './Segmented'

type Level = 'new' | 'beginner' | 'familiar' | 'developer'

function Harness({ initial = 'beginner' as Level, onChange }: { initial?: Level; onChange?: (v: Level) => void }) {
  const [value, setValue] = useState<Level>(initial)
  return (
    <>
      <button type="button">before</button>
      <Segmented<Level>
        label="Reading level"
        describedBy="help"
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
        options={(['new', 'beginner', 'familiar', 'developer'] as const).map((v) => ({ value: v, label: v }))}
      />
      <span id="help">Only changes Claude’s answers.</span>
      <button type="button">after</button>
    </>
  )
}

describe('Segmented', () => {
  it('is one Tab stop: only the chosen option is reachable with Tab', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'before' }))
    await user.tab()
    expect(screen.getByRole('radio', { name: 'beginner' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1])
  })

  it('moves and chooses with the arrow keys, wrapping around, and with Home / End', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('radio', { name: 'beginner' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'familiar' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'familiar' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'new' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'developer' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('radio', { name: 'new' })).toHaveFocus()
    await user.keyboard('{End}{ArrowUp}')
    expect(screen.getByRole('radio', { name: 'familiar' })).toHaveAttribute('aria-checked', 'true')
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['familiar', 'developer', 'new', 'developer', 'new', 'developer', 'familiar'])
  })

  it('names the group and links its help text', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Reading level' })).toHaveAccessibleDescription('Only changes Claude’s answers.')
  })
})
