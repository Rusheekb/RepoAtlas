import { describe, expect, it } from 'vitest'
import { detectStart, detectStartIn, isOrmModel, looksLikeTest } from './signals'

function fast(fn: () => unknown, maxMs = 400): void {
  const t0 = performance.now()
  fn()
  expect(performance.now() - t0).toBeLessThan(maxMs)
}

describe('bot start signals', () => {
  it('needs a token or a chat library before client.login( means a bot', () => {
    // Django's test client and web sign-in code use the same words.
    const djangoTest = 'class T(TestCase):\n    def test_x(self):\n        self.client.login(username="deleter", password="x")\n'
    expect(detectStartIn(djangoTest, 'python', 'Python')).toBeNull()
    const auth = 'export async function signIn() {\n  await client.login(true, { returnUrl })\n}\n'
    expect(detectStartIn(auth, 'js', 'JavaScript')).toBeNull()

    expect(detectStartIn("const client = new Client()\nclient.login(process.env.TOKEN)\n", 'js', 'JavaScript')?.kind).toBe('bot')
    expect(detectStartIn("const { Client } = require('discord.js')\nconst c = new Client()\nc.client = c\nclient.login(cfg.secret)\n", 'js', 'JavaScript')?.kind).toBe('bot')
  })
})

describe('start signals ignore code inside strings', () => {
  it('does not treat a test fixture holding server code as text as a server', () => {
    const fixture = "export const SAMPLE = {\n  'server.js': 'const app = express()\\napp.listen(3000)',\n}\n"
    expect(detectStartIn(fixture, 'js', 'TypeScript')).toBeNull()
    expect(detectStartIn("const app = express()\napp.listen(3000)\n", 'js', 'JavaScript')?.kind).toBe('server')
  })

  it('still reads Python’s __main__ check and Go’s r.Run(":8080")', () => {
    expect(detectStartIn("def main():\n    pass\n\nif __name__ == '__main__':\n    main()\n", 'python', 'Python')).toEqual({ kind: 'main', line: 4 })
    expect(detectStartIn('package main\n\nfunc main() {\n\tr := gin.Default()\n\tr.Run(":8080")\n}\n', 'go', 'Go')?.kind).toBe('server')
  })
})

describe('shebang lines', () => {
  it('are only a weak hint', () => {
    expect(detectStart('#!/bin/sh\necho hi\n', 'shell')).toEqual({ kind: 'cli', line: 1, weak: true })
    expect(detectStart('#!/usr/bin/env node\nprogram.parse(process.argv)\n', 'js')).toEqual({ kind: 'cli', line: 2 })
  })
})

describe('Go programs', () => {
  it('point at the line where main() starts', () => {
    expect(detectStart('package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}\n', 'go')).toEqual({ kind: 'main', line: 5 })
    expect(detectStart('package lib\n\nfunc main() {}\n', 'go')).toBeNull()
  })
})

describe('two-step command-line rules', () => {
  it('need both parts, in order', () => {
    expect(detectStart('var root = &cobra.Command{Use: "x"}\nfunc main() { root.Execute() }\n', 'go')?.kind).toBe('cli')
    expect(detectStart('var root = &cobra.Command{Use: "x"}\n', 'go')).toBeNull()
    expect(detectStart("const argv = yargs(process.argv.slice(2)).argv\n", 'js')?.kind).toBe('cli')
  })
})

describe('regexes stay fast on hostile files', () => {
  it('handles long runs of blank lines, spaces and one-word lines', () => {
    const blanks = '\n'.repeat(200_000)
    const spaces = ' \n'.repeat(100_000)
    for (const family of ['js', 'python', 'go', 'rust', 'jvm', 'c', 'swift', 'dart', 'ruby'] as const) {
      fast(() => detectStart(blanks, family))
      fast(() => detectStart(spaces, family))
      fast(() => detectStart('a'.repeat(200_000), family))
    }
    fast(() => detectStart('cobra.Command\n'.repeat(20_000), 'go'))
    fast(() => detectStart('yargs\n'.repeat(20_000), 'js'))
    fast(() => detectStart('package main\n'.repeat(20_000), 'go'))
    fast(() => isOrmModel(spaces))
    fast(() => looksLikeTest(`${spaces}pytest`, 'python'))
    fast(() => looksLikeTest('describe x\n'.repeat(20_000), 'ruby'))
  })
})
