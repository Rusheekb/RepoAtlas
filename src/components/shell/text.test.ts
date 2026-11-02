import { stripEmoji } from './text'

describe('stripEmoji', () => {
  it('drops emoji (and the space after them) from generated labels, and nothing else', () => {
    const gear = String.fromCodePoint(0x2699, 0xfe0f)
    const check = String.fromCodePoint(0x2705)
    const coder = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb)
    expect(stripEmoji(`Explore ${gear} flask`)).toBe('Explore flask')
    expect(stripEmoji(`- ${check} **tests** — code`)).toBe('- **tests** — code')
    expect(stripEmoji(`${coder} dev`)).toBe('dev')
    expect(stripEmoji('© 2024 Acme ™, see `a.py` → b')).toBe('© 2024 Acme ™, see `a.py` → b')
  })
})
