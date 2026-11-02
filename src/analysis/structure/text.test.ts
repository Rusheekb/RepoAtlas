import { describe, expect, it } from 'vitest'
import { plainText, readmeIntro, sentence } from './text'

describe('plainText', () => {
  it('keeps only the words of every kind of link', () => {
    expect(plainText('Flask is a lightweight [WSGI] web framework around [Werkzeug] and [Jinja].')).toBe('Flask is a lightweight WSGI web framework around Werkzeug and Jinja.')
    expect(plainText('See [the docs](https://x.dev) and [the guide][guide].')).toBe('See the docs and the guide.')
    expect(plainText('Built on `Werkzeug <https://werkzeug.palletsprojects.com>`_ and :ref:`blueprints`.')).toBe('Built on Werkzeug and blueprints.')
  })

  it('drops HTML comments, scripts and tags', () => {
    expect(plainText('Hello <!-- hidden --> <b>world</b><script>alert(1)</script >!')).toBe('Hello world !')
  })

  it('stays fast on hostile text', () => {
    const t0 = performance.now()
    plainText('['.repeat(100_000))
    plainText('<'.repeat(100_000))
    plainText('<!--'.repeat(50_000))
    plainText('**a'.repeat(50_000))
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe('sentence', () => {
  it('adds a full stop unless the text already ends a sentence', () => {
    expect(sentence('The server starts here')).toBe('The server starts here.')
    expect(sentence('Where does it begin?')).toBe('Where does it begin?')
    expect(sentence('In the authors’ words: “A tiny shop”')).toBe('In the authors’ words: “A tiny shop”')
    expect(sentence('  ')).toBe('')
  })

  it('ends a sentence that closes with a bracket, but not one whose bracket holds a full sentence', () => {
    expect(sentence('Runs when you type "flask" in a terminal (pyproject.toml)')).toBe('Runs when you type "flask" in a terminal (pyproject.toml).')
    expect(sentence('The program starts here (it has a main function).')).toBe('The program starts here (it has a main function).')
    expect(sentence('It is optional. (See the tests.)')).toBe('It is optional. (See the tests.)')
  })
})

describe('readmeIntro', () => {
  it('skips underlined titles (Markdown setext and reStructuredText)', () => {
    expect(readmeIntro('ripgrep (rg)\n------------\nripgrep is a line-oriented search tool that recursively searches the current directory.')).toBe(
      'ripgrep is a line-oriented search tool that recursively searches the current directory.',
    )
    expect(readmeIntro('=====\nTitle\n=====\n\nThis project helps you track your daily habits with ease.')).toBe('This project helps you track your daily habits with ease.')
  })

  it('skips reStructuredText directives and lead-ins to lists', () => {
    const rst = '.. image:: https://example.org/badge.svg\n   :target: https://example.org\n\nTo run locally, you can either:\n\n- use Docker\n\nThe source code of the project’s own website, built with Django.'
    expect(readmeIntro(rst)).toBe('The source code of the project’s own website, built with Django.')
  })

  it('skips pointers elsewhere', () => {
    expect(readmeIntro('See the presentation here: Spring Petclinic slides\n\nA sample Spring application for a vet clinic, with owners and pets.')).toBe(
      'A sample Spring application for a vet clinic, with owners and pets.',
    )
  })

  it('strips reference links from the quoted intro', () => {
    expect(readmeIntro('# Flask\n\nFlask is a lightweight [WSGI] web application framework.\n\n[WSGI]: https://wsgi.readthedocs.io/')).toBe('Flask is a lightweight WSGI web application framework.')
  })
})

describe('readmeIntro: real-world READMEs', () => {
  it('reads past reStructuredText titles underlined with ~~~ (djangoproject.com)', () => {
    const rst = 'djangoproject.com source code\n=============================\n\nTo run locally, you can either:\n\n- Install and run from a virtual environment\n\nInstall and run locally from a virtual environment\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n\n#. Create a virtualenv\n'
    expect(readmeIntro(rst)).toBeNull()
  })

  it('skips rows of navigation links and uses the tagline (Excalidraw)', () => {
    const md = '<h4 align="center">\n  <a href="https://excalidraw.com">Excalidraw Editor</a> |\n  <a href="https://x/blog">Blog</a> |\n  <a href="https://docs">Documentation</a>\n</h4>\n\n<div align="center">\n  <h2>\n    An open source virtual hand-drawn style whiteboard. </br>\n    Collaborative and end-to-end encrypted.\n  </h2>\n</div>\n'
    expect(readmeIntro(md)).toBe('An open source virtual hand-drawn style whiteboard. Collaborative and end-to-end encrypted.')
    const navOnly = '[Home](https://a) · [Docs](https://b) · [Blog](https://c) · [Chat](https://d)\n\nA small tool that renames photos by the date they were taken.'
    expect(readmeIntro(navOnly)).toBe('A small tool that renames photos by the date they were taken.')
  })

  it('skips notes and merchandise banners', () => {
    expect(readmeIntro('Note: These slides refer to a legacy version of the project.\n\nA sample application for a vet clinic.')).toBe('A sample application for a vet clinic.')
    expect(readmeIntro('Show your love for fzf -- T-shirts, mugs, and stickers now available!\n\nfzf is a general-purpose command-line fuzzy finder.')).toBe('fzf is a general-purpose command-line fuzzy finder.')
  })
})

describe('readmeIntro: code and emphasis', () => {
  it('skips indented literal blocks and shell commands', () => {
    expect(readmeIntro('#. Install dependencies::\n\n    python3 -m pip install -r requirements/dev.txt\n\nnpm install my-tool\n\nThe website behind the Django project, with its blog and docs.')).toBe(
      'The website behind the Django project, with its blog and docs.',
    )
  })

  it('drops emphasis marks next to brackets', () => {
    expect(readmeIntro('HTTPie (pronounced _aitch-tee-tee-pie_) is a command-line HTTP client.')).toBe('HTTPie (pronounced aitch-tee-tee-pie) is a command-line HTTP client.')
  })
})

describe('readmeIntro: instructions are not a description', () => {
  it('stops at the first how-to heading', () => {
    expect(readmeIntro('# Tool\n\n## Installation\n\nRun the installer and follow the prompts on screen carefully.')).toBeNull()
    expect(readmeIntro('Install and run locally\n~~~~~~~~~~~~~~~~~~~~~~~\n\n(Use the same passwords as the ones in your secrets file, please.)')).toBeNull()
    expect(readmeIntro('# Tool\n\nTool turns your notes into a tidy little website.\n\n## Usage\n\nRun it.')).toBe('Tool turns your notes into a tidy little website.')
  })
})

describe('readmeIntro: titles that look like instructions', () => {
  it('keeps reading under a project called "build"', () => {
    expect(readmeIntro('# build\n\nA simple, correct Python build frontend.\n\n## Installation\n\npip install build')).toBe('A simple, correct Python build frontend.')
  })
})
