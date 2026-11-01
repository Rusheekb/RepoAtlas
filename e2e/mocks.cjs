/**
 * Network mocks for end-to-end tests: serves GitHub fixtures (see scripts/make-fixture.mjs)
 * and a fake Claude streaming API, so tests run offline and deterministically.
 */
const fs = require('node:fs')
const path = require('node:path')

function loadFixtures(dir) {
  const map = new Map()
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    map.set(`${fx.owner}/${fx.repo}`.toLowerCase(), fx)
  }
  return map
}

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

function claudeStream(text, model) {
  const chunks = text.match(/[\s\S]{1,40}/g) ?? ['']
  return sse([
    {
      type: 'message_start',
      message: {
        id: 'msg_e2e',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 900 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'e2e-signature' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    ...chunks.map((c) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: c } })),
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 321 } },
    { type: 'message_stop' },
  ])
}

/** Build a plausible structured answer for whichever schema the request asks for. */
function structuredAnswer(body, fx) {
  const schemaText = JSON.stringify(body.output_config?.format ?? {})
  const textFiles = Object.keys(fx.files).filter((p) => /\.(py|js|ts|go|rs|tsx|jsx)$/.test(p)).slice(0, 6)
  const f0 = textFiles[0] ?? null
  const f1 = textFiles[1] ?? f0
  const firstLine = (p) => (p ? (fx.files[p].split('\n').find((l) => l.trim().length > 8) ?? null) : null)
  if (schemaText.includes('"concepts"')) {
    return {
      concepts: [
        { id: 'requests', name: 'Requests', emoji: '📨', category: 'data', summary: 'Messages a browser sends to the server.', explanation: 'Every time someone visits a page, a **request** arrives.', analogy: 'Like a letter dropped in a mailbox.', files: [f0].filter(Boolean), importance: 5 },
        { id: 'routing', name: 'Routing', emoji: '🧭', category: 'process', summary: 'Deciding which code answers which address.', explanation: 'Routing matches web addresses to code.', analogy: 'Like a receptionist directing visitors.', files: [f1].filter(Boolean), importance: 4 },
        { id: 'app', name: 'The application', emoji: '🏠', category: 'actor', summary: 'The object that ties everything together.', explanation: 'The app holds settings and routes.', analogy: 'Like the building that houses every office.', files: [f0].filter(Boolean), importance: 5 },
      ],
      relations: [
        { from: 'app', to: 'routing', label: 'uses' },
        { from: 'routing', to: 'requests', label: 'handles' },
      ],
    }
  }
  if (schemaText.includes('"tours"')) {
    return {
      tours: [
        {
          id: 'ai-request-journey',
          title: 'The journey of a request',
          question: 'What happens when someone visits a page?',
          emoji: '🚶',
          summary: 'Follow one visit from arrival to answer.',
          steps: [
            { title: 'A visitor arrives', explanation: 'A browser sends a request.', file: f0, snippet: firstLine(f0), moduleId: null },
            { title: 'Finding the right code', explanation: 'The router picks a handler.', file: f1, snippet: firstLine(f1), moduleId: null },
            { title: 'The answer goes back', explanation: 'A response is sent back.', file: null, snippet: null, moduleId: null },
          ],
        },
      ],
    }
  }
  if (schemaText.includes('"questions"')) {
    return {
      questions: [
        { question: 'What does this project mainly help you build?', options: ['Web applications', 'Spreadsheets', 'Video games', 'Printers'], answerIndex: 0, explanation: 'It is a toolkit for building web applications.' },
        { question: 'What is a “route”?', options: ['A web address the app answers', 'A database table', 'A color theme', 'A test'], answerIndex: 0, explanation: 'Routes connect addresses to code.' },
        { question: 'Where would you look first to understand the project?', options: ['The README', 'The license', 'The lockfile', 'The .gitignore'], answerIndex: 0, explanation: 'The README is the front door.' },
      ],
    }
  }
  return { note: 'unknown schema' }
}

/**
 * Install routes on a Playwright BrowserContext.
 * Returns a log of Claude requests ({ headers, body }) for assertions.
 */
async function installMocks(context, fixtures, opts = {}) {
  const claudeRequests = []
  const githubCalls = []

  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    githubCalls.push(url.pathname)
    const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/)
    const fx = m && fixtures.get(`${m[1]}/${m[2]}`.toLowerCase())
    const headers = {
      'access-control-allow-origin': '*',
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '57',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    }
    if (!fx) return route.fulfill({ status: 404, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
    const rest = m[3] ?? ''
    if (rest === '') return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(fx.meta) })
    if (rest.startsWith('/commits/')) {
      const accept = req.headers()['accept'] ?? ''
      if (accept.includes('sha')) return route.fulfill({ status: 200, headers, contentType: 'text/plain', body: fx.commitSha })
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ sha: fx.commitSha }) })
    }
    if (rest.startsWith('/branches/')) {
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ name: 'main', commit: { sha: fx.commitSha } }) })
    }
    if (rest.startsWith('/git/trees/')) {
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ sha: fx.commitSha, truncated: false, tree: fx.tree }) })
    }
    if (rest.startsWith('/contents/')) {
      const p = decodeURIComponent(rest.slice('/contents/'.length))
      if (p in fx.files) return route.fulfill({ status: 200, headers, contentType: 'text/plain', body: fx.files[p] })
      return route.fulfill({ status: 404, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
    }
    return route.fulfill({ status: 404, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
  })

  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const url = new URL(route.request().url())
    const parts = url.pathname.split('/').filter(Boolean)
    const fx = fixtures.get(`${parts[0]}/${parts[1]}`.toLowerCase())
    const p = parts.slice(3).map(decodeURIComponent).join('/')
    if (fx && p in fx.files) {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'text/plain; charset=utf-8', body: fx.files[p] })
    }
    // Images referenced by READMEs etc.
    return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '404: Not Found' })
  })

  await context.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request()
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: '' })
    const url = new URL(req.url())
    if (url.pathname.startsWith('/v1/models/')) {
      const id = url.pathname.split('/').pop()
      if (opts.badKey) return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) })
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ type: 'model', id, display_name: id, created_at: '2026-01-01T00:00:00Z' }) })
    }
    if (url.pathname === '/v1/messages') {
      const body = JSON.parse(req.postData() ?? '{}')
      claudeRequests.push({ headers: req.headers(), body })
      if (opts.badKey) return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) })
      const fx = [...fixtures.values()][0]
      const text = body.output_config?.format
        ? JSON.stringify(structuredAnswer(body, fx))
        : '## In one sentence\n\nThis is a **mocked** explanation from Claude for end-to-end testing. It mentions `README.md` so links can be tested.\n\n## How it works\n\n1. First step\n2. Second step\n'
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: claudeStream(text, body.model) })
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' })
  })

  // Block any other external request so tests never touch the network.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    const u = route.request().url()
    if (u.startsWith('https://api.github.com') || u.startsWith('https://raw.githubusercontent.com') || u.startsWith('https://api.anthropic.com')) return route.fallback()
    return route.fulfill({ status: 204, body: '' })
  })

  return { claudeRequests, githubCalls }
}

module.exports = { loadFixtures, installMocks }
