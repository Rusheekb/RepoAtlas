import { describe, expect, it } from 'vitest'
import { TECH_CATALOG } from './tech'
import { getTech } from './detectTech'
import type { Ecosystem } from './types'

const CATEGORIES = new Set([
  'language', 'frontend', 'backend', 'mobile', 'desktop', 'database', 'data-science', 'ai', 'styling', 'state', 'testing', 'build',
  'quality', 'infra', 'ci', 'docs', 'api', 'auth', 'payments', 'cloud', 'cli', 'game', 'utility', 'package-manager',
])
const ECOSYSTEMS = new Set<Ecosystem>(['npm', 'pypi', 'go', 'cargo', 'gem', 'composer', 'maven', 'nuget', 'pub', 'cocoapods', 'swift', 'conda'])

describe('TECH_CATALOG integrity', () => {
  it('has 220+ entries with unique kebab-case ids', () => {
    expect(TECH_CATALOG.length).toBeGreaterThanOrEqual(220)
    const ids = TECH_CATALOG.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('fills every required field with plain-English content', () => {
    for (const t of TECH_CATALOG) {
      expect(t.name.trim(), t.id).not.toBe('')
      expect(CATEGORIES.has(t.category), `${t.id}: ${t.category}`).toBe(true)
      expect(['core', 'supporting', 'tooling']).toContain(t.importance)
      expect(t.description.trim().length, t.id).toBeGreaterThan(30)
      expect(t.description.length, `${t.id} description is too long`).toBeLessThanOrEqual(260)
      expect(t.analogy?.trim().length ?? 0, `${t.id} needs an analogy`).toBeGreaterThan(10)
      if (t.url) expect(t.url, t.id).toMatch(/^https:\/\//)
    }
  })

  it('has a way to be detected (packages, files, imports or a language) for every entry', () => {
    // Languages come from language statistics; phoenix and a few others come from file-content signals.
    const contentOnly = new Set(['phoenix'])
    for (const t of TECH_CATALOG) {
      if (t.category === 'language' || contentOnly.has(t.id)) continue
      const hasSignal = Object.keys(t.packages ?? {}).length > 0 || (t.files?.length ?? 0) > 0 || Object.keys(t.imports ?? {}).length > 0
      expect(hasSignal, t.id).toBe(true)
    }
  })

  it('uses valid ecosystems and well-formed patterns', () => {
    for (const t of TECH_CATALOG) {
      for (const [eco, names] of Object.entries({ ...t.packages, ...t.imports })) {
        expect(ECOSYSTEMS.has(eco as Ecosystem), `${t.id}: ${eco}`).toBe(true)
        for (const n of names ?? []) {
          expect(n.trim(), t.id).toBe(n)
          expect(n.length, t.id).toBeGreaterThan(0)
          // A "*" is only allowed as a trailing prefix marker.
          expect(n.indexOf('*') === -1 || n.indexOf('*') === n.length - 1, `${t.id}: ${n}`).toBe(true)
        }
      }
      for (const f of t.files ?? []) expect(f.trim().length, t.id).toBeGreaterThan(0)
    }
  })

  it('only implies technologies that exist', () => {
    for (const t of TECH_CATALOG) for (const id of t.implies ?? []) expect(getTech(id), `${t.id} → ${id}`).toBeDefined()
  })

  it('covers the major ecosystems the brief lists', () => {
    const required = `react next vue nuxt svelte sveltekit angular solid preact astro remix gatsby express fastify koa hono nestjs electron tauri
react-native expo three d3 chartjs socket-io axios lodash date-fns zod yup redux zustand mobx jotai tanstack-query swr react-router
tailwind styled-components emotion sass mui chakra radix shadcn bootstrap prisma drizzle typeorm sequelize mongoose knex graphql
apollo-server trpc jest vitest mocha cypress playwright testing-library storybook webpack vite esbuild rollup parcel turbo nx lerna
babel typescript eslint prettier biome husky nodemon dotenv passport next-auth jwt stripe firebase supabase aws-sdk openai anthropic
langchain puppeteer discordjs telegraf django flask fastapi starlette pydantic sqlalchemy alembic celery requests httpx aiohttp numpy
pandas scipy matplotlib seaborn plotly scikit-learn tensorflow keras pytorch transformers jupyter streamlit gradio pytest black ruff
mypy poetry click typer rich beautifulsoup scrapy selenium boto3 pyyaml gin echo fiber chi gorilla-mux cobra viper gorm sqlx-go
testify zap logrus grpc protobuf tokio serde actix-web axum rocket clap reqwest diesel sqlx-rust bevy anyhow thiserror tracing rayon
rails sinatra rspec sidekiq devise laravel symfony phpunit composer wordpress spring-boot hibernate junit gradle maven android ktor
jetpack-compose dotnet aspnetcore entity-framework xunit nunit unity flutter swiftui uikit postgresql mysql sqlite mongodb redis
elasticsearch dynamodb cassandra neo4j docker docker-compose kubernetes helm terraform ansible github-actions gitlab-ci circleci
jenkins vercel netlify heroku aws gcp azure cloudflare-workers nginx serverless-framework mkdocs sphinx docusaurus jekyll hugo`.split(/\s+/)
    expect(required.filter((id) => !getTech(id))).toEqual([])
  })
})
