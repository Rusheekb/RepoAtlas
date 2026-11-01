import { hasCommentSyntax, maskSource, stripComments } from './strip'

/** Assert that stripping never moves offsets or line breaks. */
function expectAligned(input: string, output: string) {
  expect(output.length).toBe(input.length)
  expect(output.split('\n').length).toBe(input.split('\n').length)
}

describe('stripComments — C-style languages', () => {
  it('removes line and block comments in TypeScript, keeping newlines', () => {
    const src = `import a from './a' // the a\n/* multi\nline */ const b = 1\n`
    const out = stripComments(src, 'TypeScript')
    expectAligned(src, out)
    expect(out).toContain(`import a from './a'`)
    expect(out).not.toContain('the a')
    expect(out).not.toContain('multi')
    expect(out.split('\n')[2]).toMatch(/^\s+const b = 1$/)
  })

  it('keeps comment markers inside strings', () => {
    const src = `const url = "http://example.com" // real\nconst s = '/* not a comment */'\n`
    const out = stripComments(src, 'JavaScript')
    expect(out).toContain('"http://example.com"')
    expect(out).toContain(`'/* not a comment */'`)
    expect(out).not.toContain('real')
  })

  it('handles template literals with nested expressions and comments', () => {
    const src = 'const t = `a // b ${ x /* inner */ + `y // z` } /* c */`; // tail\n'
    const out = stripComments(src, 'TypeScript')
    expectAligned(src, out)
    expect(out).toContain('`a // b ${')
    expect(out).not.toContain('inner')
    expect(out).toContain('`y // z`')
    expect(out).toContain('/* c */`')
    expect(out).not.toContain('tail')
  })

  it('keeps multi-line template literals intact', () => {
    const src = 'const q = `\n  // not a comment\n  /* nope */\n`\n// gone\n'
    const out = stripComments(src, 'JavaScript')
    expect(out).toContain('// not a comment')
    expect(out).toContain('/* nope */')
    expect(out).not.toContain('gone')
  })

  it('does not treat regex literals as comments', () => {
    const src = `const re = /[/*]+/g; const x = 1 // c\nconst r2 = s.replace(/\\/\\//g, '/')\n`
    const out = stripComments(src, 'JavaScript')
    expect(out).toContain('/[/*]+/g')
    expect(out).toContain('const x = 1')
    expect(out).not.toMatch(/\/\/ c/)
    expect(out).toContain(`s.replace(/\\/\\//g, '/')`)
  })

  it('treats division as division', () => {
    const src = `const half = total / 2 // half\nconst q = (a) / (b) /* x */\n`
    const out = stripComments(src, 'JavaScript')
    expect(out).toContain('total / 2')
    expect(out).not.toContain('half\n')
    expect(out).toContain('(a) / (b)')
    expect(out).not.toContain('/* x */')
  })

  it('handles a shebang line', () => {
    const src = '#!/usr/bin/env node\nconst a = 1\n'
    const out = stripComments(src, 'JavaScript')
    expect(out.startsWith('#!')).toBe(false)
    expect(out).toContain('const a = 1')
  })

  it('treats JSX closing tags as markup, not regexes', () => {
    const src = `const A = () => <div>hi</div> // c\nconst B = <Foo /> // d\n`
    const out = stripComments(src, 'TSX')
    expect(out).toContain('<div>hi</div>')
    expect(out).not.toContain('// c')
    expect(out).not.toContain('// d')
  })

  it('handles Go raw strings and runes', () => {
    const src = 'var s = `line1 // keep\nline2` // drop\nvar r = \'/\' // drop2\n'
    const out = stripComments(src, 'Go')
    expect(out).toContain('`line1 // keep\nline2`')
    expect(out).not.toContain('drop')
  })

  it('handles Rust lifetimes, char literals, raw strings and nested comments', () => {
    const src = [
      "fn f<'a>(x: &'a str) -> char { '\"' } // c1",
      '/* outer /* inner */ still comment */ let s = r#"he said "// hi""#;',
      "let c = '\\n'; // c2",
    ].join('\n')
    const out = stripComments(src, 'Rust')
    expectAligned(src, out)
    expect(out).toContain("fn f<'a>(x: &'a str)")
    expect(out).not.toContain('c1')
    expect(out).not.toContain('still comment')
    expect(out).toContain('r#"he said "// hi""#')
    expect(out).not.toContain('c2')
  })

  it('handles C# verbatim strings and C++ raw strings', () => {
    const cs = `var p = @"C:\\temp\\"" // x\n"; // y\n`
    // @"C:\temp\"" is the verbatim string C:\temp\" ... then "; // y is a new string start.
    expect(stripComments(cs, 'C#')).toContain('@"C:\\temp\\""')
    const cpp = 'auto s = R"(a // b)"; // c\n#include "x.h" // d\n'
    const out = stripComments(cpp, 'C++')
    expect(out).toContain('R"(a // b)"')
    expect(out).not.toContain('// c')
    expect(out).toContain('#include "x.h"')
    expect(out).not.toContain('// d')
  })

  it('handles Kotlin/Java text blocks', () => {
    const src = 'val s = """\n  // inside\n""" // out\n'
    const out = stripComments(src, 'Kotlin')
    expect(out).toContain('// inside')
    expect(out).not.toContain('out\n')
  })

  it('keeps PHP attributes but strips # comments', () => {
    const src = "#[Route('/x')]\n# comment\n$a = 'b'; // c\n"
    const out = stripComments(src, 'PHP')
    expect(out).toContain("#[Route('/x')]")
    expect(out).not.toContain('# comment')
    expect(out).not.toContain('// c')
  })

  it('handles Swift raw strings', () => {
    const src = 'let s = #"a "// b" c"# // d\n'
    const out = stripComments(src, 'Swift')
    expect(out).toContain('#"a "// b" c"#')
    expect(out).not.toContain('// d')
  })
})

