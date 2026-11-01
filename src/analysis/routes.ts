import { basename } from '@/core/paths'
import type { RouteInfo } from '@/core/types'
import { LineIndex } from './imports/util'
import { detectLanguage, languageFamily } from './languages'
import { maskSource } from './strip'

const MAX_ROUTES = 100
/** Annotations / attributes examined per file (each one reads a few hundred characters around it). */
const MAX_ANNOTATIONS = 2000
const MAX_CONTENT = 1_500_000
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

class Routes {
  readonly list: RouteInfo[] = []
  private readonly seen = new Set<string>()
  private lines: LineIndex | null = null
  constructor(private readonly content: string) {}

  lineAt(offset: number): number {
    if (!this.lines) this.lines = new LineIndex(this.content)
    return this.lines.lineAt(offset)
  }

  add(method: string, path: string, offset: number): void {
    this.addAtLine(method, path, this.lineAt(offset))
  }

  full(): boolean {
    return this.list.length >= MAX_ROUTES
  }

  addAtLine(method: string, path: string, line: number): void {
    if (this.list.length >= MAX_ROUTES) return
    const m = normalizeMethod(method)
    const p = path.trim()
    if (!p || p.length > 300 || /[\n\r]/.test(p)) return
    const key = `${m} ${p} ${line}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.list.push({ method: m, path: p, line })
  }
}

function normalizeMethod(m: string): string {
  const u = m.trim().toUpperCase().replace(/^HTTP/, '')
  if (u === 'DEL') return 'DELETE'
  if (u === 'ALL' || u === 'ANY' || u === 'USE' || u === 'MATCH' || u === 'ROUTE' || u === 'API_ROUTE' || u === '*' || u === 'MAP') return 'ANY'
  if (u === 'WEBSOCKET' || u === 'WS') return 'WS'
  return HTTP_METHODS.includes(u) ? u : 'ANY'
}

/** Join a prefix and a path into "/a/b" form (keeps an explicit trailing slash, params as written). */
export function joinRoute(prefix: string, path: string): string {
  const a = prefix.trim()
  const b = path.trim()
  let p = b ? (a ? `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}` : b) : a
  if (!p.startsWith('/')) p = `/${p}`
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1 && p.endsWith('/') && !b.endsWith('/')) p = p.slice(0, -1)
  return p
}

/** Methods listed in an array/list snippet: "['GET', 'POST']", "[:get, :post]", "RequestMethod.POST". */
function methodsIn(s: string): string[] {
  const out = new Set<string>()
  for (const m of s.matchAll(/\b(get|post|put|patch|delete|head|options|all|any)\b/gi)) out.add(normalizeMethod(m[1]))
  return [...out]
}

/** First quoted string in a snippet (arguments of a decorator/annotation). */
function firstString(s: string): string | null {
  const m = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/.exec(s)
  return m ? m[2] : null
}

/** All quoted strings in a snippet. */
function allStrings(s: string): string[] {
  return [...s.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2])
}

/** True when the match start sits in real code (not inside a string or comment). */
function inCode(code: string, text: string, index: number): boolean {
  return code[index] === text[index]
}

/** The balanced (…) argument list starting at `open` (index of "("), from the text view. */
function argsAt(text: string, open: number, limit = 600): string {
  let depth = 0
  for (let i = open; i < Math.min(text.length, open + limit); i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return text.slice(open + 1, Math.min(text.length, open + limit))
}

/** For every "{" the index of its matching "}" (or the end of the text when it never closes), in one pass. */
function matchingBraces(code: string): Map<number, number> {
  const close = new Map<number, number>()
  const open: number[] = []
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i)
    if (c === 123) open.push(i)
    else if (c === 125) {
      const o = open.pop()
      if (o !== undefined) close.set(o, i)
    }
  }
  for (const o of open) close.set(o, code.length)
  return close
}

/** Brace depth at the start of every line (computed on the code view). */
function lineDepths(code: string): number[] {
  const depths: number[] = []
  let depth = 0
  for (const line of code.split('\n')) {
    depths.push(depth)
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
  }
  return depths
}

// ─────────────────────────────────────────────────────────────────────────────
// File-system routing (Next.js, SvelteKit, Astro, Nuxt, Remix)
// ─────────────────────────────────────────────────────────────────────────────

function cleanSegments(segs: string[]): string[] {
  return segs.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@') && !s.startsWith('_'))
}

function exportedMethods(text: string, code: string, r: Routes, path: string): void {
  for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:function\s+|const\s+|let\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\b/g)) {
    if (inCode(code, text, m.index)) r.add(m[1], path, m.index)
  }
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/(?<!\s)\s+as\s+/).pop()?.trim() ?? ''
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) r.add(name, path, m.index)
    }
  }
}

function fileRoutes(filePath: string, text: string, code: string, r: Routes): boolean {
  // Next.js App Router: app/**/route.ts
  let m = /(?:^|\/)app\/((?:[^/]+\/)*)route\.[cm]?[jt]sx?$/.exec(filePath)
  if (m && !/(?:^|\/)app\/.*\/app\//.test(filePath.slice(0, m.index + 4))) {
    exportedMethods(text, code, r, joinRoute('', cleanSegments(m[1].split('/')).join('/')))
    return true
  }
  // SvelteKit: src/routes/**/+server.ts
  m = /(?:^|\/)src\/routes\/((?:[^/]+\/)*)\+server\.[jt]s$/.exec(filePath)
  if (m) {
    exportedMethods(text, code, r, joinRoute('', m[1].split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/')))
    return true
  }
  // Next.js Pages Router API routes: pages/api/**
  m = /(?:^|\/)pages\/(api\/.+)\.[cm]?[jt]sx?$/.exec(filePath)
  if (m && !/\bexport\s+(?:async\s+)?(?:function|const|let)\s+(?:GET|POST|PUT|PATCH|DELETE|ALL)\b/.test(code)) {
    const route = joinRoute('', m[1].replace(/\/index$/, ''))
    const methods = new Set<string>()
    for (const mm of text.matchAll(/\bmethod\s*(?:===?|!==?)\s*['"`](\w+)['"`]|\bcase\s+['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/g)) {
      methods.add((mm[1] ?? mm[2]).toUpperCase())
    }
    const def = /\bexport\s+default\b/.exec(code)
    const at = def ? def.index : 0
    if (methods.size) for (const meth of methods) r.add(meth, route, at)
    else r.add('ANY', route, at)
    return true
  }
  // Astro endpoints: src/pages/**/*.ts
  m = /(?:^|\/)src\/pages\/(.+)\.[jt]s$/.exec(filePath)
  if (m) {
    exportedMethods(text, code, r, joinRoute('', m[1].replace(/(?:^|\/)index$/, '')))
    return true
  }
  // Nuxt / Nitro: server/api/**, server/routes/** (method suffix like users.post.ts)
  m = /(?:^|\/)server\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete|head|options))?\.[jt]s$/.exec(filePath)
  if (m && /defineEventHandler|eventHandler|defineCachedEventHandler/.test(code)) {
    const base = m[1] === 'api' ? `api/${m[2]}` : m[2]
    const handler = /\b(?:defineEventHandler|eventHandler|defineCachedEventHandler)\b/.exec(code)
    r.add(m[3] ?? 'ANY', joinRoute('', base.replace(/(?:^|\/)index$/, '')), handler?.index ?? 0)
    return true
  }
  // Remix / React Router framework mode: app/routes/*.tsx with loader/action exports
  m = /(?:^|\/)app\/routes\/(.+)\.[jt]sx?$/.exec(filePath)
  if (m && /\bexport\s+(?:async\s+)?(?:function|const)\s+(?:loader|action)\b/.test(code)) {
    const segs = m[1]
      .replace(/\/route$/, '')
      .split(/[./]/)
      .filter((s) => s && s !== '_index' && !s.startsWith('_') && !/^\(.*\)$/.test(s))
      .map((s) => (s.startsWith('$') ? (s === '$' ? '*' : `:${s.slice(1)}`) : s.replace(/_$/, '')))
    const route = joinRoute('', segs.join('/'))
    for (const mm of code.matchAll(/\bexport\s+(?:async\s+)?(?:function|const)\s+(loader|action)\b/g)) {
      r.add(mm[1] === 'loader' ? 'GET' : 'POST', route, mm.index)
    }
    return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// JavaScript / TypeScript frameworks
// ─────────────────────────────────────────────────────────────────────────────

const JS_SERVER_HINT =
  /\b(?:express|koa|fastify|hono|elysia|restify|polka|h3|itty-router|next-connect|@koa\/router|koa-router|@hapi|hapi|oak|worktop|tinyhttp|hyper-express|ultimate-express|Router\s*\(|createRouter|@nestjs)\b/
const STRONG_RECEIVER = /^(?:this\.)?(?:app|router|server|fastify|hono|koa|express|api[A-Z]\w*|[a-z]\w*(?:Router|Routes|App|Server))$/
const WEAK_RECEIVER = /^(?:this\.)?(?:api|routes?|r|e|g|v\d+|instance|apiRouter|admin|auth|users?|v\d+Router)$/
const CLIENT_RECEIVER = /^(?:this\.)?(?:axios|http|https|request|client|fetch|\$http|superagent|ky|got|agent|httpClient|cy|wrapper|map|cache|store|params|headers|searchParams|formData|localStorage|sessionStorage|redis|db|knex|prisma|config|settings|env|res|req|ctx|c)$/

function jsRoutes(text: string, code: string, r: Routes): void {
  const serverish = JS_SERVER_HINT.test(code + text.slice(0, 4000))
  for (const m of text.matchAll(/(?<![\w$.])((?:this\.)?[A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|del|options|head|all)\s*\(\s*(['"`])(\/[^'"`\n]*|\*)\3/g)) {
    if (!inCode(code, text, m.index)) continue
    const recv = m[1]
    if (CLIENT_RECEIVER.test(recv)) continue
    if (!STRONG_RECEIVER.test(recv) && !(serverish && WEAK_RECEIVER.test(recv))) continue
    r.add(m[2], m[4], m.index)
  }
  // app.route('/book').get(…).post(…)
  for (const m of text.matchAll(/\.\s*route\s*\(\s*(['"`])(\/[^'"`\n]*)\1\s*\)/g)) {
    if (!inCode(code, text, m.index)) continue
    // Only the chained calls of this statement: stop at ";" or at a line that doesn't continue the chain.
    const rest = code.slice(m.index + m[0].length, m.index + m[0].length + 800)
    const stmt = /^[^;]*?(?=;|\n(?!\s*\.)|$)/.exec(rest)?.[0] ?? ''
    for (const mm of stmt.matchAll(/\.\s*(get|post|put|patch|delete|all)\s*\(/g)) r.add(mm[1], m[2], m.index)
  }
  // fastify.route({ method: 'GET', url: '/x' }) / server.route({ method: 'POST', path: '/x' }) (hapi)
  for (const m of code.matchAll(/\.\s*route\s*\(\s*\{/g)) {
    const body = text.slice(m.index, m.index + 600)
    const url = /\b(?:url|path)\s*:\s*(['"`])([^'"`\n]+)\1/.exec(body)
    const method = /\bmethod\s*:\s*(\[[^\]]*\]|(['"`])\w+\2)/.exec(body)
    if (url) for (const meth of method ? methodsIn(method[1]) : ['ANY']) r.add(meth, url[2], m.index)
  }
  // NestJS controllers
  if (/@Controller\s*\(/.test(code)) {
    const decorators = [...text.matchAll(/@(Controller|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/g)].filter((d) => inCode(code, text, d.index))
    let prefix = ''
    for (const d of decorators) {
      const args = argsAt(text, d.index + d[0].length - 1)
      if (d[1] === 'Controller') {
        const pathProp = /\bpath\s*:\s*(['"`])([^'"`]*)\1/.exec(args)
        prefix = pathProp ? pathProp[2] : (firstString(args) ?? '')
        continue
      }
      r.add(d[1], joinRoute(prefix, firstString(args) ?? ''), d.index)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Python
// ─────────────────────────────────────────────────────────────────────────────

function pythonRoutes(filePath: string, text: string, code: string, r: Routes): void {
  // Router / blueprint prefixes: router = APIRouter(prefix="/users"), bp = Blueprint("x", __name__, url_prefix="/api")
  const prefixes = new Map<string, string>()
  for (const m of text.matchAll(/^[ \t]*(\w+)[ \t]*=\s*(?:\w+\.)?(APIRouter|Blueprint)\s*\(/gm)) {
    const args = argsAt(text, m.index + m[0].length - 1)
    const p = /\b(?:url_)?prefix\s*=\s*(['"])([^'"]*)\1/.exec(args)
    if (p) prefixes.set(m[1], p[2])
  }
  // Flask / Quart / Sanic: @app.route('/x', methods=['GET', 'POST'])
  for (const m of text.matchAll(/@(\w+)\.route\s*\(/g)) {
    if (!inCode(code, text, m.index)) continue
    const args = argsAt(text, m.index + m[0].length - 1)
    const path = firstString(args)
    if (path === null) continue
    const methods = /\bmethods\s*=\s*[[(]([^\])]*)[\])]/.exec(args)
    const list = methods ? methodsIn(methods[1]) : ['GET']
    for (const meth of list.length ? list : ['GET']) r.add(meth, joinRoute(prefixes.get(m[1]) ?? '', path), m.index)
  }
  // FastAPI / Flask 2 / aiohttp RouteTableDef / Litestar-style: @router.get("/x")
  for (const m of text.matchAll(/@(\w+)\.(get|post|put|patch|delete|options|head|api_route|websocket)\s*\(/g)) {
    if (!inCode(code, text, m.index)) continue
    const args = argsAt(text, m.index + m[0].length - 1)
    const path = firstString(args)
    if (path === null) continue
    const full = joinRoute(prefixes.get(m[1]) ?? '', path)
    if (m[2] === 'api_route') {
      const methods = /\bmethods\s*=\s*\[([^\]]*)\]/.exec(args)
      for (const meth of methods ? methodsIn(methods[1]) : ['ANY']) r.add(meth, full, m.index)
    } else r.add(m[2], full, m.index)
  }
  // Bottle-style bare decorators: @route('/x', method='POST'), @get('/x')
  for (const m of text.matchAll(/^[ \t]*@(route|get|post|put|delete|patch)\s*\(\s*(['"])([^'"]*)\2([^)]*)\)/gm)) {
    if (!inCode(code, text, m.index)) continue
    const meth = m[1] === 'route' ? (/\bmethod\s*=\s*(['"])(\w+)\1/.exec(m[4])?.[2] ?? 'GET') : m[1]
    r.add(meth, joinRoute('', m[3]), m.index)
  }
  // Django urls.py
  if (basename(filePath) === 'urls.py' || /\burlpatterns\s*=/.test(code)) {
    for (const m of text.matchAll(/\b(path|re_path|url)\s*\(\s*r?(['"])([^'"]*)\2\s*,\s*([^\n]*)/g)) {
      if (!inCode(code, text, m.index)) continue
      if (/^\s*include\s*\(/.test(m[4])) continue
      const raw = m[1] === 'path' ? m[3] : m[3].replace(/^\^/, '').replace(/\$$/, '')
      r.add('ANY', joinRoute('', raw), m.index)
    }
  }
  // Django REST framework routers
  for (const m of text.matchAll(/\b\w+\.register\s*\(\s*r?(['"])([^'"]*)\1/g)) {
    if (inCode(code, text, m.index) && /Router\s*\(/.test(code)) r.add('ANY', joinRoute('', m[2]), m.index)
  }
  // aiohttp: app.router.add_get('/x', h), web.get('/x', h), add_route('POST', '/x', h)
  for (const m of text.matchAll(/\.add_(get|post|put|patch|delete|head|options|route)\s*\(\s*(?:(['"])(\w+)\2\s*,\s*)?(['"])(\/[^'"]*)\4/g)) {
    if (inCode(code, text, m.index)) r.add(m[1] === 'route' ? (m[3] ?? 'ANY') : m[1], m[5], m.index)
  }
  for (const m of text.matchAll(/\bweb\.(get|post|put|patch|delete|head|route)\s*\(\s*(?:(['"])(\w+)\2\s*,\s*)?(['"])(\/[^'"]*)\4/g)) {
    if (inCode(code, text, m.index)) r.add(m[1] === 'route' ? (m[3] ?? 'ANY') : m[1], m[5], m.index)
  }
  // Starlette: Route('/x', endpoint, methods=[...]); Tornado: (r"/x", XHandler)
  for (const m of text.matchAll(/\b(Route|WebSocketRoute)\s*\(\s*(['"])(\/[^'"]*)\2([^)]*)\)/g)) {
    if (!inCode(code, text, m.index)) continue
    if (m[1] === 'WebSocketRoute') r.add('WS', m[3], m.index)
    else {
      const methods = /\bmethods\s*=\s*\[([^\]]*)\]/.exec(m[4])
      for (const meth of methods ? methodsIn(methods[1]) : ['GET']) r.add(meth, m[3], m.index)
    }
  }
  for (const m of text.matchAll(/\(\s*r?(['"])(\/[^'"]*)\1\s*,\s*[A-Z]\w*Handler\b/g)) {
    if (inCode(code, text, m.index)) r.add('ANY', m[2].replace(/\$$/, ''), m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ruby (Rails routes.rb, Sinatra)
// ─────────────────────────────────────────────────────────────────────────────

const RAILS_PLURAL: [action: string, method: string, suffix: string][] = [
  ['index', 'GET', ''],
  ['create', 'POST', ''],
  ['new', 'GET', '/new'],
  ['edit', 'GET', '/:id/edit'],
  ['show', 'GET', '/:id'],
  ['update', 'PATCH', '/:id'],
  ['update', 'PUT', '/:id'],
  ['destroy', 'DELETE', '/:id'],
]
const RAILS_SINGULAR: [string, string, string][] = [
  ['create', 'POST', ''],
  ['new', 'GET', '/new'],
  ['edit', 'GET', '/edit'],
  ['show', 'GET', ''],
  ['update', 'PATCH', ''],
  ['update', 'PUT', ''],
  ['destroy', 'DELETE', ''],
]

function symbolsList(s: string | undefined): string[] {
  if (!s) return []
  return [...s.matchAll(/:?(\w+)/g)].map((m) => m[1])
}

function filterActions<T extends [string, string, string]>(actions: T[], opts: string): T[] {
  const only = /\bonly:\s*(\[[^\]]*\]|%i\[[^\]]*\]|:\w+)/.exec(opts)
  const except = /\bexcept:\s*(\[[^\]]*\]|%i\[[^\]]*\]|:\w+)/.exec(opts)
  let out = actions
  if (only) {
    const keep = new Set(symbolsList(only[1].replace(/^%i/, '')))
    out = out.filter((a) => keep.has(a[0]))
  }
  if (except) {
    const drop = new Set(symbolsList(except[1].replace(/^%i/, '')))
    out = out.filter((a) => !drop.has(a[0]))
  }
  return out
}

function singularize(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y')
  if (/(?:ss|us)$/.test(word)) return word
  return word.replace(/s$/, '')
}

/** One open `do … end` block in routes.rb. */
type RailsBlock =
  | { type: 'path'; path: string }
  | { type: 'resource'; path: string; param: string }
  | { type: 'member' }
  | { type: 'collection' }
  | { type: 'other' }

function railsPrefix(stack: RailsBlock[]): string {
  let p = ''
  for (let k = 0; k < stack.length; k++) {
    const b = stack[k]
    if (b.type === 'path') p = joinRoute(p, b.path)
    else if (b.type === 'resource') {
      p = joinRoute(p, b.path)
      const next = stack[k + 1]
      if (next?.type === 'member') p = joinRoute(p, ':id')
      else if (next?.type !== 'collection' && b.param) p = joinRoute(p, b.param)
    }
  }
  return p
}

function railsRoutes(text: string, code: string, r: Routes): void {
  const textLines = text.split('\n')
  const codeLines = code.split('\n')
  const stack: RailsBlock[] = []
  const prefix = () => railsPrefix(stack)
  for (let i = 0; i < textLines.length; i++) {
    const t = textLines[i]
    const c = codeLines[i] ?? ''
    const line = i + 1
    // Blank lines (and lines of only string text) hold no routes; skipping them keeps files of blank lines fast.
    if (!/\S/.test(c)) continue
    const opensBlock = /\bdo\s*(?:\|[^|]*\|\s*)?$/.test(c)
    if (/^\s*end\b/.test(c)) {
      stack.pop()
      continue
    }
    let m = /^\s*(get|post|put|patch|delete|options|head|match)\s*(?:\(\s*)?(['"])([^'"]*)\2(.*)$/.exec(t)
    if (m) {
      const via = /\bvia:\s*(\[[^\]]*\]|:\w+)/.exec(m[4])
      const methods = m[1] === 'match' ? (via ? methodsIn(via[1]) : ['ANY']) : [m[1]]
      const target = m[3].split(/\s*=>/)[0] ?? m[3]
      for (const meth of methods.length ? methods : ['ANY']) r.addAtLine(meth, joinRoute(prefix(), target), line)
      if (opensBlock) stack.push({ type: 'other' })
      continue
    }
    m = /^\s*(get|post|put|patch|delete)\s+:(\w+)/.exec(t)
    if (m) {
      r.addAtLine(m[1], joinRoute(prefix(), m[2]), line)
      if (opensBlock) stack.push({ type: 'other' })
      continue
    }
    if (/^\s*root\b/.test(t)) {
      r.addAtLine('GET', joinRoute(prefix(), '/'), line)
      continue
    }
    m = /^\s*(resources|resource)\s+((?::\w+\s*(?:,\s*)?)+)(.*)$/.exec(t)
    if (m) {
      const names = symbolsList(m[2])
      const opts = m[3]
      const plural = m[1] === 'resources'
      const pathOpt = /\bpath:\s*(['"])([^'"]*)\1/.exec(opts)?.[2]
      for (const name of names) {
        const base = joinRoute(prefix(), pathOpt ?? name)
        for (const [, meth, suffix] of filterActions(plural ? RAILS_PLURAL : RAILS_SINGULAR, opts)) r.addAtLine(meth, base + suffix, line)
      }
      if (opensBlock) {
        const last = names[names.length - 1] ?? ''
        stack.push({ type: 'resource', path: pathOpt ?? last, param: plural ? `:${singularize(last)}_id` : '' })
      }
      continue
    }
    m = /^\s*namespace\s+:(\w+)/.exec(t)
    if (m) {
      if (opensBlock) stack.push({ type: 'path', path: m[1] })
      continue
    }
    if (/^\s*scope\b/.test(t)) {
      const sm = /^\s*scope\s*(?:\(\s*)?(?:(['"])([^'"]*)\1|:(\w+)\b(?!:)|path:\s*(['"])([^'"]*)\4)?/.exec(t)
      if (opensBlock) stack.push({ type: 'path', path: sm?.[2] ?? sm?.[5] ?? sm?.[3] ?? '' })
      continue
    }
    m = /^\s*mount\s+[\w:]+(?:\.\w+)*\s*(?:=>|,\s*at:)\s*(['"])([^'"]*)\1/.exec(t)
    if (m) {
      r.addAtLine('ANY', joinRoute(prefix(), m[2]), line)
      continue
    }
    if (opensBlock) {
      if (/^\s*member\b/.test(c)) stack.push({ type: 'member' })
      else if (/^\s*collection\b/.test(c)) stack.push({ type: 'collection' })
      else stack.push({ type: 'other' })
    }
  }
}

function sinatraRoutes(text: string, code: string, r: Routes): void {
  for (const m of text.matchAll(/^[ \t]*(get|post|put|patch|delete|options|head)\s*(?:\(\s*)?(['"])(\/[^'"]*)\2\s*(?:\)\s*)?(?:do\b|\{)/gm)) {
    if (inCode(code, text, m.index)) r.add(m[1], m[3], m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHP (Laravel, Symfony, Slim)
// ─────────────────────────────────────────────────────────────────────────────

function phpRoutes(raw: string, text: string, code: string, r: Routes): void {
  // Prefix groups: Route::prefix('admin')->group(function () { … }) / Route::group(['prefix' => 'admin'], …).
  // Each group covers the code between its opening "{" and the matching "}".
  const groups: { start: number; end: number; prefix: string }[] = []
  let braces: Map<number, number> | null = null
  for (const m of text.matchAll(/Route::(?:prefix\s*\(\s*(['"])([^'"]*)\1\s*\)[^;{]{0,300}?->group|group\s*\(\s*\[[^\]]{0,300}?['"]prefix['"]\s*=>\s*(['"])([^'"]*)\3)/g)) {
    if (!inCode(code, text, m.index)) continue
    const open = code.indexOf('{', m.index)
    if (open === -1) continue
    // Matching braces are found once for the whole file (re-scanning from every group would be quadratic).
    braces ??= matchingBraces(code)
    groups.push({ start: open, end: braces.get(open) ?? code.length, prefix: m[2] ?? m[4] ?? '' })
    if (groups.length >= MAX_ROUTES) break
  }
  const prefixAt = (offset: number) => {
    let p = ''
    for (const g of groups) if (g.start < offset && offset < g.end) p = joinRoute(p, g.prefix)
    return p
  }
  for (const m of text.matchAll(/Route::(get|post|put|patch|delete|options|any|match)\s*\(\s*(?:(\[[^\]]*\])\s*,\s*)?(['"])([^'"]*)\3/g)) {
    if (!inCode(code, text, m.index)) continue
    const methods = m[1] === 'match' ? methodsIn(m[2] ?? '') : [m[1]]
    for (const meth of methods.length ? methods : ['ANY']) r.add(meth, joinRoute(prefixAt(m.index), m[4]), m.index)
  }
  for (const m of text.matchAll(/Route::(resource|apiResource)\s*\(\s*(['"])([^'"]+)\2/g)) {
    if (!inCode(code, text, m.index)) continue
    const base = joinRoute(prefixAt(m.index), m[3])
    const param = `{${singularize(m[3].split(/[./]/).pop() ?? 'id')}}`
    const actions: [string, string][] = [
      ['GET', ''],
      ['POST', ''],
      ['GET', `/${param}`],
      ['PUT', `/${param}`],
      ['PATCH', `/${param}`],
      ['DELETE', `/${param}`],
    ]
    if (m[1] === 'resource') actions.splice(1, 0, ['GET', '/create'], ['GET', `/${param}/edit`])
    for (const [meth, suffix] of actions) r.add(meth, base + suffix, m.index)
  }
  // Symfony attributes #[Route('/x', methods: ['GET'])] and annotations @Route("/x", methods={"GET"}) (in doc comments).
  const symfony = [...raw.matchAll(/(?:#\[|@)Route\s*\(/g)]
  if (symfony.length) {
    let classPrefix = ''
    for (const m of symfony) {
      const args = argsAt(raw, m.index + m[0].length - 1)
      const path = /\bpath\s*[:=]\s*(['"])([^'"]*)\1/.exec(args)?.[2] ?? firstString(args) ?? ''
      const after = raw.slice(m.index + m[0].length + args.length, m.index + m[0].length + args.length + 400)
      const isClass = /^[^]*?\b(?:class|function)\b/.exec(after)?.[0].endsWith('class') ?? false
      if (isClass) {
        classPrefix = path
        continue
      }
      const methods = /\bmethods\s*[:=]\s*[[{]([^\]}]*)[\]}]/.exec(args)
      for (const meth of methods ? methodsIn(methods[1]) : ['ANY']) r.add(meth, joinRoute(classPrefix, path), m.index)
    }
  }
  // Slim / CodeIgniter: $app->get('/x', …), $routes->get('x', …)
  for (const m of text.matchAll(/\$(\w+)\s*->\s*(get|post|put|patch|delete|options|any|map|add)\s*\(\s*(['"])([^'"]*)\3/g)) {
    if (!inCode(code, text, m.index)) continue
    if (m[1] !== 'routes' && !m[4].startsWith('/')) continue
    r.add(m[2], joinRoute('', m[4]), m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Go
// ─────────────────────────────────────────────────────────────────────────────

function goRoutes(text: string, code: string, r: Routes): void {
  const varPrefix = new Map<string, string>()
  for (const m of text.matchAll(/(?<!\w)(\w+)\s*:?=\s*(\w+)\s*\.\s*Group\s*\(\s*"([^"]*)"/g)) {
    varPrefix.set(m[1], joinRoute(varPrefix.get(m[2]) ?? '', m[3]))
  }
  // chi: r.Route("/articles", func(r chi.Router) { … }) — nested prefixes by block depth.
  const depths = lineDepths(code)
  const textLines = text.split('\n')
  const blocks: { depth: number; prefix: string }[] = []
  let offset = 0
  for (let i = 0; i < textLines.length; i++) {
    const t = textLines[i]
    const d = depths[i] ?? 0
    while (blocks.length && d < blocks[blocks.length - 1].depth) blocks.pop()
    // Every route call has a "." (r.GET, r.Route): other lines are skipped cheaply.
    if (!t.includes('.')) {
      offset += t.length + 1
      continue
    }
    const blockPrefix = blocks.reduce((acc, b) => joinRoute(acc, b.prefix), '')
    const route = /(?<!\w)(\w+)\s*\.\s*Route\s*\(\s*"([^"]*)"\s*,\s*func/.exec(t)
    if (route && inCode(code, text, offset + route.index)) blocks.push({ depth: d + 1, prefix: route[2] })
    for (const m of t.matchAll(/(?<!\w)(\w+)\s*\.\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All|Handle|HandleFunc|Method|MethodFunc)\s*\(\s*(?:"(\w+)"\s*,\s*)?"([^"]*)"/g)) {
      if (!inCode(code, text, offset + m.index)) continue
      const recv = m[1]
      let method = m[2]
      let path = m[4]
      if (recv === 'http' && !/^Handle/.test(method)) continue
      if (method === 'Method' || method === 'MethodFunc') method = m[3] ?? 'ANY'
      if (/^Handle/.test(method)) {
        const pat = /^([A-Z]+)\s+(\/.*)$/.exec(path)
        if (pat) {
          method = pat[1]
          path = pat[2]
        } else {
          const chained = /^\s*\)?[^\n]*?\.Methods\s*\(([^)]*)\)/.exec(t.slice(m.index + m[0].length))
          method = chained ? (methodsIn(chained[1])[0] ?? 'ANY') : 'ANY'
        }
      }
      if (!path.startsWith('/') && path !== '*' && path !== '') continue
      const full = joinRoute(joinRoute(blockPrefix, varPrefix.get(recv) ?? ''), path)
      r.addAtLine(method, full, i + 1)
    }
    offset += t.length + 1
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Java / Kotlin (Spring, JAX-RS, Micronaut, Ktor)
// ─────────────────────────────────────────────────────────────────────────────

const JVM_ANNOT = /@(RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|Path|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Controller|RestController|Get|Post|Put|Patch|Delete|Head|Options)\b(\s*\()?/g

function jvmRoutes(text: string, code: string, r: Routes, kotlin: boolean): void {
  let classPrefix = ''
  // Pending JAX-RS method cluster (@GET + @Path("x") on the same method).
  let cluster: { method: string | null; path: string | null; index: number } | null = null
  const flush = () => {
    if (cluster?.method) r.add(cluster.method, joinRoute(classPrefix, cluster.path ?? ''), cluster.index)
    cluster = null
  }
  // Annotations inside another annotation's arguments are skipped (and a run of unclosed ones is read once, not again
  // from every "@").
  let argsEnd = 0
  let seen = 0
  for (const m of text.matchAll(JVM_ANNOT)) {
    // Each annotation looks a little way ahead; thousands of them only happen in generated or hostile files.
    if (++seen > MAX_ANNOTATIONS || r.full()) break
    if (m.index < argsEnd || !inCode(code, text, m.index)) continue
    const name = m[1]
    const args = m[2] ? argsAt(text, m.index + m[0].length - 1) : ''
    const end = m.index + m[0].length + (m[2] ? args.length + 1 : 0)
    argsEnd = end
    const after = code.slice(end, end + 300)
    const targetsClass = /^\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|internal|abstract|final|open|data|sealed)\s+)*(?:class|interface|object)\b/.test(after)
    const pathArg = (/\b(?:value|path)\s*=\s*(\{[^}]*\}|\[[^\]]*\]|"[^"]*")/.exec(args)?.[1] ?? args).trim()
    const paths = allStrings(pathArg)
    if (targetsClass) {
      if (name === 'RequestMapping' || name === 'Path' || name === 'Controller') classPrefix = paths[0] ?? classPrefix
      continue
    }
    if (name === 'RestController') continue
    if (name === 'Controller') {
      classPrefix = paths[0] ?? classPrefix
      continue
    }
    if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) {
      if (cluster && cluster.method) flush()
      cluster = cluster ?? { method: null, path: null, index: m.index }
      cluster.method = name
      cluster.index = Math.min(cluster.index, m.index)
      // Flush once the method declaration follows (a later @Path on the same method still belongs to it).
      if (/^\s*(?:@(?!Path\b)[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|final|abstract|suspend|override|open|fun|synchronized)\s+)*(?:fun\b|(?:[\w<>[\],.?]+\s+)+\w+\s*\()/.test(after)) flush()
      continue
    }
    if (name === 'Path') {
      cluster = cluster ?? { method: null, path: null, index: m.index }
      cluster.path = paths[0] ?? ''
      if (cluster.method) flush()
      continue
    }
    if (cluster) flush()
    let methods: string[]
    if (name === 'RequestMapping') {
      methods = /RequestMethod\.(\w+)/.test(args) ? [...args.matchAll(/RequestMethod\.(\w+)/g)].map((x) => x[1]) : ['ANY']
    } else methods = [name.replace(/Mapping$/, '')]
    for (const meth of methods) for (const p of paths.length ? paths : ['']) r.add(meth, joinRoute(classPrefix, p), m.index)
  }
  flush()
  // Ktor routing DSL
  if (kotlin && /\b(?:routing|route)\s*[({]/.test(code)) {
    const depths = lineDepths(code)
    const textLines = text.split('\n')
    const blocks: { depth: number; prefix: string }[] = []
    for (let i = 0; i < textLines.length; i++) {
      const t = textLines[i]
      const d = depths[i] ?? 0
      while (blocks.length && d < blocks[blocks.length - 1].depth) blocks.pop()
      if (!/\S/.test(t)) continue
      const prefix = blocks.reduce((acc, b) => joinRoute(acc, b.prefix), '')
      const route = /^\s*route\s*\(\s*"([^"]*)"\s*\)\s*\{/.exec(t)
      if (route) {
        blocks.push({ depth: d + 1, prefix: route[1] })
        continue
      }
      const verb = /^\s*(get|post|put|patch|delete|head|options)\s*(?:\(\s*(?:"([^"]*)"\s*)?\)\s*)?\{/.exec(t)
      if (verb) r.addAtLine(verb[1], joinRoute(prefix, verb[2] ?? ''), i + 1)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C# (ASP.NET Core)
// ─────────────────────────────────────────────────────────────────────────────

function csharpRoutes(text: string, code: string, r: Routes): void {
  let classPrefix = ''
  let className = ''
  let methodRoute: string | null = null
  const attrs = [...text.matchAll(/\[(Route|Http(Get|Post|Put|Patch|Delete|Head|Options))\b(\s*\()?/g)].filter((m) => inCode(code, text, m.index))
  // Attributes inside another attribute's arguments are skipped (a run of unclosed ones is read once).
  let argsEnd = 0
  for (const [n, m] of attrs.entries()) {
    if (n >= MAX_ANNOTATIONS || r.full()) break
    if (m.index < argsEnd) continue
    const args = m[3] ? argsAt(text, m.index + m[0].length - 1) : ''
    const end = m.index + m[0].length + (m[3] ? args.length + 1 : 0)
    argsEnd = end
    const after = code.slice(end, end + 400)
    const cls = /^\s*(?:\]\s*)?(?:\[[^\]]*\]\s*)*(?:(?:public|internal|sealed|abstract|partial|static)\s+)*class\s+(\w+)/.exec(after)
    const arg = firstString(args)
    if (m[1] === 'Route') {
      if (cls) {
        className = cls[1].replace(/Controller$/, '')
        classPrefix = (arg ?? '').replace(/\[controller\]/gi, className)
      } else methodRoute = arg
      continue
    }
    const local = arg ?? methodRoute ?? ''
    methodRoute = null
    const path = local.startsWith('/') || local.startsWith('~/') ? joinRoute('', local.replace(/^~/, '')) : joinRoute(classPrefix, local)
    r.add(m[2], path.replace(/\[controller\]/gi, className).replace(/\[action\]/gi, ''), m.index)
  }
  const groups = new Map<string, string>()
  for (const m of text.matchAll(/(?:var|RouteGroupBuilder)\s+(\w+)\s*=\s*(\w+)\s*\.\s*MapGroup\s*\(\s*"([^"]*)"/g)) {
    groups.set(m[1], joinRoute(groups.get(m[2]) ?? '', m[3]))
  }
  for (const m of text.matchAll(/(?<!\w)(\w+)\s*\.\s*Map(Get|Post|Put|Patch|Delete|Methods|Fallback)?\s*\(\s*"([^"]*)"(\s*,\s*new\s*\[\]\s*\{[^}]*\})?/g)) {
    if (!inCode(code, text, m.index) || m[2] === 'Fallback' || m[2] === undefined) continue
    const methods = m[2] === 'Methods' ? methodsIn(m[4] ?? '') : [m[2]]
    for (const meth of methods.length ? methods : ['ANY']) r.add(meth, joinRoute(groups.get(m[1]) ?? '', m[3]), m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rust (Actix, Rocket, Axum)
// ─────────────────────────────────────────────────────────────────────────────

function rustRoutes(text: string, code: string, r: Routes): void {
  for (const m of text.matchAll(/#\[\s*(?:actix_web::)?(get|post|put|patch|delete|head|options)\s*\(\s*"([^"]*)"/g)) {
    if (inCode(code, text, m.index)) r.add(m[1], m[2], m.index)
  }
  for (const m of text.matchAll(/#\[\s*route\s*\(\s*"([^"]*)"([^\]]*)\]/g)) {
    if (!inCode(code, text, m.index)) continue
    const methods = [...m[2].matchAll(/method\s*=\s*"(\w+)"/g)].map((x) => x[1])
    for (const meth of methods.length ? methods : ['ANY']) r.add(meth, m[1], m.index)
  }
  // Axum: .route("/x", get(h).post(h2)); Actix: .route("/x", web::get().to(h))
  for (const m of text.matchAll(/\.\s*route\s*\(\s*"([^"]*)"\s*,/g)) {
    if (!inCode(code, text, m.index)) continue
    const args = argsAt(text, m.index + m[0].indexOf('('))
    const methods = new Set<string>()
    for (const x of args.matchAll(/(?:^|[\s,.(:])(get|post|put|patch|delete|head|options|any)\s*(?:::<[^>]*>\s*)?\(/g)) methods.add(normalizeMethod(x[1]))
    for (const meth of methods.size ? methods : ['ANY']) r.add(meth, m[1], m.index)
  }
  // Actix: web::resource("/x").route(web::get().to(h))
  for (const m of text.matchAll(/web::resource\s*\(\s*"([^"]*)"\s*\)/g)) {
    if (!inCode(code, text, m.index)) continue
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 400).split(/web::resource|;/)[0] ?? ''
    const methods = new Set([...tail.matchAll(/web::(get|post|put|patch|delete|head)\s*\(/g)].map((x) => normalizeMethod(x[1])))
    for (const meth of methods.size ? methods : ['ANY']) r.add(meth, m[1], m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Elixir (Phoenix), Swift (Vapor), Dart (shelf_router)
// ─────────────────────────────────────────────────────────────────────────────

const PHOENIX_RESOURCES: [string, string, string][] = [
  ['index', 'GET', ''],
  ['edit', 'GET', '/:id/edit'],
  ['new', 'GET', '/new'],
  ['show', 'GET', '/:id'],
  ['create', 'POST', ''],
  ['update', 'PATCH', '/:id'],
  ['update', 'PUT', '/:id'],
  ['delete', 'DELETE', '/:id'],
]

function phoenixRoutes(text: string, code: string, r: Routes): void {
  if (!/\buse\s+\w+(?:Web)?,\s*:router\b|Phoenix\.Router/.test(code)) return
  const textLines = text.split('\n')
  const codeLines = code.split('\n')
  const stack: string[] = []
  const prefix = () => stack.reduce((acc, p) => joinRoute(acc, p), '')
  for (let i = 0; i < textLines.length; i++) {
    const t = textLines[i]
    const c = codeLines[i] ?? ''
    if (!/\S/.test(c)) continue
    const opens = /\bdo\s*$/.test(c)
    if (/^\s*end\b/.test(c)) {
      stack.pop()
      continue
    }
    let m = /^\s*scope\s+"([^"]*)"/.exec(t)
    if (m) {
      if (opens) stack.push(m[1])
      continue
    }
    m = /^\s*(get|post|put|patch|delete|options|head|live|forward|match)\s+"([^"]*)"/.exec(t)
    if (m) {
      r.addAtLine(m[1] === 'live' ? 'GET' : m[1] === 'forward' || m[1] === 'match' ? 'ANY' : m[1], joinRoute(prefix(), m[2]), i + 1)
      if (opens) stack.push('')
      continue
    }
    m = /^\s*resources\s+"([^"]*)"\s*,\s*[\w.]+(.*)$/.exec(t)
    if (m) {
      const base = joinRoute(prefix(), m[1])
      for (const [, meth, suffix] of filterActions(PHOENIX_RESOURCES, m[2])) r.addAtLine(meth, base + suffix, i + 1)
      if (opens) stack.push(`${m[1]}/:${singularize(m[1].split('/').pop() ?? 'id')}_id`)
      continue
    }
    if (opens) stack.push('')
  }
}

function vaporRoutes(text: string, code: string, r: Routes): void {
  if (!/\bimport\s+Vapor\b/.test(code)) return
  const groups = new Map<string, string>()
  for (const m of text.matchAll(/let\s+(\w+)\s*=\s*(\w+)\s*\.\s*grouped\s*\(([^)]*)\)/g)) {
    groups.set(m[1], joinRoute(groups.get(m[2]) ?? '', allStrings(m[3]).join('/')))
  }
  for (const m of text.matchAll(/(?<!\w)(\w+)\s*\.\s*(get|post|put|patch|delete)\s*\(([^)\n]{0,500})\)(\s*\{)?/g)) {
    if (!inCode(code, text, m.index)) continue
    if (!m[4] && !/\buse\s*:/.test(m[3])) continue
    const segs = allStrings(m[3]).filter((s) => s !== '')
    r.add(m[2], joinRoute(groups.get(m[1]) ?? '', segs.join('/')), m.index)
  }
}

function dartRoutes(text: string, code: string, r: Routes): void {
  if (!/shelf_router|dart_frog|alfred/.test(text)) return
  for (const m of text.matchAll(/(?:(?<!\w)\w+|\.)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*(['"])(\/[^'"]*)\2/g)) {
    if (inCode(code, text, m.index)) r.add(m[1], m[3], m.index)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect HTTP endpoints defined in a file (best effort, regex-based):
 * Express/Koa/Fastify/Hono (app.get('/x'), router.post(...), fastify.route({method, url})), NestJS decorators
 * (@Get('x') inside @Controller('prefix')), Next.js route handlers (app/.../route.ts exports GET/POST → path from folder),
 * Next.js pages/api files, SvelteKit +server.ts, Astro endpoints, Nuxt server/api, Remix loaders/actions,
 * Flask (@app.route('/x', methods=[…]), @bp.get, Blueprint url_prefix), FastAPI (@app.get, @router.post, APIRouter
 * prefix), Django urls.py (path('x/', view)), DRF routers, aiohttp, Starlette, Tornado, Rails routes.rb (get 'x',
 * resources :users with only/except, nested resources, namespace/scope), Sinatra, Laravel (Route::get, resource,
 * prefix groups), Symfony #[Route], Slim, Go net/http (incl. "GET /x" patterns) & gin/echo/chi/fiber/gorilla
 * (r.GET("/x"), groups, chi Route blocks), Spring (@GetMapping("/x"), @RequestMapping on class + method), JAX-RS,
 * Micronaut, Ktor, ASP.NET ([HttpGet("x")] with [Route] prefixes, app.MapGet("/x"), MapGroup), Actix/Rocket/Axum
 * (.route("/x", get(handler)), #[get("/x")]), Phoenix router, Vapor, Dart shelf_router.
 * Return at most 100 routes per file.
 */
export function extractRoutes(path: string, content: string, language: string): RouteInfo[] {
  if (!content || content.length > MAX_CONTENT) return []
  const lang = (language || detectLanguage(path)?.name || '').toLowerCase()
  const family = languageFamily(lang)
  const r = new Routes(content)
  try {
    const { text, code } = maskSource(content, lang)
    switch (family) {
      case 'js':
        if (lang === 'vue' || lang === 'svelte' || lang === 'astro') break
        if (!fileRoutes(path, text, code, r)) jsRoutes(text, code, r)
        break
      case 'python':
        pythonRoutes(path, text, code, r)
        break
      case 'ruby':
        if (/(?:^|\/)config\/routes(?:\.rb$|\/)/.test(path)) railsRoutes(text, code, r)
        else sinatraRoutes(text, code, r)
        break
      case 'php':
        phpRoutes(content, text, code, r)
        break
      case 'go':
        goRoutes(text, code, r)
        break
      case 'jvm':
        jvmRoutes(text, code, r, lang === 'kotlin')
        break
      case 'csharp':
        csharpRoutes(text, code, r)
        break
      case 'rust':
        rustRoutes(text, code, r)
        break
      case 'elixir':
        phoenixRoutes(text, code, r)
        break
      case 'swift':
        vaporRoutes(text, code, r)
        break
      case 'dart':
        dartRoutes(text, code, r)
        break
    }
  } catch {
    // Route detection is best effort.
  }
  return r.list.sort((a, b) => a.line - b.line)
}
