import { describe, expect, it, vi } from 'vitest'
import type { RawImport, RepoSnapshot, RouteInfo, CodeSymbol } from '@/core/types'

// ── Collaborators are mocked with small, realistic stand-ins so this test only exercises the orchestration. ──

vi.mock('./imports', () => ({
  extractImports: (_path: string, content: string): RawImport[] => {
    const out: RawImport[] = []
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      const m = /require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/.exec(line)
      if (m) out.push({ specifier: m[1] ?? m[2], line: i + 1 })
    })
    return out
  },
}))

vi.mock('./resolve', () => ({
  createResolver: (ctx: { paths: string[] }) => {
    const paths = new Set(ctx.paths)
    return (from: string, imp: RawImport) => {
      const spec = imp.specifier
      if (spec.startsWith('.')) {
        const base = from.split('/').slice(0, -1)
        for (const part of spec.split('/')) {
          if (part === '..') base.pop()
          else if (part !== '.') base.push(part)
        }
        const joined = base.join('/')
        for (const cand of [joined, `${joined}.js`, `${joined}/index.js`]) if (paths.has(cand)) return { type: 'internal', paths: [cand] }
        return { type: 'unresolved' }
      }
      if (['fs', 'path', 'http'].includes(spec)) return { type: 'builtin', name: spec }
      return { type: 'external', packageName: spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] }
    }
  },
}))

vi.mock('./symbols', () => ({
  extractSymbols: (_path: string, content: string): CodeSymbol[] => {
    const out: CodeSymbol[] = []
    content.split('\n').forEach((line, i) => {
      const m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?(?:const|let)\s+(\w+)\s*=|^exports\.(\w+)\s*=|^class\s+(\w+)/.exec(line)
      const name = m && (m[1] ?? m[2] ?? m[3] ?? m[4])
      if (name) out.push({ name, kind: /^[A-Z]/.test(name) && line.includes('Schema') ? 'variable' : 'function', line: i + 1, exported: /^export|^exports\.|module\.exports/.test(line) || /^[A-Z]/.test(name) })
    })
    return out
  },
}))

vi.mock('./routes', () => ({
  extractRoutes: (_path: string, content: string): RouteInfo[] => {
    const out: RouteInfo[] = []
    content.split('\n').forEach((line, i) => {
      const m = /\b(?:app|router)\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]/.exec(line)
      if (m) out.push({ method: m[1].toUpperCase(), path: m[2], line: i + 1 })
    })
    return out
  },
}))

vi.mock('@/knowledge', () => ({
  parseManifests: (files: Record<string, string>) => {
    const pkg = JSON.parse(files['package.json'] ?? '{}') as { name?: string; main?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }
    return {
      dependencies: [
        ...Object.keys(pkg.dependencies ?? {}).map((name) => ({ ecosystem: 'npm', name, dev: false, source: 'package.json' })),
        ...Object.keys(pkg.devDependencies ?? {}).map((name) => ({ ecosystem: 'npm', name, dev: true, source: 'package.json' })),
      ],
      scripts: Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({ name, command, source: 'package.json' })),
      entryHints: [],
      workspaces: [],
      psr4: {},
      projectNames: pkg.name ? [pkg.name] : [],
      descriptions: [],
    }
  },
  detectTechStack: (input: { importedPackages?: { name: string; count: number }[] }) => [
    { id: 'express', name: 'Express', category: 'backend', description: 'Express is a small toolkit for building web servers in JavaScript.', evidence: ['package.json → dependencies'], importance: 'core' },
    { id: 'mongodb', name: 'MongoDB', category: 'database', description: 'A database that stores information as flexible documents.', evidence: ['package.json → dependencies'], importance: 'core' },
    { id: 'jest', name: 'Jest', category: 'testing', description: 'A tool that runs automated tests.', evidence: ['package.json → devDependencies'], importance: 'tooling' },
    ...(input.importedPackages?.some((p) => p.name === 'nodemailer') ? [{ id: 'nodemailer', name: 'Nodemailer', category: 'utility', description: 'Sends email.', evidence: [], importance: 'supporting' }] : []),
  ],
  lookupPackage: (_eco: string, name: string) => (name === 'express' ? { id: 'express' } : name === 'mongoose' ? { id: 'mongodb' } : undefined),
  findRelevantTerms: () => ['server', 'route', 'database', 'test'],
  describeFolder: (name: string) =>
    name === 'routes'
      ? { role: 'Web address handlers', description: 'Decide what happens for each web address.', emoji: '🧭', layer: 'api' }
      : name === 'models'
        ? { role: 'Data models', description: 'Describe the information the app stores.', emoji: '🧾', layer: 'data' }
        : null,
}))