describe('stripComments — hash, dash and others', () => {
  it('handles Python comments and triple-quoted strings', () => {
    const src = `x = 1  # one\ns = """\n# not a comment\n"""\ny = 'a#b'  # two\nf = rb'#x'\n`
    const out = stripComments(src, 'Python')
    expectAligned(src, out)
    expect(out).not.toContain('one')
    expect(out).toContain('# not a comment')
    expect(out).toContain(`'a#b'`)
    expect(out).not.toContain('two')
    expect(out).toContain(`rb'#x'`)
  })

  it('handles Ruby =begin blocks and interpolation', () => {
    const src = 'a = "#{b} c" # gone\n=begin\nall gone\n=end\nputs a\n'
    const out = stripComments(src, 'Ruby')
    expect(out).toContain('"#{b} c"')
    expect(out).not.toContain('gone')
    expect(out).toContain('puts a')
    expectAligned(src, out)
  })

  it('handles shell word-start hashes and heredocs', () => {
    const src = [
      'echo $# ${#arr} # count',
      "cat <<'EOF'",
      "don't # keep",
      'EOF',
      'echo done # bye',
    ].join('\n')
    const out = stripComments(src, 'Shell')
    expect(out).toContain('echo $# ${#arr}')
    expect(out).not.toContain('count')
    expect(out).toContain("don't # keep")
    expect(out).toContain('echo done')
    expect(out).not.toContain('bye')
  })

  it('handles YAML and TOML', () => {
    expect(stripComments('a: b#c # d\n', 'YAML')).toBe('a: b#c    \n')
    expect(stripComments('key = "v#1" # c\n', 'TOML')).toBe('key = "v#1"    \n')
    expect(stripComments('a: 1 # c\n', 'yaml')).toBe('a: 1    \n')
  })

  it('handles Lua and SQL dash comments', () => {
    const lua = 'local s = "--x" -- c\n--[[ long\ncomment ]] local t = [[ -- kept ]]\n'
    const out = stripComments(lua, 'Lua')
    expect(out).toContain('"--x"')
    expect(out).not.toContain(' c\n')
    expect(out).not.toContain('long')
    expect(out).toContain('[[ -- kept ]]')
    const sql = "SELECT '--it''s' -- c\n/* b */ FROM t\n"
    const outSql = stripComments(sql, 'SQL')
    expect(outSql).toContain("'--it''s'")
    expect(outSql).not.toContain('-- c')
    expect(outSql).not.toContain('b */')
    expect(stripComments(sql, 'sql')).toBe(outSql)
  })

  it('handles Haskell nested block comments', () => {
    const src = 'main = {- a {- b -} c -} print 1 -- d\n'
    const out = stripComments(src, 'Haskell')
    expectAligned(src, out)
    expect(out).toMatch(/^main = {19}print 1 {5}\n$/)
  })

  it('handles CSS (no // comments) and SCSS (// comments, url())', () => {
    const css = 'a { background: url(http://x.com/a.png); } /* c */\n'
    expect(stripComments(css, 'CSS')).toContain('url(http://x.com/a.png)')
    expect(stripComments(css, 'CSS')).not.toContain('/* c */')
    const scss = '$a: 1; // c\n.b { background: url(http://x.com/a.png); }\n'
    const out = stripComments(scss, 'SCSS')
    expect(out).not.toContain('// c')
    expect(out).toContain('url(http://x.com/a.png)')
  })

  it('handles Dockerfile comments only at line start', () => {
    const out = stripComments('# base\nFROM node:20 # not a comment\n', 'Dockerfile')
    expect(out).toBe('      \nFROM node:20 # not a comment\n')
  })
})

