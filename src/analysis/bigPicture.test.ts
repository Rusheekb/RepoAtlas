/**
 * End-to-end checks of "The Big Picture" on small copies of real project shapes, with every analysis step real
 * (no mocks): Spring apps in an "example"/"samples" package, examples-only dev tools, a BSON encoder that isn't a
 * database, Django's test client, and README choice.
 */
import { describe, expect, it } from 'vitest'
import type { RepoSnapshot } from '@/core/types'
import { analyzeRepo, pickReadme } from './analyze'
import { makeMeta } from './structure/testkit'

function snapshot(repo: string, files: Record<string, string>, description: string | null = null): RepoSnapshot {
  return {
    meta: makeMeta({ repo, fullName: `acme/${repo}`, description }),
    ref: 'main',
    commitSha: 'abc',
    tree: Object.entries(files).map(([path, text]) => ({ path, size: text.length, sha: path })),
    treeTruncated: false,
    files,
    skipped: [],
    fetchedAt: 0,
  }
}

const SHELL_WRAPPER = `#!/bin/sh\n# Maven wrapper\n${'echo "setting up maven"\n'.repeat(120)}`

describe('a Spring app whose package is called "samples" (spring-petclinic)', () => {
  const pkg = 'src/main/java/org/springframework/samples/petclinic'
  const files: Record<string, string> = {
    'pom.xml': '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
    mvnw: SHELL_WRAPPER,
    'mvnw.cmd': '@echo off\r\nrem Maven wrapper\r\n',
    'README.md': '# Spring PetClinic Sample Application\n\nA sample Spring Boot application for a veterinary clinic: owners, their pets and visits.\n',
    [`${pkg}/PetClinicApplication.java`]:
      'package org.springframework.samples.petclinic;\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n\n@SpringBootApplication\npublic class PetClinicApplication {\n\n  public static void main(String[] args) {\n    SpringApplication.run(PetClinicApplication.class, args);\n  }\n}\n',
    [`${pkg}/owner/OwnerController.java`]:
      'package org.springframework.samples.petclinic.owner;\n\nimport org.springframework.stereotype.Controller;\nimport org.springframework.web.bind.annotation.GetMapping;\n\n@Controller\nclass OwnerController {\n\n  @GetMapping("/owners/new")\n  public String initCreationForm() {\n    return "owners/createOrUpdateOwnerForm";\n  }\n\n  @GetMapping("/owners/{ownerId}")\n  public String showOwner() {\n    return "owners/ownerDetails";\n  }\n}\n',
    [`${pkg}/owner/Owner.java`]: 'package org.springframework.samples.petclinic.owner;\n\npublic class Owner {\n  private String address;\n  private String city;\n}\n',
  }

  it('finds the real starting point, its web addresses and its language', async () => {
    const a = await analyzeRepo(snapshot('spring-petclinic', files))
    expect(a.entryPoints[0]).toBe(`${pkg}/PetClinicApplication.java`)
    expect(a.entryPoints).not.toContain('mvnw')
    expect(a.entryPoints).not.toContain('mvnw.cmd')
    expect(a.files[`${pkg}/owner/OwnerController.java`].layer).not.toBe('docs')
    expect(a.projectKind.id).toBe('api-server')
    expect(a.projectKind.reasons.join(' ')).toMatch(/different web addresses/)
    expect(a.languages[0]?.name).toBe('Java')
    expect(a.overview).not.toMatch(/written mostly in \*\*Shell\*\*/)
  })
})

