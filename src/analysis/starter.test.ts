import { describe, expect, it, vi } from 'vitest'

vi.mock('@/knowledge', () => ({ describeFolder: () => null }))

import type { AnalyzedFile, RepoAnalysis } from '@/core/types'
import { buildModuleEdges, buildModules } from './modules'
import { findHubs } from './graph'
import { buildStarterConcepts, buildStarterTours } from './starter'
import { makeFile, makeMeta } from './structure/testkit'

type Input = Parameters<typeof buildStarterTours>[0]

const contents: Record<string, string> = {
  'README.md': '# Bookshelf\n\nBookshelf is a small server that keeps track of the books you own and the friends you lend them to.\n',
  'src/server.js': "const express = require('express')\nconst users = require('./routes/users')\nconst auth = require('./middleware/auth')\n\nconst app = express()\napp.use(auth)\napp.use('/users', users)\n\napp.listen(3000)\n",
  'src/routes/users.js':
    "const router = require('express').Router()\nconst controller = require('../controllers/userController')\n\nrouter.get('/', controller.list)\nrouter.post('/', controller.create)\nrouter.get('/:id', controller.show)\n\nmodule.exports = router\n",
  'src/controllers/userController.js':
    "const User = require('../models/user')\nconst mailer = require('../services/mailer')\n\nexports.list = async (req, res) => {\n  res.json(await User.find())\n}\n\nexports.create = async (req, res) => {\n  const user = await User.create(req.body)\n  await mailer.welcome(user)\n  res.status(201).json(user)\n}\n",
  'src/models/user.js':
    "const mongoose = require('mongoose')\n\nconst UserSchema = new mongoose.Schema({\n  name: String,\n  email: { type: String, required: true },\n  joinedAt: Date,\n})\n\nconst User = mongoose.model('User', UserSchema)\nmodule.exports = User\n",
  'src/services/mailer.js': "exports.welcome = async function welcome(user) {\n  return send(user.email, 'Welcome!')\n}\n",
  'src/middleware/auth.js': 'module.exports = function auth(req, res, next) {\n  if (!req.headers.authorization) return res.sendStatus(401)\n  next()\n}\n',
  'tests/users.test.js': "const request = require('supertest')\nconst app = require('../src/server')\n\ndescribe('users', () => {\n  it('lists users', async () => {\n    await request(app).get('/users').expect(200)\n  })\n})\n",
  '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
}

const sym = (name: string, line: number, kind: AnalyzedFile['symbols'][number]['kind'] = 'function') => ({ name, kind, line, exported: true })

function fixture(): Input {
  const list: AnalyzedFile[] = [
    makeFile('README.md', { kind: 'docs', role: 'docs', layer: 'docs' }),
    makeFile('package.json', { kind: 'config', role: 'config', layer: 'config' }),
    makeFile('src/server.js', {
      role: 'entry',
      layer: 'api',
      isEntry: true,
      entryReason: 'The server starts here — it begins listening for web requests.',
      imports: ['src/routes/users.js', 'src/middleware/auth.js'],
      summary: 'The starting point of the server — it sets things up and starts listening for web requests.',
    }),
    makeFile('src/routes/users.js', {
      role: 'route',
      layer: 'api',
      imports: ['src/controllers/userController.js'],
      routes: [
        { method: 'GET', path: '/', line: 4 },
        { method: 'POST', path: '/', line: 5 },
        { method: 'GET', path: '/:id', line: 6 },
      ],
      summary: 'Answers web requests to / (GET, POST) and /:id (GET).',
    }),
    makeFile('src/controllers/userController.js', {
      role: 'controller',
      layer: 'api',
      imports: ['src/models/user.js', 'src/services/mailer.js'],
      symbols: [sym('list', 4), sym('create', 8)],
      summary: 'Handles incoming requests about users and works out what to send back.',
    }),
    makeFile('src/models/user.js', {
      role: 'model',
      layer: 'data',
      symbols: [sym('UserSchema', 3, 'variable'), sym('User', 9, 'variable')],
      summary: 'Defines the data models `UserSchema` and `User` — what information the app keeps.',
    }),
    makeFile('src/services/mailer.js', { role: 'service', layer: 'logic', symbols: [sym('welcome', 1)], summary: 'Handles mailer for the rest of the app.' }),
    makeFile('src/middleware/auth.js', { role: 'middleware', layer: 'api', symbols: [sym('auth', 1)], summary: 'A checkpoint that requests pass through (`auth`), like a security guard checking tickets at the door.' }),
    makeFile('tests/users.test.js', { kind: 'test', role: 'test', layer: 'test', imports: ['src/server.js'], summary: 'Automatic checks for “users” — they make sure it keeps working after changes.' }),
    makeFile('.github/workflows/ci.yml', { kind: 'config', role: 'ci', layer: 'infra', summary: 'An automation pipeline.' }),
  ]
  const files = Object.fromEntries(list.map((f) => [f.path, f]))
  const fileEdges = list.flatMap((f) => f.imports.map((t) => ({ source: f.path, target: t })))
  for (const e of fileEdges) files[e.target].importedBy.push(e.source)
  const { modules, assignments } = buildModules(list)
  for (const f of list) f.moduleId = assignments[f.path]
  return {
    meta: makeMeta({ repo: 'bookshelf', fullName: 'acme/bookshelf' }),
    ref: 'main',
    commitSha: 'abc',
    files,
    fileEdges,
    modules,
    moduleEdges: buildModuleEdges(fileEdges, assignments),
    languages: [{ name: 'JavaScript', bytes: 1000, files: 7, percent: 100, color: '#f1e05a' }],
    techStack: [
      { id: 'express', name: 'Express', category: 'backend', description: 'Express is a toolkit for building web servers. It is small.', analogy: 'Like a switchboard operator.', evidence: ['package.json → dependencies'], importance: 'core' },
      { id: 'mongodb', name: 'MongoDB', category: 'database', description: 'A database that stores information as flexible documents.', evidence: ['package.json → dependencies'], importance: 'core' },
      { id: 'javascript', name: 'JavaScript', category: 'language', description: 'The language of the web.', evidence: [], importance: 'core' },
    ],
    projectKind: { id: 'api-server', label: 'Server / API', description: 'A program that runs on a server and answers requests from apps or other programs.', emoji: '🖥️', confidence: 0.8, reasons: ['Uses Express, a toolkit for building web servers.'] },
    entryPoints: ['src/server.js'],
    hubs: findHubs(list),
    externalPackages: [],
    readme: { path: 'README.md', content: contents['README.md'] },
    stats: { totalFiles: list.length, analyzedFiles: list.length, totalBytes: 0, totalLines: 0, sourceFiles: 6, testFiles: 1, languageCount: 1, folderCount: 6, maxDepth: 2, internalEdges: fileEdges.length, externalPackages: 0 },
    glossaryTermIds: [],
    overview: '',
    learningPath: [],
    warnings: [],
    analyzedAt: 0,
  } as Input & Pick<RepoAnalysis, 'learningPath'>
}

