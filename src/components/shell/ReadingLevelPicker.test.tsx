import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_READING_LEVEL, useSettings } from '@/state/settings'
import { ReadingLevelPicker } from './ReadingLevelPicker'

beforeEach(() => useSettings.setState({ anthropicApiKey: '', readingLevel: 'beginner' }))

describe('ReadingLevelPicker', () => {
  it('says plainly that it is about Claude, and that it needs a key when there is none', () => {
    render(<ReadingLevelPicker />)
    expect(screen.getByText('Claude explains for:')).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: /how technical should claude’s explanations be/i })
    expect(group).toHaveAccessibleDescription(/only changes claude’s answers\. add a claude key/i)
    expect(screen.getByRole('radio', { name: 'New' })).toHaveAttribute('title', expect.stringMatching(/add a claude key/i))
  })

  it('drops the key hint once a key is set, and still saves the choice', async () => {
    const user = userEvent.setup()
    act(() => useSettings.setState({ anthropicApiKey: 'sk-ant-1' }))
    render(<ReadingLevelPicker />)
    expect(screen.getByRole('radiogroup')).not.toHaveAccessibleDescription()
    await user.click(screen.getByRole('radio', { name: 'Developer' }))
    expect(useSettings.getState().readingLevel).toBe('expert')
  })

  it('the phone dropdown says the same', () => {
    render(<ReadingLevelPicker variant="select" />)
    const select = screen.getByRole('combobox', { name: 'Claude explains things for' })
    expect(select).toHaveAccessibleDescription(/only changes claude’s answers/i)
  })

  it('new readers start at “Totally new”', () => {
    expect(DEFAULT_READING_LEVEL).toBe('eli5')
    expect(useSettings.getInitialState().readingLevel).toBe('eli5')
  })
})