describe('dev tools only the examples use (Express and marked)', () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'express', main: 'index.js', dependencies: { debug: '4.0.0', router: '2.0.0', send: '1.0.0' }, devDependencies: { marked: '15.0.0', mocha: '10.0.0' } }),
    'index.js': "module.exports = require('./lib/express')\n",
    'lib/express.js': "const debug = require('debug')('express')\nconst Router = require('router')\nconst send = require('send')\nexports.app = function () { debug('app') }\n",
    'examples/markdown/index.js': "const marked = require('marked')\nconst express = require('../../')\nconst app = express()\napp.get('/', (req, res) => res.send(marked.parse('# hi')))\n",
    'examples/view/index.js': "const marked = require('marked')\nmodule.exports = (s) => marked.parse(s)\n",
  }

  it('keeps them out of “The main tools it relies on”', async () => {
    const a = await analyzeRepo(snapshot('express', files, 'Fast, unopinionated, minimalist web framework for node.'))
    const md = a.techStack.find((t) => t.id === 'markdown-renderer')
    expect(md?.importance).toBe('tooling')
    const tools = a.overview.split('## Where it starts')[0]
    expect(tools).not.toMatch(/main tools it relies on:[\s\S]*Markdown renderers/)
  })
})

describe('a BSON encoder is not a database (gin)', () => {
  const files: Record<string, string> = {
    'go.mod': 'module github.com/gin-gonic/gin\n\ngo 1.23\n\nrequire go.mongodb.org/mongo-driver/v2 v2.0.0\n',
    'gin.go': 'package gin\n\ntype Engine struct{}\n\nfunc New() *Engine { return &Engine{} }\n',
    'render/bson.go': 'package render\n\nimport "go.mongodb.org/mongo-driver/v2/bson"\n\nfunc Encode(v any) ([]byte, error) { return bson.Marshal(v) }\n',
    'binding/bson.go': 'package binding\n\nimport "go.mongodb.org/mongo-driver/v2/bson"\n\nfunc Decode(b []byte, v any) error { return bson.Unmarshal(b, v) }\n',
  }

  it('lists the data format instead of MongoDB', async () => {
    const a = await analyzeRepo(snapshot('gin', files, 'Gin is a HTTP web framework written in Go (Golang).'))
    expect(a.techStack.find((t) => t.id === 'mongodb')).toBeUndefined()
    expect(a.techStack.find((t) => t.id === 'bson')).toBeDefined()
    expect(a.overview).not.toContain('MongoDB')
  })
})

describe('Django test files', () => {
  it('are tests, and logging in their test client is not a bot', async () => {
    const files: Record<string, string> = {
      'manage.py': "import os\nimport sys\n\nif __name__ == '__main__':\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n",
      'aggregator/models.py': 'from django.db import models\n\nclass Feed(models.Model):\n    title = models.CharField(max_length=200)\n',
      'aggregator/views.py': 'from django.shortcuts import render\n\ndef index(request):\n    return render(request, "aggregator/index.html")\n',
      'aggregator/tests.py':
        'from django.test import TestCase\n\nclass FeedTests(TestCase):\n    def test_delete(self):\n        self.client.login(username="deleter", password="password")\n        self.assertEqual(1, 1)\n',
    }
    const a = await analyzeRepo(snapshot('djangoproject.com', files))
    expect(a.files['aggregator/tests.py'].kind).toBe('test')
    expect(a.entryPoints).not.toContain('aggregator/tests.py')
    expect(a.projectKind.id).not.toBe('bot')
  })
})

describe('pickReadme', () => {
  const contents = { 'examples/celery/README.md': 'This example shows how to configure Celery with Flask.', 'docs/README.md': 'Docs', 'README.rst': 'Root' }

  it('prefers the top-level README', () => {
    expect(pickReadme(Object.keys(contents), contents)?.path).toBe('README.rst')
  })

  it('never quotes an example’s README as the authors’ words about the project', () => {
    const noRoot = { 'examples/celery/README.md': contents['examples/celery/README.md'] }
    expect(pickReadme(Object.keys(noRoot), noRoot)).toBeNull()
    const withDocs = { ...noRoot, 'docs/README.md': 'Docs' }
    expect(pickReadme(Object.keys(withDocs), withDocs)?.path).toBe('docs/README.md')
    const deepPackage = { 'packages/core/README.md': 'Core' }
    expect(pickReadme(Object.keys(deepPackage), deepPackage)).toBeNull()
  })
})
