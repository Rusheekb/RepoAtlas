#!/usr/bin/env node
/**
 * Screenshot one app URL with GitHub + Claude mocked (offline fixtures in e2e/.fixtures).
 * Start a dev server first, e.g.:  npx vite --port 5181 --strictPort
 *
 *   node e2e/shot.cjs --base http://localhost:5181/ --path "#/gh/pallets/flask/map" --out /tmp/map.png
 *        [--theme light|dark] [--width 1440] [--height 900] [--full] [--key] [--wait 1500]
 *        [--fixtures dir] [--click "css selector"] [--click-text "Visible text"] [--type "selector=>text"]
 *
 * --key      pretend the user saved a Claude API key (mocked Claude answers stream back)
 * Prints any page errors / console errors so you can fix them.
 */
const path = require('node:path')
const { chromium } = require('playwright')
const { loadFixtures, installMocks } = require('./mocks.cjs')

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const all = (n) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []))

;(async () => {
  const base = arg('base', 'http://localhost:5173/')
  const out = arg('out', '/tmp/shot.png')
  const theme = arg('theme', 'light')
  const width = Number(arg('width', '1440'))
  const height = Number(arg('height', '900'))
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1 })
  if (args.includes('--key')) {
    await context.addInitScript(() => {
      localStorage.setItem(
        'repoatlas:settings',
        JSON.stringify({ state: { anthropicApiKey: 'sk-ant-e2e-test', rememberKeys: true, model: 'claude-opus-5-5', seenIntro: true }, version: 1 }),
      )
    })
  }
  await installMocks(context, loadFixtures(arg('fixtures', path.join(__dirname, '.fixtures'))))
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`))
  await page.goto(base + arg('path', ''))
  await page.waitForTimeout(Number(arg('wait', '1500')))
  for (const sel of all('click')) {
    await page.locator(sel).first().click()
    await page.waitForTimeout(700)
  }
  for (const t of all('click-text')) {
    await page.getByText(t, { exact: false }).first().click()
    await page.waitForTimeout(700)
  }
  for (const spec of all('type')) {
    const [sel, text] = spec.split('=>')
    await page.locator(sel).first().fill(text)
    await page.locator(sel).first().press('Enter')
    await page.waitForTimeout(1200)
  }
  await page.screenshot({ path: out, fullPage: args.includes('--full') })
  console.log(`saved ${out}`)
  if (problems.length) console.log(problems.join('\n'))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