import { analyzeRepo } from './analyze'
import { makeMeta } from './structure/testkit'
import { ROOT_MODULE_ID } from '@/core/types'

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'bookshelf',
    private: true,
    scripts: { start: 'node src/server.js', test: 'jest' },
    dependencies: { express: '^5.0.0', mongoose: '^8.0.0', nodemailer: '^6.0.0' },
    devDependencies: { jest: '^29.0.0', supertest: '^7.0.0' },
  }),
  'README.md': '# Bookshelf\n\n![build](https://example.com/badge.svg)\n\nBookshelf is a small web server that keeps track of the books you own and who borrowed them.\n\n## Getting started\n\nRun `npm start`.\n',
  'Dockerfile': 'FROM node:22\nCOPY . .\nRUN npm ci\nCMD ["node", "src/server.js"]\n',
  '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
  'src/server.js': "const app = require('./app')\nconst { connect } = require('./db')\n\nconnect()\napp.listen(process.env.PORT || 3000)\n",
  'src/app.js': "const express = require('express')\nconst books = require('./routes/books')\nconst users = require('./routes/users')\nconst auth = require('./middleware/auth')\n\nconst app = express()\napp.use(auth)\napp.use('/books', books)\napp.use('/users', users)\nmodule.exports = app\n",
  'src/db.js': "const mongoose = require('mongoose')\nexports.connect = function connect() {\n  return mongoose.connect(process.env.MONGO_URL)\n}\n",
  'src/routes/books.js': "const router = require('express').Router()\nconst books = require('../controllers/bookController')\n\nrouter.get('/', books.list)\nrouter.post('/', books.create)\nrouter.get('/:id', books.show)\nmodule.exports = router\n",
  'src/routes/users.js': "const router = require('express').Router()\nconst users = require('../controllers/userController')\n\nrouter.get('/', users.list)\nrouter.post('/signup', users.signup)\nmodule.exports = router\n",
  'src/controllers/bookController.js': "const Book = require('../models/book')\nconst { formatTitle } = require('../utils/format')\n\nexports.list = async (req, res) => res.json(await Book.find())\nexports.create = async (req, res) => res.status(201).json(await Book.create({ ...req.body, title: formatTitle(req.body.title) }))\nexports.show = async (req, res) => res.json(await Book.findById(req.params.id))\n",
  'src/controllers/userController.js': "const User = require('../models/user')\nconst mailer = require('../services/mailer')\nconst { formatTitle } = require('../utils/format')\n\nexports.list = async (req, res) => res.json(await User.find())\nexports.signup = async (req, res) => {\n  const user = await User.create(req.body)\n  await mailer.welcome(user, formatTitle(user.name))\n  res.status(201).json(user)\n}\n",
  'src/models/book.js': "const mongoose = require('mongoose')\n\nconst BookSchema = new mongoose.Schema({\n  title: String,\n  author: String,\n  borrowedBy: String,\n})\n\nmodule.exports = mongoose.model('Book', BookSchema)\n",
  'src/models/user.js': "const mongoose = require('mongoose')\n\nconst UserSchema = new mongoose.Schema({\n  name: String,\n  email: String,\n})\n\nmodule.exports = mongoose.model('User', UserSchema)\n",
  'src/services/mailer.js': "const nodemailer = require('nodemailer')\nexports.welcome = async function welcome(user) {\n  return nodemailer.createTransport({}).sendMail({ to: user.email })\n}\n",
  'src/middleware/auth.js': "module.exports = function auth(req, res, next) {\n  if (!req.headers.authorization) return res.sendStatus(401)\n  next()\n}\n",
  'src/utils/format.js': "exports.formatTitle = function formatTitle(title) {\n  return String(title).trim()\n}\n",
  'tests/books.test.js': "const request = require('supertest')\nconst app = require('../src/app')\n\ndescribe('books', () => {\n  it('lists books', async () => {\n    await request(app).get('/books').expect(200)\n  })\n})\n",
  'tests/users.test.js': "const request = require('supertest')\nconst app = require('../src/app')\n\ndescribe('users', () => {\n  it('signs up', async () => {\n    await request(app).post('/users/signup').send({ name: 'Ada' }).expect(201)\n  })\n})\n",
  'docs/api.md': '# API\n\nThe server answers these addresses…\n',
  'docs/setup.md': '# Setup\n\nInstall Node.js first.\n',
  'empty.js': '',
  LICENSE: 'MIT License\n\nCopyright (c) 2026\n',
}