describe('buildStarterConcepts', () => {
  it('builds a connected map of real ideas from the repo', () => {
    const map = buildStarterConcepts(fixture(), contents)
    expect(map.source).toBe('starter')
    expect(map.concepts.length).toBeGreaterThanOrEqual(6)
    expect(map.concepts.length).toBeLessThanOrEqual(16)
    const ids = map.concepts.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const r of map.relations) {
      expect(ids).toContain(r.from)
      expect(ids).toContain(r.to)
      expect(r.label.length).toBeGreaterThan(1)
    }
    for (const c of map.concepts) {
      expect(c.importance).toBeGreaterThanOrEqual(1)
      expect(c.importance).toBeLessThanOrEqual(5)
      expect(c.summary.length).toBeGreaterThan(10)
      expect(c.analogy.length).toBeGreaterThan(10)
      for (const p of c.files) expect(fixture().files[p]).toBeDefined()
      // Only the emoji field may hold an emoji (the interface shows an icon by category instead).
      expect(`${c.name} ${c.summary} ${c.explanation} ${c.analogy}`).not.toMatch(/\p{Extended_Pictographic}|!/u)
    }

    const project = map.concepts.find((c) => c.id === 'the-project')!
    expect(project.name).toBe('bookshelf')
    expect(project.explanation).toContain('keeps track of the books you own')

    const user = map.concepts.find((c) => c.name === 'User')!
    expect(user.category).toBe('data')
    expect(user.files).toEqual(['src/models/user.js'])

    expect(map.concepts.find((c) => c.id === 'web-addresses')?.explanation).toContain('`GET /:id`')
    expect(map.concepts.find((c) => c.name === 'Express')?.category).toBe('technology')
    expect(map.concepts.find((c) => c.name === 'MongoDB')).toBeDefined()
    expect(map.concepts.find((c) => c.id === 'starting-point')?.files).toContain('src/server.js')
    expect(map.relations).toContainEqual({ from: 'the-project', label: 'starts at', to: 'starting-point' })
    expect(map.relations.some((r) => r.label === 'is stored in')).toBe(true)
  })

  it('reads model fields from the code', () => {
    const map = buildStarterConcepts(fixture(), contents)
    const withFields = map.concepts.filter((c) => c.category === 'data').map((c) => c.explanation).join('\n')
    expect(withFields).toMatch(/\*\*name\*\*.*\*\*email\*\*.*\*\*joined at\*\*/)
  })
})

