import { describe, expect, it } from 'vitest'
import type { AnalyzedFile, FileRole, ModuleInfo, RepoAnalysis } from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { projectDisplayName, summarizeFile, writeOverview } from './summaries'
import { makeFile, makeMeta } from './structure/testkit'
import { wordCount } from './structure/text'

const sym = (name: string, kind: AnalyzedFile['symbols'][number]['kind'] = 'function', exported = true) => ({ name, kind, line: 1, exported })

describe('summarizeFile', () => {
  it('describes starting points by what starts there', () => {
    expect(summarizeFile(makeFile('src/main.tsx', { role: 'entry', layer: 'ui', isEntry: true, entryReason: 'The app’s screens start here — this file puts the first screen on the page.' }))).toBe(
      'The starting point of the app — it sets things up and launches the first screen.',
    )
    expect(summarizeFile(makeFile('server.js', { role: 'entry', layer: 'api', isEntry: true, entryReason: 'The server starts here — it begins listening for web requests.' }))).toMatch(
      /^The starting point of the server/,
    )
    expect(summarizeFile(makeFile('cmd/x/main.go', { role: 'entry', entryReason: 'The `x` command starts here (it has a main function).' }))).toMatch(/command-line tool/)
  })

  it('lists the web addresses a route file answers', () => {
    expect(summarizeFile(makeFile('src/routes/auth.ts', { role: 'route', layer: 'api', routes: [{ method: 'POST', path: '/api/login', line: 4 }] }))).toBe(
      'Answers web requests to /api/login (POST).',
    )
    const many = summarizeFile(
      makeFile('src/routes/users.ts', {
        role: 'route',
        routes: [
          { method: 'GET', path: '/users', line: 1 },
          { method: 'POST', path: '/users', line: 2 },
          { method: 'GET', path: '/users/:id', line: 3 },
          { method: 'DELETE', path: '/users/:id', line: 4 },
          { method: 'GET', path: '/health', line: 5 },
        ],
      }),
    )
    expect(many).toBe('Answers web requests to 3 addresses, such as /users (GET, POST) and /users/:id (GET, DELETE).')
  })

  it('names data models', () => {
    expect(summarizeFile(makeFile('app/models/user.rb', { role: 'model', layer: 'data', symbols: [sym('User', 'class')] }))).toBe(
      'Defines the `User` data model — what information the app keeps about each user.',
    )
    expect(summarizeFile(makeFile('shop/models.py', { role: 'model', symbols: [sym('Order', 'class'), sym('OrderItem', 'class')] }))).toBe(
      'Defines the data models `Order` and `OrderItem` — what information the app keeps.',
    )
  })

  it('names UI building blocks and how widely they are used', () => {
    const s = summarizeFile(makeFile('src/components/NavBar.tsx', { role: 'component', layer: 'ui', symbols: [sym('NavBar', 'component')], importedBy: ['a', 'b', 'c', 'd', 'e', 'f'] }))
    expect(s).toContain('`NavBar`')
    expect(s).toContain('used by 6 other files')
    expect(summarizeFile(makeFile('src/App.tsx', { role: 'component', symbols: [sym('App', 'component')] }))).toMatch(/^The top-level screen piece/)
  })

  it('covers the other roles with specific, short sentences', () => {
    const cases: [string, Partial<AnalyzedFile>, RegExp][] = [
      ['src/hooks/useAuth.ts', { role: 'hook', symbols: [sym('useAuth', 'hook')] }, /Reusable behavior called `useAuth`/],
      ['src/store/cartSlice.ts', { role: 'state' }, /Keeps track of the app’s cart information/],
      ['src/middleware/auth.ts', { role: 'middleware', symbols: [sym('requireLogin')] }, /checkpoint.*`requireLogin`/],
      ['src/services/email.service.ts', { role: 'service', symbols: [sym('EmailService', 'class')] }, /Handles email for the rest of the app.*`EmailService`/],
      ['src/api/client.ts', { role: 'client' }, /Talks to outside servers/],
      ['db/migrate/20240101_add_email_to_users.rb', { role: 'migration' }, /database’s history: “add email to users”/],
      ['src/utils/format.ts', { role: 'util', symbols: [sym('formatDate'), sym('slugify'), sym('plural')] }, /Handy helpers — `formatDate`, `slugify` and 1 more/],
      ['src/types.ts', { role: 'types', symbols: [sym('User', 'interface')] }, /shape of data, like `User`/],
      ['tests/login.test.ts', { kind: 'test', role: 'test', layer: 'test' }, /Automatic checks for “login”/],
      ['src/styles/global.css', { kind: 'style', role: 'style' }, /used across the whole app/],
      ['docs/deploying.md', { kind: 'docs', role: 'docs' }, /A written guide about “deploying”/],
      ['.github/workflows/tests.yml', { kind: 'config', role: 'ci' }, /automation pipeline that runs the “tests” steps/],
      ['public/logo.png', { kind: 'asset', role: 'asset' }, /An image used by the project/],
      ['src/locales/fr.json', { kind: 'data', role: 'i18n' }, /text in French/],
      ['src/pkg/__init__.py', { role: 'library' }, /Marks “pkg” as a Python package/],
      ['context_test.go', { kind: 'test', role: 'test', layer: 'test' }, /Automatic checks for “context”/],
      ['tests/support/env.js', { kind: 'test', role: 'util', layer: 'test' }, /Shared helpers for the automatic tests/],
      ['.github/ISSUE_TEMPLATE/bug-report.md', { kind: 'docs', role: 'docs' }, /form people fill in to open a “bug report”/],
      ['docs/deploying/index.rst', { kind: 'docs', role: 'docs' }, /first page of the “deploying” guides/],
      ['examples/route-separation/user.js', { role: 'library', layer: 'docs', symbols: [sym('list')] }, /Part of the “route separation” example: it defines `list`/],
      ['lib/application.js', { role: 'library', symbols: [sym('logerror', 'function', false)] }, /Part of the core logic — the “application” code/],
      ['src/db/index.ts', { role: 'repository' }, /^Reads and saves information in storage/],
      ['vite.config.ts', { kind: 'config', role: 'build' }, /Settings for Vite/],
      ['package.json', { kind: 'config', role: 'config' }, /ID card/],
      ['README.md', { kind: 'docs', role: 'docs' }, /welcome note/],
      ['app/dashboard/page.tsx', { role: 'page', symbols: [sym('Dashboard', 'component')] }, /web address \/dashboard \(`Dashboard`\)/],
      ['package-lock.json', { kind: 'generated', role: 'config' }, /exact list/],
    ]
    for (const [path, overrides, re] of cases) expect(summarizeFile(makeFile(path, overrides)), path).toMatch(re)
  })

  it('hedges for code it never downloaded', () => {
    expect(summarizeFile(makeFile('src/components/Card.tsx', { role: 'component', lines: null }))).toBe('Probably a UI building block for “card”, judging by its name and folder.')
  })

  it('always returns one short, finished sentence', () => {
    const roles: FileRole[] = ['entry', 'page', 'component', 'layout', 'hook', 'state', 'route', 'controller', 'middleware', 'service', 'client', 'model', 'schema', 'migration', 'repository', 'util', 'types', 'constants', 'config', 'test', 'fixture', 'style', 'docs', 'script', 'build', 'ci', 'container', 'asset', 'i18n', 'cli', 'library', 'other']
    const longName = 'AVeryLongComponentNameThatGoesOnAndOnForeverAndEverAndEver'
    for (const role of roles) {
      const f = makeFile(`src/deeply/nested/${longName}.ts`, {
        role,
        symbols: Array.from({ length: 8 }, (_, i) => sym(`${longName}${i}`, 'class')),
        routes: Array.from({ length: 6 }, (_, i) => ({ method: 'GET', path: `/a/very/long/path/that/keeps/going/${i}`, line: i })),
        importedBy: ['x', 'y'],
        imports: ['a', 'b', 'c', 'd'],
      })
      const s = summarizeFile(f)
      expect(wordCount(s), `${role}: ${s}`).toBeLessThanOrEqual(31)
      expect(s, role).toMatch(/[.!?…”)]$/)
      expect(s.length).toBeGreaterThan(10)
    }
  })
})

