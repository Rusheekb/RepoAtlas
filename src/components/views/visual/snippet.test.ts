import { excerptAround, findSnippetLine, snippetExcerpt, splitLines, squashWhitespace } from './snippet'

const FILE = [
  'import os', // 1
  '', // 2
  'def create_app():', // 3
  '    app = Flask(__name__)', // 4
  '    app.config.from_object("settings")', // 5
  '    return app', // 6
  '', // 7
  '# app = Flask(__name__) is the heart of it', // 8
  'class Request(RequestBase):', // 9
  '\tvalue  =   compute( 1,2 )', // 10
].join('\n')

describe('findSnippetLine', () => {
  it('prefers a line that is exactly the snippet (ignoring indentation)', () => {
    expect(findSnippetLine(FILE, 'app = Flask(__name__)')).toBe(4)
    expect(findSnippetLine(FILE, '    app = Flask(__name__)')).toBe(4)
  })

  it('finds a snippet that is only the start of a longer line', () => {
    expect(findSnippetLine(FILE, 'app.config.from_object(')).toBe(5)
    expect(findSnippetLine(FILE, 'class Request(')).toBe(9)
  })

  it('falls back to ignoring differences in spaces and tabs', () => {
    expect(findSnippetLine(FILE, 'value = compute( 1,2 )')).toBe(10)
    expect(findSnippetLine(FILE, 'def   create_app():')).toBe(3)
  })

  it('matches a multi-line snippet by its first non-blank line', () => {
    expect(findSnippetLine(FILE, '\n  def create_app():\n    app = Flask(__name__)')).toBe(3)
  })

  it('returns null when the snippet is missing, empty or too short to mean anything', () => {
    expect(findSnippetLine(FILE, 'this is not in the file')).toBeNull()
    expect(findSnippetLine(FILE, '')).toBeNull()
    expect(findSnippetLine(FILE, '   \n  ')).toBeNull()
    expect(findSnippetLine(FILE, null)).toBeNull()
    expect(findSnippetLine(FILE, ')')).toBeNull()
    expect(findSnippetLine('', 'import os')).toBeNull()
  })

  it('handles Windows line endings', () => {
    expect(findSnippetLine('a = 1\r\nb = 2\r\nc = 3\r\n', 'b = 2')).toBe(2)
  })
})

describe('excerptAround', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')

  it('cuts six lines either side of the found line, with real line numbers', () => {
    const e = excerptAround(lines, 20)
    expect(e).toMatchObject({ start: 14, end: 26, line: 20, totalLines: 40 })
    expect(e.code.split('\n')).toHaveLength(13)
    expect(e.code.split('\n')[0]).toBe('line 14')
  })

  it('clamps at the start and end of the file', () => {
    expect(excerptAround(lines, 2)).toMatchObject({ start: 1, end: 8 })
    expect(excerptAround(lines, 39)).toMatchObject({ start: 33, end: 40 })
  })

  it('shows the top of the file when there is no line to centre on', () => {
    const e = excerptAround(lines, null)
    expect(e).toMatchObject({ start: 1, end: 13, line: null })
    expect(excerptAround(lines, 99)).toMatchObject({ start: 1, line: null })
  })

  it('ignores the empty "line" after a trailing newline', () => {
    expect(excerptAround('a\nb\n', 2)).toMatchObject({ start: 1, end: 2, totalLines: 2, code: 'a\nb' })
  })

  it('works on short and empty files', () => {
    expect(excerptAround('only', null)).toMatchObject({ code: 'only', start: 1, end: 1 })
    expect(excerptAround('', null).totalLines).toBe(1)
  })
})

describe('snippetExcerpt', () => {
  it('finds then cuts in one go', () => {
    const e = snippetExcerpt(FILE, 'return app', 2)
    expect(e).toMatchObject({ line: 6, start: 4, end: 8 })
  })
  it('falls back to the top of the file without a highlight', () => {
    expect(snippetExcerpt(FILE, 'nope', 2)).toMatchObject({ line: null, start: 1, end: 5 })
  })
})

describe('small helpers', () => {
  it('squashes whitespace and splits lines', () => {
    expect(squashWhitespace('  a \t b\n c ')).toBe('a b c')
    expect(splitLines('x\r\ny\n')).toEqual(['x', 'y'])
  })
})