describe('buildStarterConcepts: one idea per thing', () => {
  it('folds the project’s own main folder into the project idea instead of showing it twice', () => {
    const base = fixture()
    const main = base.modules.find((m) => m.id === 'src') ?? base.modules[0]
    // A repository whose main code folder carries its own name (flask/src/flask, gin's top level).
    const renamed = { ...base, modules: base.modules.map((m) => (m === main ? { ...m, name: 'bookshelf' } : m)) }
    const map = buildStarterConcepts(renamed, contents)
    const names = map.concepts.map((c) => c.name.toLowerCase())
    expect(names.filter((n) => n.startsWith('bookshelf'))).toEqual(['bookshelf'])
    expect(names.some((n) => n.includes('(main code)'))).toBe(false)
    for (const r of map.relations) expect(r.from).not.toBe(r.to)
  })

  it('uses the package name for a generically named repository', () => {
    const map = buildStarterConcepts(fixture(), contents, { name: 'httpie' })
    expect(map.concepts.find((c) => c.id === 'the-project')?.name).toBe('httpie')
  })

  it('leaves out a database that is only a helper tool', () => {
    const base = fixture()
    const quiet = { ...base, techStack: base.techStack.map((t) => (t.id === 'mongodb' ? { ...t, importance: 'tooling' as const } : t)) }
    expect(buildStarterConcepts(quiet, contents).concepts.find((c) => c.name === 'MongoDB')).toBeUndefined()
  })
})

describe('buildStarterTours', () => {
  it('builds tours that walk through real files with verbatim snippets', () => {
    const tours = buildStarterTours(fixture(), contents)
    const ids = tours.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['where-it-begins', 'main-parts', 'a-request', 'the-data', 'the-tests']))
    for (const t of tours) {
      expect(t.source).toBe('starter')
      expect(t.steps.length).toBeGreaterThanOrEqual(2)
      // Plain text throughout: the tour's emoji field is data, and step titles carry no role or module emoji.
      expect(`${t.title} ${t.question} ${t.summary}`).not.toMatch(/\p{Extended_Pictographic}|!/u)
      for (const s of t.steps) {
        expect(s.title.length).toBeGreaterThan(2)
        expect(s.explanation.length).toBeGreaterThan(20)
        expect(`${s.title} ${s.explanation}`).not.toMatch(/\p{Extended_Pictographic}|!/u)
        if (s.snippet) {
          expect(s.file).not.toBeNull()
          expect(contents[s.file as string]).toContain(s.snippet)
        }
        if (s.file) expect(fixture().files[s.file]).toBeDefined()
      }
    }

    const begin = tours.find((t) => t.id === 'where-it-begins')!
    expect(begin.steps[0]).toMatchObject({ file: 'src/server.js', snippet: 'app.listen(3000)', title: 'Start here: server.js' })
    expect(begin.steps.map((s) => s.file)).toEqual(expect.arrayContaining(['src/routes/users.js', 'src/controllers/userController.js']))
    expect(begin.steps[begin.steps.length - 1].file).toBeNull()

    const request = tours.find((t) => t.id === 'a-request')!
    expect(request.title).toBe('What happens when a request reaches the server?')
    const routeStep = request.steps.find((s) => s.file === 'src/routes/users.js')!
    expect(routeStep.snippet).toBe("router.get('/', controller.list)")
    expect(request.steps.some((s) => s.file === 'src/middleware/auth.js')).toBe(true)
    expect(request.steps.some((s) => s.file === 'src/controllers/userController.js')).toBe(true)
    expect(request.steps[request.steps.length - 1].explanation).toMatch(/MongoDB/)

    const data = tours.find((t) => t.id === 'the-data')!
    expect(data.steps.some((s) => s.file === 'src/models/user.js' && s.snippet?.includes('UserSchema'))).toBe(true)

    const tests = tours.find((t) => t.id === 'the-tests')!
    expect(tests.steps.find((s) => s.file === 'tests/users.test.js')?.snippet).toBe("describe('users', () => {")
    expect(tests.steps.find((s) => s.file === '.github/workflows/ci.yml')?.snippet).toBe('- run: npm test')

    const parts = tours.find((t) => t.id === 'main-parts')!
    expect(parts.steps[0].explanation).toContain('keeps track of the books you own')
    expect(parts.steps.find((s) => s.moduleId === 'src/routes')?.title).toBe('routes')
    expect(begin.steps[begin.steps.length - 1].explanation).toContain('**How it connects**')
    for (const s of parts.steps.slice(1, -1)) expect(s.moduleId).not.toBeNull()
  })

  it('returns no tours rather than failing when there is nothing to walk through', () => {
    const empty = { ...fixture(), files: {}, modules: [], moduleEdges: [], entryPoints: [], hubs: [], fileEdges: [] }
    expect(buildStarterTours(empty, {})).toEqual([])
  })

  it('drops snippets that are not in the file', () => {
    const tours = buildStarterTours(fixture(), { ...contents, 'src/server.js': 'totally different\n' })
    const first = tours.find((t) => t.id === 'where-it-begins')!.steps[0]
    expect(first.snippet === null || 'totally different\n'.includes(first.snippet)).toBe(true)
  })
})