describe('stripComments — markup', () => {
  it('strips HTML comments and scans inline scripts and styles', () => {
    const src = [
      '<!-- <script src="old.js"></script> -->',
      '<script>',
      '  const a = "<!-- keep -->" // drop1',
      '</script>',
      '<style>',
      '  a { color: red } /* drop2 */',
      '</style>',
      '<p>// visible text</p>',
    ].join('\n')
    const out = stripComments(src, 'HTML')
    expectAligned(src, out)
    expect(out).not.toContain('old.js')
    expect(out).toContain('"<!-- keep -->"')
    expect(out).not.toContain('drop1')
    expect(out).not.toContain('drop2')
    expect(out).toContain('<p>// visible text</p>')
  })

  it('handles Vue single-file components', () => {
    const src = [
      '<template>',
      '  <!-- a template comment -->',
      '  <div>{{ msg }}</div>',
      '</template>',
      '<script setup lang="ts">',
      "import Foo from './Foo.vue' // the foo",
      '</script>',
      '<style lang="scss">',
      '// scss comment',
      '</style>',
    ].join('\n')
    const out = stripComments(src, 'Vue')
    expect(out).not.toContain('a template comment')
    expect(out).toContain("import Foo from './Foo.vue'")
    expect(out).not.toContain('the foo')
    expect(out).not.toContain('scss comment')
  })

  it('handles Astro frontmatter', () => {
    const src = "---\nimport Layout from '../layouts/Layout.astro' // c\n---\n<Layout><!-- x --></Layout>\n"
    const out = stripComments(src, 'Astro')
    expect(out).toContain("import Layout from '../layouts/Layout.astro'")
    expect(out).not.toContain('// c')
    expect(out).not.toContain('<!-- x -->')
  })
})

describe('maskSource', () => {
  it('blanks string contents in code but keeps them in text, with identical offsets', () => {
    const src = `import x from './x' // c\nconst s = "import y from 'y'"\n`
    const { text, code } = maskSource(src, 'TypeScript')
    expect(text.length).toBe(src.length)
    expect(code.length).toBe(src.length)
    expect(code).toContain("from '   '")
    expect(code).not.toContain('import y')
    const i = code.indexOf("'   '")
    expect(text.slice(i + 1, i + 4)).toBe('./x')
  })

  it('blanks Python docstrings in code', () => {
    const { code } = maskSource('"""\nimport fake\n"""\nimport real\n', 'Python')
    expect(code).not.toContain('fake')
    expect(code).toContain('import real')
  })

  it('returns unknown languages unchanged', () => {
    expect(stripComments('# hi // there', 'Markdown')).toBe('# hi // there')
    expect(stripComments('x', '')).toBe('x')
    expect(hasCommentSyntax('Python')).toBe(true)
    expect(hasCommentSyntax('Markdown')).toBe(false)
  })

  it('is fast on large inputs', () => {
    const chunk = `const a = "str" // comment\nfunction f(x) { return x / 2 }\n/* block */\n`
    const big = chunk.repeat(20000)
    const t = performance.now()
    const out = stripComments(big, 'TypeScript')
    expect(out.length).toBe(big.length)
    expect(performance.now() - t).toBeLessThan(1500)
  })
})

describe('robustness', () => {
  it('survives absurdly nested template literals without throwing', () => {
    const depth = 20000
    const src = 'const x = ' + '`${'.repeat(depth) + '1' + '}`'.repeat(depth) + '\n// tail\n'
    const out = stripComments(src, 'JavaScript')
    expect(out.length).toBe(src.length)
  })

  it('handles unterminated strings and comments', () => {
    expect(stripComments('const a = "unterminated\nconst b = 1 // c', 'JavaScript')).toContain('const b = 1')
    expect(stripComments('/* never closed\nconst a = 1', 'JavaScript').trim()).toBe('')
    expect(stripComments('s = """never closed\n# x', 'Python')).toContain('# x')
  })
})
