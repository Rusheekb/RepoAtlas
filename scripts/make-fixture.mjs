#!/usr/bin/env node
/**
 * Build an offline GitHub fixture from a local git checkout, for end-to-end tests.
 *
 *   node scripts/make-fixture.mjs <checkout-dir> <owner/repo> <out.json> [description]
 *
 * The output mimics what the app fetches from api.github.com (repo meta, commit, tree)
 * and raw.githubusercontent.com (file contents), so the browser test can serve it via
 * request interception without any network access.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [dir, fullName, out, description = null] = process.argv.slice(2)
if (!dir || !fullName || !out) {
  console.error('usage: make-fixture.mjs <checkout-dir> <owner/repo> <out.json> [description]')
  process.exit(1)
}
const [owner, repo] = fullName.split('/')
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

let commitSha
try {
  commitSha = git('rev-parse', 'HEAD').trim()
} catch {
  commitSha = createHash('sha1').update(fullName).digest('hex')
}
const paths = git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean)

const tree = []
const files = {}
for (const p of paths) {
  let buf
  try {
    if (!statSync(join(dir, p)).isFile()) continue
    buf = readFileSync(join(dir, p))
  } catch {
    continue
  }
  const sha = createHash('sha1').update(buf).digest('hex')
  tree.push({ path: p, mode: '100644', type: 'blob', sha, size: buf.length })
  if (buf.length <= 600 * 1024 && !buf.subarray(0, 8000).includes(0)) files[p] = buf.toString('utf8')
}

const meta = {
  name: repo,
  full_name: `${owner}/${repo}`,
  owner: { login: owner, avatar_url: '' },
  description,
  homepage: null,
  html_url: `https://github.com/${owner}/${repo}`,
  stargazers_count: 1234,
  forks_count: 321,
  open_issues_count: 12,
  default_branch: 'main',
  topics: [],
  license: { spdx_id: 'MIT', name: 'MIT License' },
  language: null,
  created_at: '2020-01-01T00:00:00Z',
  pushed_at: '2026-10-01T00:00:00Z',
  size: Math.round(tree.reduce((s, t) => s + t.size, 0) / 1024),
  private: false,
  fork: false,
  archived: false,
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ owner, repo, commitSha, meta, tree, files }))
console.log(`fixture ${fullName}: ${tree.length} files (${Object.keys(files).length} text) → ${out}`)
