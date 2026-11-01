#!/usr/bin/env node
/**
 * End-to-end smoke test against the built app (`npm run build && npx vite preview --port 4173`).
 * Uses offline GitHub fixtures (e2e/.fixtures/*.json) and a mocked Claude API.
 *
 *   node e2e/smoke.cjs [--base http://localhost:4173/] [--shots <dir>] [--repo owner/repo] [--theme light|dark] [--mobile]
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { loadFixtures, installMocks } = require('./mocks.cjs')

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? def : args[i + 1]
}
const BASE = arg('base', 'http://localhost:4173/')
const SHOTS = arg('shots', path.join(__dirname, '..', 'test-results', 'shots'))
const THEME = arg('theme', 'light')
const MOBILE = args.includes('--mobile')
const fixtures = loadFixtures(path.join(__dirname, '.fixtures'))
const REPOS = arg('repo', null) ? [arg('repo')] : [...fixtures.keys()]
fs.mkdirSync(SHOTS, { recursive: true })

const VIEWS = ['', 'map', 'codemap', 'concepts', 'tours', 'explore', 'ask', 'quiz', 'glossary']
const failures = []
const fail = (msg) => {
  failures.push(msg)
  console.log(`  ✗ ${msg}`)
}
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function newContext(browser, settings) {
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: THEME,
    isMobile: MOBILE,
    hasTouch: MOBILE,
  })
  if (settings) {
    await context.addInitScript((s) => {
      localStorage.setItem('repoatlas:settings', JSON.stringify({ state: s, version: 1 }))
    }, settings)
  }
  return context
}

function watch(page, label) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|favicon|404/.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return () => {
    for (const e of errors.splice(0)) fail(`${label}: ${e}`)
  }
}

async function waitForReady(page) {
  // Repo is ready when the loading screen is gone and the main nav is visible.
  await page.waitForFunction(() => !document.body.innerText.match(/Reading \d+ of \d+ files|Finding .* on GitHub|Mapping how the pieces/), null, { timeout: 30000 })
  await page.waitForTimeout(600)
}

async function run() {
  const browser = await chromium.launch()
  const suffix = `${THEME}${MOBILE ? '-mobile' : ''}`

  // 1) Home page + navigation via the input.
  {
    const context = await newContext(browser)
    await installMocks(context, fixtures)
    const page = await context.newPage()
    const flush = watch(page, 'home')
    await page.goto(BASE)
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(SHOTS, `home-${suffix}.png`), fullPage: true })
    const input = page.locator('input[type="text"], input[type="search"], input:not([type])').first()
    if (await input.count()) {
      await input.fill('not a repo !!')
      await input.press('Enter')
      await page.waitForTimeout(300)
      if (!page.url().includes('#/gh/')) ok('rejects invalid input')
      else fail('invalid input navigated')
      await input.fill(`https://github.com/${REPOS[0]}`)
      await input.press('Enter')
      await page.waitForURL(/#\/gh\//, { timeout: 5000 }).then(() => ok('navigates from home input'), () => fail('home input did not navigate'))
      await waitForReady(page).catch(() => fail('repo did not finish loading from home'))
    } else fail('home: no input found')
    flush()
    await context.close()
  }

  // 2) Every view for every repo (no AI key).
  for (const repo of REPOS) {
    console.log(`\n▶ ${repo} (${suffix})`)
    const context = await newContext(browser)
    await installMocks(context, fixtures)
    const page = await context.newPage()
    const flush = watch(page, repo)
    const slug = repo.replace('/', '__')
    for (const view of VIEWS) {
      const url = `${BASE}#/gh/${repo}${view ? `/${view}` : ''}`
      await page.goto(url)
      try {
        await waitForReady(page)
      } catch {
        fail(`${repo}/${view || 'overview'}: did not finish loading`)
      }
      await page.waitForTimeout(view === 'map' || view === 'concepts' ? 1500 : 800)
      const text = await page.locator('body').innerText()
      if (/coming soon|TODO/i.test(text)) fail(`${repo}/${view || 'overview'}: placeholder text present`)
      if (/Something went wrong/i.test(text)) fail(`${repo}/${view || 'overview'}: error screen`)
      await page.screenshot({ path: path.join(SHOTS, `${slug}-${view || 'overview'}-${suffix}.png`), fullPage: view === '' || view === 'glossary' })
      ok(`${view || 'overview'} rendered`)
    }

    // Interactions: click a node on the map → explain panel opens.
    await page.goto(`${BASE}#/gh/${repo}/map`)
    await waitForReady(page)
    await page.waitForTimeout(1500)
    const node = page.locator('.react-flow__node').first()
    if (await node.count()) {
      await node.click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(SHOTS, `${slug}-map-selected-${suffix}.png`) })
      ok('clicked a map node')
    } else fail(`${repo}: no React Flow nodes on the map`)

    // Explorer: open a file deep link.
    const fx = fixtures.get(repo.toLowerCase())
    const someFile = Object.keys(fx.files).find((p) => /\.(py|js|ts|go)$/.test(p) && !/test/i.test(p))
    if (someFile) {
      await page.goto(`${BASE}#/gh/${repo}/explore?file=${encodeURIComponent(someFile)}`)
      await waitForReady(page)
      await page.waitForTimeout(1500)
      const firstCodeLine = fx.files[someFile].split('\n').find((l) => l.trim().length > 12)?.trim()
      const body = await page.locator('body').innerText()
      if (firstCodeLine && body.includes(firstCodeLine.slice(0, 20))) ok(`explorer shows ${someFile}`)
      else fail(`${repo}: explorer did not show content of ${someFile}`)
      await page.screenshot({ path: path.join(SHOTS, `${slug}-explore-file-${suffix}.png`) })
    }
    flush()
    await context.close()
  }

  // 3) AI flows with a mocked Claude.
  {
    const repo = REPOS[0]
    console.log(`\n▶ AI flows on ${repo}`)
    const context = await newContext(browser, {
      anthropicApiKey: 'sk-ant-e2e-test',
      githubToken: '',
      rememberKeys: true,
      model: 'claude-opus-5-5',
      readingLevel: 'beginner',
      contextSize: 'medium',
      analysisDepth: 'standard',
      theme: THEME,
      seenIntro: true,
    })
    const log = await installMocks(context, fixtures)
    const page = await context.newPage()
    const flush = watch(page, 'ai')
    await page.goto(`${BASE}#/gh/${repo}`)
    await waitForReady(page)
    const btn = page.getByRole('button', { name: /explain this project in depth/i }).first()
    if (await btn.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await btn.click()
      await page.getByText('mocked explanation from Claude').first().waitFor({ timeout: 10000 }).then(
        () => ok('overview AI explanation streamed'),
        () => fail('overview AI explanation did not appear'),
      )
      await page.screenshot({ path: path.join(SHOTS, `ai-overview-${suffix}.png`), fullPage: true })
    } else fail('no "Explain this project" button')

    // Concept map generation
    await page.goto(`${BASE}#/gh/${repo}/concepts`)
    await waitForReady(page)
    const gen = page.getByRole('button', { name: /generate a smarter map with claude/i }).first()
    if (await gen.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await gen.click()
      await page.getByText('The application').first().waitFor({ timeout: 10000 }).then(
        () => ok('AI concept map rendered'),
        () => fail('AI concept map did not render'),
      )
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(SHOTS, `ai-concepts-${suffix}.png`) })
    } else fail('no generate button on concepts')

    // Tours generation
    await page.goto(`${BASE}#/gh/${repo}/tours`)
    await waitForReady(page)
    const genT = page.getByRole('button', { name: /generate tours with claude/i }).first()
    if (await genT.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await genT.click()
      await page.getByText('The journey of a request').first().waitFor({ timeout: 10000 }).then(
        () => ok('AI tours rendered'),
        () => fail('AI tours did not render'),
      )
      await page.screenshot({ path: path.join(SHOTS, `ai-tours-${suffix}.png`) })
    } else fail('no generate button on tours')

    // Quiz generation
    await page.goto(`${BASE}#/gh/${repo}/quiz`)
    await waitForReady(page)
    const genQ = page.getByRole('button', { name: /generate a quiz with claude/i }).first()
    if (await genQ.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await genQ.click()
      await page.getByText('What does this project mainly help you build?').first().waitFor({ timeout: 10000 }).then(
        () => ok('AI quiz rendered'),
        () => fail('AI quiz did not render'),
      )
      await page.screenshot({ path: path.join(SHOTS, `ai-quiz-${suffix}.png`) })
    } else fail('no generate button on quiz')

    // Chat
    await page.goto(`${BASE}#/gh/${repo}/ask`)
    await waitForReady(page)
    const box = page.locator('textarea').first()
    if (await box.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await box.fill('What does this project do?')
      await box.press('Enter')
      await page.getByText('mocked explanation from Claude').first().waitFor({ timeout: 10000 }).then(
        () => ok('chat answer streamed'),
        () => fail('chat answer did not appear'),
      )
      await page.screenshot({ path: path.join(SHOTS, `ai-ask-${suffix}.png`) })
    } else fail('no chat textarea')

    // Verify request shape sent to Claude.
    if (log.claudeRequests.length === 0) fail('no Claude requests captured')
    for (const r of log.claudeRequests) {
      const b = r.body
      const h = r.headers
      if (b.model !== 'claude-opus-5-5') fail(`unexpected model ${b.model}`)
      if (b.thinking?.type !== 'adaptive') fail('thinking is not adaptive')
      if (b.fallbacks !== 'default') fail('fallbacks: "default" missing')
      if (!String(h['anthropic-beta'] ?? '').includes('server-side-fallback-2026-07-01')) fail('fallback beta header missing')
      if (h['anthropic-dangerous-direct-browser-access'] !== 'true') fail('browser access header missing')
      if ('temperature' in b || 'top_p' in b || 'top_k' in b) fail('sampling params sent')
      if (!b.output_config?.effort) fail('effort not set')
      const sys = Array.isArray(b.system) ? b.system : []
      if (!sys.some((s) => s.cache_control)) fail('no cache_control on system context')
    }
    const sysTexts = new Set(log.claudeRequests.map((r) => JSON.stringify(r.body.system)))
    if (sysTexts.size === 1) ok(`system prompt byte-stable across ${log.claudeRequests.length} requests (cache-friendly)`)
    else fail(`system prompt varied across requests (${sysTexts.size} variants) — hurts prompt caching`)
    flush()
    await context.close()
  }

  await browser.close()
  console.log(`\n${failures.length ? `✗ ${failures.length} failure(s)` : '✓ all smoke checks passed'} — screenshots in ${SHOTS}`)
  process.exit(failures.length ? 1 : 0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