function snapshot(extra: Partial<RepoSnapshot> = {}): RepoSnapshot {
  const tree = [
    ...Object.entries(FILES).map(([path, text]) => ({ path, size: text.length, sha: path })),
    { path: 'public/logo.png', size: 24_000, sha: 'png' },
    { path: 'src/legacy/oldRoutes.js', size: 8_000, sha: 'old' },
    { path: 'weird name with spaces.unknownext', size: 10, sha: 'w' },
  ]
  return {
    meta: makeMeta({ repo: 'bookshelf', fullName: 'acme/bookshelf', description: 'Keep track of your books.', primaryLanguage: 'JavaScript' }),
    ref: 'main',
    commitSha: 'abc123',
    tree,
    treeTruncated: false,
    files: { ...FILES },
    skipped: [
      { path: 'public/logo.png', reason: 'binary' },
      { path: 'src/legacy/oldRoutes.js', reason: 'limit' },
    ],
    fetchedAt: 0,
    ...extra,
  }
}

describe('analyzeRepo', () => {
  it('turns a realistic Express project into a complete, consistent analysis', async () => {
    const a = await analyzeRepo(snapshot())
    const paths = Object.keys(a.files)
    expect(paths).toHaveLength(Object.keys(FILES).length + 3)

    // Files
    const server = a.files['src/server.js']
    expect(server).toMatchObject({ fetched: true, language: 'JavaScript', isEntry: true, role: 'entry', layer: 'api', lines: 5 })
    expect(server.entryReason).toMatch(/server starts here/)
    expect(server.imports.sort()).toEqual(['src/app.js', 'src/db.js'])
    expect(a.files['src/app.js'].importedBy.sort()).toEqual(['src/server.js', 'tests/books.test.js', 'tests/users.test.js'])
    expect(a.files['src/app.js'].externalImports).toEqual(['express'])
    expect(a.files['src/routes/books.js']).toMatchObject({ role: 'route', layer: 'api' })
    expect(a.files['src/routes/books.js'].routes.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /', 'POST /', 'GET /:id'])
    expect(a.files['src/models/book.js']).toMatchObject({ role: 'model', layer: 'data' })
    expect(a.files['tests/books.test.js']).toMatchObject({ kind: 'test', layer: 'test' })
    expect(a.files['public/logo.png']).toMatchObject({ fetched: false, lines: null, kind: 'asset' })
    expect(a.files['src/legacy/oldRoutes.js']).toMatchObject({ fetched: false, lines: null })
    expect(a.files['empty.js'].lines).toBe(0)
    for (const f of Object.values(a.files)) {
      expect(f.summary.length, f.path).toBeGreaterThan(5)
      expect(a.modules.some((m) => m.id === f.moduleId), f.path).toBe(true)
    }

    // Edges
    const edgeSet = new Set(a.fileEdges.map((e) => `${e.source}>${e.target}`))
    expect(edgeSet.size).toBe(a.fileEdges.length)
    expect(edgeSet).toContain('src/app.js>src/routes/books.js')
    expect(edgeSet).toContain('src/controllers/bookController.js>src/models/book.js')
    expect(a.files['src/controllers/userController.js'].unresolvedImports).toEqual([])

    // Modules
    const ids = a.modules.map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining(['src/routes', 'src/controllers', 'src/models', 'tests', 'docs', '.github', ROOT_MODULE_ID]))
    expect(a.modules.length).toBeGreaterThanOrEqual(6)
    expect(a.modules.length).toBeLessThanOrEqual(24)
    const routes = a.modules.find((m) => m.id === 'src/routes')!
    expect(routes).toMatchObject({ name: 'routes', role: 'Web address handlers', layer: 'api', emoji: '🧭', fileCount: 2 })
    expect(routes.description).toMatch(/^Decide what happens for each web address\./)
    const moduleEdges = a.moduleEdges.map((e) => `${e.source}>${e.target}`)
    expect(moduleEdges).toEqual(expect.arrayContaining(['src/routes>src/controllers', 'src/controllers>src/models']))
    for (const e of a.moduleEdges) expect(e.examples.length).toBeLessThanOrEqual(3)

    // Entry points, hubs, kind
    expect(a.entryPoints[0]).toBe('src/server.js')
    expect(a.hubs).toContain('src/utils/format.js')
    expect(a.projectKind.id).toBe('api-server')
    expect(a.projectKind.reasons.join(' ')).toMatch(/Express/)

    // Languages, packages, stats
    expect(a.languages[0]).toMatchObject({ name: 'JavaScript', color: '#f1e05a' })
    expect(a.languages.reduce((s, l) => s + l.percent, 0)).toBeGreaterThan(99)
    expect(a.languages.find((l) => l.name === 'JavaScript')!.bytes).toBeGreaterThan(8000) // counts the unread oldRoutes.js too
    expect(a.externalPackages.find((p) => p.name === 'express')).toMatchObject({ techId: 'express' })
    expect(a.externalPackages.find((p) => p.name === 'mongoose')).toMatchObject({ count: 3, techId: 'mongodb' })
    expect(a.techStack.map((t) => t.id)).toContain('nodemailer')
    expect(a.stats).toMatchObject({ totalFiles: paths.length, analyzedFiles: Object.keys(FILES).length, testFiles: 2, internalEdges: a.fileEdges.length, externalPackages: a.externalPackages.length })
    expect(a.stats.folderCount).toBeGreaterThanOrEqual(9)
    expect(a.stats.maxDepth).toBe(2)
    expect(a.readme?.path).toBe('README.md')
    expect(a.glossaryTermIds).toEqual(['server', 'route', 'database', 'test'])

    // Story
    expect(a.overview).toContain('## What is this?')
    expect(a.overview).toContain('**bookshelf**')
    expect(a.overview).toContain('keeps track of the books you own')
    expect(a.learningPath.length).toBeGreaterThanOrEqual(6)
    expect(a.learningPath.length).toBeLessThanOrEqual(10)
    expect(a.starterConcepts.source).toBe('starter')
    expect(a.starterConcepts.concepts.length).toBeGreaterThanOrEqual(6)
    expect(a.starterConcepts.concepts.map((c) => c.name)).toEqual(expect.arrayContaining(['Book', 'User', 'Express']))

    const tourIds = a.starterTours.map((t) => t.id)
    expect(tourIds).toEqual(expect.arrayContaining(['where-it-begins', 'main-parts', 'a-request', 'the-data', 'the-tests']))
    const begin = a.starterTours.find((t) => t.id === 'where-it-begins')!
    expect(begin.steps[0]).toMatchObject({ file: 'src/server.js', snippet: 'app.listen(process.env.PORT || 3000)', moduleId: 'src' })
    expect(begin.steps.map((s) => s.file)).toContain('src/app.js')
    const request = a.starterTours.find((t) => t.id === 'a-request')!
    expect(request.steps.some((s) => s.file?.startsWith('src/routes/'))).toBe(true)
    for (const t of a.starterTours) {
      for (const s of t.steps) {
        if (s.file) expect(a.files[s.file], `${t.id}: ${s.file}`).toBeDefined()
        if (s.snippet) expect(FILES[s.file as string], `${t.id}: ${s.snippet}`).toContain(s.snippet)
        if (s.moduleId) expect(ids).toContain(s.moduleId)
      }
    }

    // Warnings
    expect(a.warnings.some((w) => /^We read the 22 most important of 25 files\./.test(w))).toBe(true)
    expect(a.meta.repo).toBe('bookshelf')
    expect(a.commitSha).toBe('abc123')
    expect(a.analyzedAt).toBeGreaterThan(0)
  })

  it('handles an empty repository', async () => {
    const a = await analyzeRepo(snapshot({ tree: [], files: {}, skipped: [] }))
    expect(a.modules).toEqual([])
    expect(a.entryPoints).toEqual([])
    expect(a.starterTours).toEqual([])
    expect(a.warnings).toEqual(['This repository looks empty — there are no files to explore yet.'])
    expect(a.overview).toContain('## What is this?')
  })

  it('handles root-only repositories with no code, odd files and a truncated tree', async () => {
    const files = { 'README': 'Notes about my week.', 'notes.txt': 'shopping list', '.gitignore': 'node_modules\n' }
    const a = await analyzeRepo(
      snapshot({
        tree: [...Object.entries(files).map(([path, t]) => ({ path, size: t.length, sha: path })), { path: 'image.heic', size: 0, sha: 'i' }, { path: '', size: 0, sha: 'x' }],
        files,
        skipped: [{ path: 'image.heic', reason: 'binary' }],
        treeTruncated: true,
      }),
    )
    expect(Object.keys(a.files).sort()).toEqual(['.gitignore', 'README', 'image.heic', 'notes.txt'])
    expect(a.modules).toHaveLength(1)
    expect(a.modules[0].id).toBe(ROOT_MODULE_ID)
    expect(a.warnings.join(' ')).toMatch(/only shared part of its file list/)
    expect(a.warnings.join(' ')).toMatch(/didn’t find any program code/)
    expect(a.readme?.path).toBe('README')
  })

  it('survives collaborators that throw or return junk', async () => {
    const knowledge = await import('@/knowledge')
    const spy = vi.spyOn(knowledge, 'parseManifests').mockImplementation(() => {
      throw new Error('boom')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = await analyzeRepo(snapshot())
    expect(a.entryPoints[0]).toBe('src/server.js')
    expect(a.modules.length).toBeGreaterThan(0)
    spy.mockRestore()
    warn.mockRestore()
  })

  it('stays fast on a huge tree where only a few files were downloaded', async () => {
    const tree = Array.from({ length: 20_000 }, (_, i) => ({ path: `packages/pkg${i % 40}/src/area${i % 25}/file${i}.ts`, size: 1200 + (i % 500), sha: String(i) }))
    const files: Record<string, string> = {}
    for (let i = 0; i < 300; i++) files[tree[i].path] = `import { x } from './file${i + 40}'\nexport function f${i}() { return x }\n`
    const t0 = performance.now()
    const a = await analyzeRepo(snapshot({ tree, files, skipped: tree.slice(300).map((t) => ({ path: t.path, reason: 'limit' as const })) }))
    const ms = performance.now() - t0
    expect(Object.keys(a.files)).toHaveLength(20_000)
    expect(a.modules.length).toBeLessThanOrEqual(24)
    expect(a.modules.length).toBeGreaterThanOrEqual(6)
    expect(ms).toBeLessThan(6000)
  })
})