function analysisFor(overrides: Partial<RepoAnalysis> = {}): Omit<RepoAnalysis, 'overview' | 'learningPath' | 'starterConcepts' | 'starterTours'> {
  const files: Record<string, AnalyzedFile> = {
    'src/main.tsx': makeFile('src/main.tsx', { role: 'entry', isEntry: true, entryReason: 'The app’s screens start here — this file puts the first screen on the page.' }),
    'src/lib/api.ts': makeFile('src/lib/api.ts', { importedBy: ['a', 'b', 'c'] }),
  }
  const mod = (id: string, name: string, role: string): ModuleInfo => ({
    id,
    name,
    path: id === ROOT_MODULE_ID ? '' : id,
    layer: 'ui',
    role,
    description: `Holds the ${name}. More text here.`,
    emoji: '🧩',
    files: [],
    fileCount: 3,
    lines: 100,
    bytes: 1000,
    languages: ['TypeScript'],
    keyFiles: [],
    layerBreakdown: {},
  })
  return {
    meta: makeMeta({ description: 'A tiny shop.' }),
    ref: 'main',
    commitSha: 'abc',
    files,
    fileEdges: [],
    modules: [mod('src/components', 'components', 'Reusable screen pieces'), mod('src/lib', 'lib', 'Shared code'), mod(ROOT_MODULE_ID, 'Project setup files', 'Project setup files')],
    moduleEdges: [],
    languages: [
      { name: 'TypeScript', bytes: 9000, files: 10, percent: 90, color: '#3178c6' },
      { name: 'CSS', bytes: 1000, files: 2, percent: 10, color: '#663399' },
    ],
    techStack: [
      { id: 'react', name: 'React', category: 'frontend', description: 'React builds screens from reusable pieces. It is popular.', evidence: [], importance: 'core' },
      { id: 'vite', name: 'Vite', category: 'build', description: 'A fast build tool.', evidence: [], importance: 'tooling' },
    ],
    projectKind: { id: 'web-app', label: 'Web application', description: 'An interactive program that runs in a web browser — you use it, not just read it.', emoji: '🌐', confidence: 0.8, reasons: ['Uses React, a popular toolkit for building interactive screens.'] },
    entryPoints: ['src/main.tsx'],
    hubs: ['src/lib/api.ts'],
    externalPackages: [{ name: 'react', count: 5 }],
    readme: { path: 'README.md', content: '# Shop\n\n[![ci](https://x/badge.svg)](https://x)\n\nShop is a friendly little online store where people can browse products and check out.\n\n## Install\n' },
    stats: { totalFiles: 20, analyzedFiles: 18, totalBytes: 10000, totalLines: 1500, sourceFiles: 12, testFiles: 3, languageCount: 2, folderCount: 4, maxDepth: 3, internalEdges: 10, externalPackages: 1 },
    glossaryTermIds: [],
    warnings: [],
    analyzedAt: 0,
    ...overrides,
  }
}

