import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GRAMMAR_LOADERS, grammarFor, HIGHLIGHTED_LANGUAGES } from './languages'
import { toCodeToken } from './highlighter'

describe('grammarFor', () => {
  it('maps the analysis’ display names to Shiki grammars', () => {
    expect(grammarFor('TypeScript')).toBe('typescript')
    expect(grammarFor('TSX')).toBe('tsx')
    expect(grammarFor('Python')).toBe('python')
    expect(grammarFor('C#')).toBe('csharp')
    expect(grammarFor('C++')).toBe('cpp')
    expect(grammarFor('Shell')).toBe('shellscript')
    expect(grammarFor('Dockerfile')).toBe('dockerfile')
    expect(grammarFor('Markdown')).toBe('markdown')
    expect(grammarFor('YAML')).toBe('yaml')
  })

  it('falls back to the file name or extension', () => {
    expect(grammarFor(null, 'src/app.tsx')).toBe('tsx')
    expect(grammarFor(null, 'deploy/Dockerfile.prod')).toBe('dockerfile')
    expect(grammarFor(null, '.env.local')).toBe('dotenv')
    expect(grammarFor(null, 'Makefile')).toBe('makefile')
    expect(grammarFor(null, 'notes.unknown')).toBeNull()
    expect(grammarFor('Lockfile', 'yarn.lock')).toBeNull()
  })

  it('covers the common languages and every mapping has a loader', () => {
    const wanted = ['TypeScript', 'TSX', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'C', 'C++', 'Ruby', 'PHP', 'Swift', 'Dart', 'HTML', 'CSS', 'SCSS', 'Shell', 'JSON', 'YAML', 'TOML', 'Markdown', 'SQL', 'Vue', 'Svelte', 'Dockerfile', 'Makefile', 'Lua', 'R', 'Elixir', 'Haskell', 'Scala', 'GraphQL', 'XML', 'INI']
    for (const name of wanted) expect(HIGHLIGHTED_LANGUAGES, name).toContain(name)
    for (const name of HIGHLIGHTED_LANGUAGES) {
      const id = grammarFor(name)
      expect(id && id in GRAMMAR_LOADERS, name).toBe(true)
    }
    expect(Object.keys(GRAMMAR_LOADERS).length).toBeGreaterThanOrEqual(40)
  })

  it('points every loader at a grammar file that exists in shiki', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/code/languages.ts'), 'utf8')
    const files = [...source.matchAll(/import\('shiki\/langs\/([\w+-]+\.mjs)'\)/g)].map((m) => m[1])
    expect(files.length).toBe(Object.keys(GRAMMAR_LOADERS).length)
    for (const f of files) expect(existsSync(join(process.cwd(), 'node_modules/shiki/dist/langs', f)), f).toBe(true)
  })
})

describe('toCodeToken', () => {
  it('keeps both theme colors and font styles', () => {
    expect(toCodeToken({ content: 'def', htmlStyle: { '--shiki-light': '#D73A49', '--shiki-dark': '#F97583' } })).toEqual({
      content: 'def',
      light: '#D73A49',
      dark: '#F97583',
    })
    expect(toCodeToken({ content: '# note', htmlStyle: { '--shiki-light': '#6A737D', '--shiki-light-font-style': 'italic' } })).toMatchObject({ italic: true })
    expect(toCodeToken({ content: 'x' })).toEqual({ content: 'x' })
  })
})