describe('writeOverview', () => {
  it('writes all five sections with real names from the analysis', () => {
    const md = writeOverview(analysisFor())
    for (const h of ['## What is this?', "## What it's built with", "## How it's organized", '## Where it starts', '## Good to know']) expect(md).toContain(h)
    expect(md).toContain('**shop** is a **web application**')
    expect(md).toContain('“Shop is a friendly little online store where people can browse products and check out.”')
    expect(md).toContain('**TypeScript** (90% of the code), with some **CSS** (10%)')
    expect(md).toContain('- **React** — React builds screens from reusable pieces.')
    expect(md).toContain('helper tools like Vite')
    expect(md).toContain('**components** — reusable screen pieces')
    expect(md).toContain('`src/main.tsx` — The app’s screens start here')
    expect(md).toContain('3 test files automatically check')
    expect(md).toContain('`src/lib/api.ts`, used by 3 other files')
    expect(md).toContain('MIT license')
    const words = wordCount(md.replace(/[#*`-]/g, ' '))
    expect(words).toBeGreaterThan(120)
    expect(words).toBeLessThan(450)
  })

  it('stays friendly when there is little to go on', () => {
    const md = writeOverview(
      analysisFor({
        modules: [],
        entryPoints: [],
        hubs: [],
        languages: [],
        techStack: [],
        readme: null,
        meta: makeMeta({ description: null, license: null }),
        projectKind: { id: 'unknown', label: 'Software project', description: 'A software project.', emoji: '📁', confidence: 0.2, reasons: [] },
        stats: { totalFiles: 0, analyzedFiles: 0, totalBytes: 0, totalLines: 0, sourceFiles: 0, testFiles: 0, languageCount: 0, folderCount: 0, maxDepth: 0, internalEdges: 0, externalPackages: 0 },
      }),
    )
    expect(md).toContain('**shop** is a **software project**')
    expect(md).toContain('no single obvious starting point')
    expect(md).toContain('didn’t spot any automated tests')
  })

  it('never lets repository text inject Markdown links or HTML', () => {
    const md = writeOverview(
      analysisFor({
        readme: { path: 'README.md', content: 'Click <script>alert(1)</script> [here](javascript:alert(1)) for a **great** time with this wonderful project today.' },
        meta: makeMeta({ repo: 'evil_[x](http://bad)' }),
      }),
    )
    expect(md).not.toContain('<script>')
    expect(md).not.toContain('alert(1)')
    expect(md).not.toMatch(/(?<!\\)\]\((javascript|http)/)
  })
})

describe('summarizeFile: command-line files', () => {
  it('gives a command as the example, never an error class', () => {
    const cli = makeFile('src/flask/cli.py', {
      role: 'cli',
      layer: 'api',
      symbols: [sym('NoAppException', 'class'), sym('find_best_app'), sym('run_command'), sym('shell_command')],
      importedBy: ['a', 'b'],
    })
    const s = summarizeFile(cli)
    expect(s).toBe('Handles commands typed into the terminal, like `run_command`, used by 2 other files.')
    expect(s).not.toContain('NoAppException')
  })

  it('names a non-command helper without calling it a command', () => {
    const s = summarizeFile(makeFile('crates/cli/src/human.rs', { role: 'cli', symbols: [sym('ParseSizeError', 'struct'), sym('parse_human_readable_size')] }))
    expect(s).not.toContain('ParseSizeError')
    expect(s).not.toMatch(/like `/)
    const err = summarizeFile(makeFile('crates/cli/src/pattern.rs', { role: 'cli', symbols: [sym('InvalidPatternError', 'struct')] }))
    expect(err).toBe('Handles commands typed into the terminal.')
  })
})

describe('writeOverview: plain, consistent wording', () => {
  it('doesn’t repeat a part’s role when its name or description already says it', () => {
    const mod = (id: string, role: string, description: string): ModuleInfo => ({
      id, name: id, path: id, layer: 'logic', role, description, emoji: '⚙️', files: [], fileCount: 3, lines: 100, bytes: 1000, languages: [], keyFiles: [], layerBreakdown: {},
    })
    const md = writeOverview(
      analysisFor({
        modules: [
          mod('examples', 'Examples', 'Sample projects and snippets showing how to use this project.'),
          mod('flask', 'Core logic', 'Holds part of the project’s core logic, including `app.py`.'),
          mod('.github', 'GitHub settings', 'GitHub-specific files: automation pipelines, issue templates and contribution rules.'),
          mod('tests', 'Automated tests', 'Code that automatically checks the rest of the project still works.'),
          mod('benchsuite', 'Command files', 'Holds part of the project’s data & storage.'),
        ],
      }),
    )
    expect(md).toContain('**examples** — sample projects')
    expect(md).toContain('**flask** — holds part of the project’s core logic')
    expect(md).toContain('**.github** — GitHub-specific files')
    expect(md).toContain('**tests** — code that automatically checks')
    expect(md).toContain('**benchsuite** — command files: holds part')
    expect(md).not.toMatch(/examples\*\* — examples:|core logic: holds part of the project’s core logic/)
  })

  it('gives the same “used by” number as the file cards, noting the tests', () => {
    const files: Record<string, AnalyzedFile> = {
      'src/flask/globals.py': makeFile('src/flask/globals.py', { importedBy: ['src/flask/a.py', 'src/flask/b.py', 'tests/test_a.py'] }),
      'src/flask/a.py': makeFile('src/flask/a.py'),
      'src/flask/b.py': makeFile('src/flask/b.py'),
      'tests/test_a.py': makeFile('tests/test_a.py', { kind: 'test', role: 'test', layer: 'test' }),
    }
    const md = writeOverview(analysisFor({ files, hubs: ['src/flask/globals.py'] }))
    expect(md).toContain('The most relied-on file is `src/flask/globals.py`, used by 3 other files (1 of them is a test).')
  })

  it('uses the package name when the repository has a generic name (httpie/cli)', () => {
    expect(projectDisplayName('cli', ['httpie'])).toBe('httpie')
    expect(projectDisplayName('flask', ['Flask'])).toBe('flask')
    expect(projectDisplayName('core', ['@acme/core', 'acme-core'])).toBe('acme-core')
    expect(projectDisplayName('cli', [])).toBe('cli')
    expect(writeOverview(analysisFor(), { name: 'httpie' })).toContain('**httpie** is a **web application**')
  })

  it('names the small packages a framework-free project builds on (Express)', () => {
    const lib = (name: string, ext: string[]) => makeFile(`lib/${name}.js`, { externalImports: ext })
    const files = Object.fromEntries(
      [
        lib('application', ['debug', 'finalhandler', 'router']),
        lib('request', ['accepts', 'type-is', 'router']),
        lib('response', ['send', 'router', 'vary']),
        makeFile('examples/markdown/index.js', { externalImports: ['marked'] }),
        makeFile('test/app.js', { kind: 'test', role: 'test', layer: 'test', externalImports: ['supertest'] }),
      ].map((f) => [f.path, f]),
    )
    const md = writeOverview(analysisFor({ files, techStack: [], hubs: [] }))
    expect(md).toContain('It doesn’t build on one big, well-known framework. Instead it leans on many small ready-made packages written by others, such as `router`,')
    expect(md).not.toContain('marked')
    expect(md).not.toContain('supertest')
  })
})
