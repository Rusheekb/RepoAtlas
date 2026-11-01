import type { AnalyzedFile, ProjectKind, ProjectKindId, TechItem } from '@/core/types'
import { PROJECT_KIND_INFO } from '@/core/labels'
import type { ManifestInfo } from '@/knowledge'
import { basename, depthOf } from '@/core/paths'
import { count } from './structure/text'
import { isPeripheral, zonesOf } from './structure/zones'

export interface ProjectKindInput {
  files: AnalyzedFile[]
  techStack: TechItem[]
  manifests: ManifestInfo
  readme: string | null
  topics: string[]
  description: string | null
  /** Downloaded file contents, for reading package.json fields and extension manifests. Optional. */
  contents?: Record<string, string>
  /** The repository's name. Optional. */
  repoName?: string
}

interface Framework {
  label: string
  /** What it is, for a non-technical reader (completes "Uses X, …"). */
  what: string
  /** Technology ids as the knowledge base may name them. */
  ids?: string[]
  /** Package names (any ecosystem). A trailing "*" is a prefix match. */
  deps?: string[]
  /** File paths or basenames whose presence is evidence. */
  files?: string[]
}

const FRONTEND: Framework[] = [
  { label: 'Next.js', what: 'a framework for building websites and web apps with React', ids: ['next', 'nextjs'], deps: ['next'], files: ['next.config.js', 'next.config.mjs', 'next.config.ts'] },
  { label: 'Nuxt', what: 'a framework for building websites and web apps with Vue', ids: ['nuxt', 'nuxtjs'], deps: ['nuxt', 'nuxt3'], files: ['nuxt.config.ts', 'nuxt.config.js'] },
  { label: 'SvelteKit', what: 'a framework for building web apps with Svelte', ids: ['sveltekit'], deps: ['@sveltejs/kit'] },
  { label: 'Remix', what: 'a framework for building web apps with React', ids: ['remix'], deps: ['@remix-run/react', '@remix-run/node'] },
  { label: 'React', what: 'a popular toolkit for building interactive screens', ids: ['react'], deps: ['react', 'react-dom'] },
  { label: 'Vue', what: 'a toolkit for building interactive web pages', ids: ['vue', 'vuejs'], deps: ['vue'] },
  { label: 'Svelte', what: 'a toolkit for building interactive web pages', ids: ['svelte'], deps: ['svelte'] },
  { label: 'Angular', what: 'Google’s framework for building web apps', ids: ['angular'], deps: ['@angular/core'], files: ['angular.json'] },
  { label: 'Solid', what: 'a toolkit for building fast interactive screens', ids: ['solid', 'solidjs'], deps: ['solid-js'] },
  { label: 'Preact', what: 'a tiny toolkit for building interactive screens', ids: ['preact'], deps: ['preact'] },
  { label: 'Ember', what: 'a framework for building ambitious web apps', ids: ['ember'], deps: ['ember-source'] },
  { label: 'Lit', what: 'a toolkit for building reusable web page pieces', ids: ['lit'], deps: ['lit'] },
  { label: 'Qwik', what: 'a framework for building very fast web apps', ids: ['qwik'], deps: ['@builder.io/qwik'] },
  { label: 'Alpine.js', what: 'a small toolkit for adding interactivity to web pages', ids: ['alpinejs', 'alpine'], deps: ['alpinejs'] },
  { label: 'htmx', what: 'a tool for making web pages interactive without much JavaScript', ids: ['htmx'], deps: ['htmx.org'] },
  { label: 'Streamlit', what: 'a tool that turns Python scripts into interactive web pages', ids: ['streamlit'], deps: ['streamlit'] },
  { label: 'Gradio', what: 'a tool for building quick web demos of Python programs', ids: ['gradio'], deps: ['gradio'] },
  { label: 'Dash', what: 'a tool for building data dashboards in Python', ids: ['dash', 'plotly-dash'], deps: ['dash'] },
  { label: 'NiceGUI', what: 'a tool for building web interfaces in Python', ids: ['nicegui'], deps: ['nicegui'] },
  { label: 'Reflex', what: 'a tool for building web apps in pure Python', ids: ['reflex'], deps: ['reflex'] },
  { label: 'Yew', what: 'a toolkit for building web apps in Rust', ids: ['yew'], deps: ['yew'] },
  { label: 'Leptos', what: 'a toolkit for building web apps in Rust', ids: ['leptos'], deps: ['leptos'] },
  { label: 'Blazor', what: 'Microsoft’s toolkit for building web apps in C#', ids: ['blazor'], deps: ['Microsoft.AspNetCore.Components*'] },
]

const SITE_GENERATORS: Framework[] = [
  { label: 'Astro', what: 'a tool for making fast, mostly-static websites', ids: ['astro'], deps: ['astro'], files: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'] },
  { label: 'Gatsby', what: 'a tool for building fast websites from content', ids: ['gatsby'], deps: ['gatsby'], files: ['gatsby-config.js', 'gatsby-config.ts'] },
  { label: 'Docusaurus', what: 'a tool for building documentation websites', ids: ['docusaurus'], deps: ['@docusaurus/core'], files: ['docusaurus.config.js', 'docusaurus.config.ts'] },
  { label: 'VitePress', what: 'a tool for building documentation websites', ids: ['vitepress'], deps: ['vitepress'] },
  { label: 'VuePress', what: 'a tool for building documentation websites', ids: ['vuepress'], deps: ['vuepress'] },
  { label: 'Eleventy', what: 'a simple tool for turning text files into a website', ids: ['eleventy', '11ty'], deps: ['@11ty/eleventy'], files: ['.eleventy.js', 'eleventy.config.js', 'eleventy.config.mjs'] },
  { label: 'Hugo', what: 'a tool that turns text files into a fast website', ids: ['hugo'], files: ['hugo.toml', 'hugo.yaml', 'hugo.json'] },
  { label: 'Jekyll', what: 'a tool that turns text files into a website (it powers GitHub Pages)', ids: ['jekyll'], deps: ['jekyll', 'github-pages'] },
  { label: 'Hexo', what: 'a blogging tool that turns text files into a website', ids: ['hexo'], deps: ['hexo'] },
  { label: 'Zola', what: 'a tool that turns text files into a fast website', ids: ['zola'] },
]

const DOC_GENERATORS: Framework[] = [
  { label: 'MkDocs', what: 'a tool that turns Markdown notes into a documentation website', ids: ['mkdocs'], deps: ['mkdocs', 'mkdocs-material'], files: ['mkdocs.yml'] },
  { label: 'Sphinx', what: 'a tool that turns written guides into a documentation website', ids: ['sphinx'], deps: ['sphinx'] },
]

const SERVERS: Framework[] = [
  { label: 'Express', what: 'a toolkit for building web servers', ids: ['express', 'expressjs'], deps: ['express'] },
  { label: 'Fastify', what: 'a toolkit for building fast web servers', ids: ['fastify'], deps: ['fastify'] },
  { label: 'Koa', what: 'a toolkit for building web servers', ids: ['koa'], deps: ['koa'] },
  { label: 'Hapi', what: 'a toolkit for building web servers', ids: ['hapi'], deps: ['@hapi/hapi'] },
  { label: 'Hono', what: 'a small toolkit for building web servers', ids: ['hono'], deps: ['hono'] },
  { label: 'NestJS', what: 'a framework for building organized web servers', ids: ['nestjs', 'nest'], deps: ['@nestjs/core'] },
  { label: 'Elysia', what: 'a toolkit for building web servers', ids: ['elysia'], deps: ['elysia'] },
  { label: 'tRPC', what: 'a tool for connecting an app to its server', ids: ['trpc'], deps: ['@trpc/server'] },
  { label: 'Apollo Server', what: 'a tool for building GraphQL servers', ids: ['apollo-server', 'apollo'], deps: ['@apollo/server', 'apollo-server', 'apollo-server-express'] },
  { label: 'FastAPI', what: 'a toolkit for building web servers (APIs) in Python', ids: ['fastapi'], deps: ['fastapi'] },
  { label: 'Django', what: 'a complete toolkit for building websites and servers in Python', ids: ['django'], deps: ['django'] },
  { label: 'Flask', what: 'a lightweight toolkit for building web servers in Python', ids: ['flask'], deps: ['flask'] },
  { label: 'Starlette', what: 'a toolkit for building web servers in Python', ids: ['starlette'], deps: ['starlette'] },
  { label: 'aiohttp', what: 'a toolkit for building web servers in Python', ids: ['aiohttp'], deps: ['aiohttp'] },
  { label: 'Tornado', what: 'a toolkit for building web servers in Python', ids: ['tornado'], deps: ['tornado'] },
  { label: 'Sanic', what: 'a toolkit for building fast web servers in Python', ids: ['sanic'], deps: ['sanic'] },
  { label: 'Gin', what: 'a toolkit for building web servers in Go', ids: ['gin'], deps: ['github.com/gin-gonic/gin'] },
  { label: 'Echo', what: 'a toolkit for building web servers in Go', ids: ['echo'], deps: ['github.com/labstack/echo*'] },
  { label: 'Fiber', what: 'a toolkit for building web servers in Go', ids: ['fiber'], deps: ['github.com/gofiber/fiber*'] },
  { label: 'Chi', what: 'a toolkit for building web servers in Go', ids: ['chi'], deps: ['github.com/go-chi/chi*'] },
  { label: 'Gorilla Mux', what: 'a toolkit for directing web requests in Go', ids: ['gorilla-mux'], deps: ['github.com/gorilla/mux'] },
  { label: 'Actix Web', what: 'a toolkit for building web servers in Rust', ids: ['actix', 'actix-web'], deps: ['actix-web'] },
  { label: 'Axum', what: 'a toolkit for building web servers in Rust', ids: ['axum'], deps: ['axum'] },
  { label: 'Rocket', what: 'a toolkit for building web servers in Rust', ids: ['rocket'], deps: ['rocket'] },
  { label: 'Spring Boot', what: 'a popular framework for building servers in Java', ids: ['spring', 'spring-boot', 'springboot'], deps: ['org.springframework.boot*', 'spring-boot-starter*'] },
  { label: 'Ktor', what: 'a toolkit for building servers in Kotlin', ids: ['ktor'], deps: ['io.ktor*'] },
  { label: 'Ruby on Rails', what: 'a complete toolkit for building websites and servers in Ruby', ids: ['rails', 'ruby-on-rails'], deps: ['rails'], files: ['config/routes.rb'] },
  { label: 'Sinatra', what: 'a small toolkit for building web servers in Ruby', ids: ['sinatra'], deps: ['sinatra'] },
  { label: 'Laravel', what: 'a complete toolkit for building websites and servers in PHP', ids: ['laravel'], deps: ['laravel/framework'], files: ['artisan'] },
  { label: 'Symfony', what: 'a toolkit for building websites and servers in PHP', ids: ['symfony'], deps: ['symfony/framework-bundle'] },
  { label: 'Phoenix', what: 'a toolkit for building websites and servers in Elixir', ids: ['phoenix'], deps: ['phoenix'] },
  { label: 'ASP.NET Core', what: 'Microsoft’s toolkit for building websites and servers in C#', ids: ['aspnet', 'aspnetcore', 'asp-net-core'], deps: ['Microsoft.AspNetCore*'] },
]

/** Server frameworks that usually render the pages themselves (full-stack). */
const FULL_STACK_SERVERS = new Set(['Django', 'Ruby on Rails', 'Laravel', 'Phoenix', 'Symfony', 'ASP.NET Core', 'Flask'])

const MOBILE: Framework[] = [
  { label: 'React Native', what: 'a toolkit for building phone apps with React', ids: ['react-native'], deps: ['react-native'] },
  { label: 'Expo', what: 'a toolkit that makes building phone apps easier', ids: ['expo'], deps: ['expo'] },
  { label: 'Flutter', what: 'Google’s toolkit for building phone apps', ids: ['flutter'], deps: ['flutter'] },
  { label: 'Ionic', what: 'a toolkit for building phone apps with web technology', ids: ['ionic'], deps: ['@ionic/core', '@ionic/react', '@ionic/angular', '@ionic/vue'] },
  { label: 'Capacitor', what: 'a tool for turning web apps into phone apps', ids: ['capacitor'], deps: ['@capacitor/core'] },
  { label: 'NativeScript', what: 'a toolkit for building phone apps', ids: ['nativescript'], deps: ['@nativescript/core'] },
]

const DESKTOP: Framework[] = [
  { label: 'Electron', what: 'a toolkit for building desktop apps with web technology', ids: ['electron'], deps: ['electron'] },
  { label: 'Tauri', what: 'a toolkit for building small, fast desktop apps', ids: ['tauri'], deps: ['@tauri-apps/api', 'tauri'], files: ['src-tauri/tauri.conf.json'] },
  { label: 'Wails', what: 'a toolkit for building desktop apps with Go', ids: ['wails'], deps: ['github.com/wailsapp/wails*'] },
  { label: 'Qt', what: 'a toolkit for building desktop windows and buttons', ids: ['qt', 'pyqt', 'pyside'], deps: ['pyqt5', 'pyqt6', 'pyside2', 'pyside6'] },
  { label: 'wxPython', what: 'a toolkit for building desktop apps in Python', ids: ['wxpython'], deps: ['wxpython'] },
  { label: 'Kivy', what: 'a toolkit for building apps with buttons and windows in Python', ids: ['kivy'], deps: ['kivy'] },
  { label: 'Flet', what: 'a toolkit for building desktop and web apps in Python', ids: ['flet'], deps: ['flet'] },
  { label: 'Avalonia', what: 'a toolkit for building desktop apps in C#', ids: ['avalonia'], deps: ['Avalonia'] },
  { label: 'egui', what: 'a toolkit for building desktop apps in Rust', ids: ['egui'], deps: ['eframe', 'egui'] },
  { label: 'Iced', what: 'a toolkit for building desktop apps in Rust', ids: ['iced'], deps: ['iced'] },
]

const BOTS: Framework[] = [
  { label: 'discord.js', what: 'a toolkit for building Discord bots', ids: ['discordjs', 'discord.js', 'discord'], deps: ['discord.js', 'discord.py', 'discord', 'nextcord', 'py-cord', 'disnake', 'discordgo', 'github.com/bwmarrin/discordgo', 'serenity'] },
  { label: 'Telegram bot tools', what: 'a toolkit for building Telegram bots', ids: ['telegraf', 'telegram'], deps: ['telegraf', 'node-telegram-bot-api', 'grammy', 'python-telegram-bot', 'aiogram', 'pytelegrambotapi', 'teloxide'] },
  { label: 'Slack Bolt', what: 'Slack’s toolkit for building Slack bots', ids: ['slack-bolt', 'slack'], deps: ['@slack/bolt', 'slack_bolt', 'slack-bolt'] },
  { label: 'Bot Framework', what: 'Microsoft’s toolkit for building chat bots', ids: ['botbuilder'], deps: ['botbuilder'] },
  { label: 'Probot', what: 'a toolkit for building GitHub bots', ids: ['probot'], deps: ['probot'] },
  { label: 'tmi.js', what: 'a toolkit for building Twitch chat bots', ids: ['tmi'], deps: ['tmi.js'] },
]

const CLI_TOOLS: Framework[] = [
  { label: 'Commander', what: 'a toolkit for building terminal commands', ids: ['commander'], deps: ['commander'] },
  { label: 'yargs', what: 'a toolkit for reading terminal commands', ids: ['yargs'], deps: ['yargs'] },
  { label: 'oclif', what: 'a framework for building terminal commands', ids: ['oclif'], deps: ['@oclif/core', 'oclif'] },
  { label: 'Click', what: 'a toolkit for building terminal commands in Python', ids: ['click'], deps: ['click'] },
  { label: 'Typer', what: 'a toolkit for building terminal commands in Python', ids: ['typer'], deps: ['typer'] },
  { label: 'Cobra', what: 'a toolkit for building terminal commands in Go', ids: ['cobra'], deps: ['github.com/spf13/cobra'] },
  { label: 'urfave/cli', what: 'a toolkit for building terminal commands in Go', ids: ['urfave-cli'], deps: ['github.com/urfave/cli*'] },
  { label: 'clap', what: 'a toolkit for reading terminal commands in Rust', ids: ['clap'], deps: ['clap', 'structopt'] },
  { label: 'Thor', what: 'a toolkit for building terminal commands in Ruby', ids: ['thor'], deps: ['thor'] },
  { label: 'picocli', what: 'a toolkit for building terminal commands in Java', ids: ['picocli'], deps: ['info.picocli*', 'picocli'] },
  { label: 'Ink', what: 'a toolkit for building interactive terminal screens', ids: ['ink'], deps: ['ink'] },
]

const ML: Framework[] = [
  { label: 'PyTorch', what: 'a toolkit for building and training AI models', ids: ['pytorch', 'torch'], deps: ['torch', 'pytorch-lightning', 'lightning', 'torchvision'] },
  { label: 'TensorFlow', what: 'Google’s toolkit for building and training AI models', ids: ['tensorflow', 'keras'], deps: ['tensorflow', 'keras', 'tensorflow-gpu', '@tensorflow/tfjs'] },
  { label: 'JAX', what: 'a toolkit for fast math used to train AI models', ids: ['jax'], deps: ['jax', 'flax'] },
  { label: 'Hugging Face Transformers', what: 'a library of ready-made AI language and vision models', ids: ['transformers', 'huggingface'], deps: ['transformers', 'diffusers', 'peft', 'accelerate', 'sentence-transformers'] },
  { label: 'scikit-learn', what: 'a toolkit of classic machine-learning methods', ids: ['scikit-learn', 'sklearn'], deps: ['scikit-learn', 'sklearn'] },
  { label: 'XGBoost / LightGBM', what: 'toolkits for prediction models that learn from tables of data', ids: ['xgboost', 'lightgbm'], deps: ['xgboost', 'lightgbm', 'catboost'] },
]

const DATA: Framework[] = [
  { label: 'pandas', what: 'a toolkit for working with tables of data', ids: ['pandas'], deps: ['pandas', 'polars'] },
  { label: 'Matplotlib', what: 'a toolkit for drawing charts', ids: ['matplotlib', 'seaborn', 'plotly'], deps: ['matplotlib', 'seaborn', 'plotly', 'altair', 'bokeh'] },
  { label: 'Jupyter', what: 'notebooks that mix notes, code and charts', ids: ['jupyter'], deps: ['jupyter', 'jupyterlab', 'notebook', 'ipykernel'] },
  { label: 'SciPy', what: 'a toolkit for scientific math', ids: ['scipy', 'statsmodels'], deps: ['scipy', 'statsmodels'] },
]

const GAMES: Framework[] = [
  { label: 'Pygame', what: 'a toolkit for making games in Python', ids: ['pygame'], deps: ['pygame', 'pygame-ce', 'arcade', 'pyglet'] },
  { label: 'Bevy', what: 'a game engine for Rust', ids: ['bevy'], deps: ['bevy', 'macroquad', 'ggez'] },
  { label: 'Phaser', what: 'a toolkit for making games that run in the browser', ids: ['phaser'], deps: ['phaser', 'kaboom', 'kaplay', 'excalibur', 'pixi.js'] },
  { label: 'Ebitengine', what: 'a game engine for Go', ids: ['ebiten', 'ebitengine'], deps: ['github.com/hajimehoshi/ebiten*'] },
  { label: 'MonoGame', what: 'a toolkit for making games in C#', ids: ['monogame'], deps: ['MonoGame.Framework*'] },
  { label: 'libGDX', what: 'a toolkit for making games in Java', ids: ['libgdx'], deps: ['com.badlogicgames.gdx*'] },
  { label: 'raylib', what: 'a simple toolkit for making games', ids: ['raylib'], deps: ['raylib', 'raylib-py', 'pyray'] },
]

const EXTENSION_TOOLS: Framework[] = [
  { label: 'WXT', what: 'a toolkit for building browser extensions', ids: ['wxt'], deps: ['wxt'] },
  { label: 'Plasmo', what: 'a toolkit for building browser extensions', ids: ['plasmo'], deps: ['plasmo'] },
  { label: 'WebExtension tools', what: 'helpers for building browser extensions', ids: ['webextension-polyfill'], deps: ['webextension-polyfill', '@types/chrome', 'chrome-types'] },
]

const IAC: Framework[] = [
  { label: 'Pulumi', what: 'a tool for describing cloud servers in code', ids: ['pulumi'], deps: ['@pulumi/pulumi', 'pulumi'], files: ['Pulumi.yaml'] },
  { label: 'AWS CDK', what: 'Amazon’s tool for describing cloud setups in code', ids: ['aws-cdk', 'cdk'], deps: ['aws-cdk-lib', 'aws-cdk'], files: ['cdk.json'] },
]

const PLUGIN_NAME_RE = /^(@[^/]+\/)?(eslint-plugin|babel-plugin|vite-plugin|rollup-plugin|gatsby-plugin|prettier-plugin|postcss-plugin|tailwindcss-plugin|remark|rehype|markdown-it|homebridge|obsidian|vscode|stylelint-plugin|webpack-plugin|unplugin|nuxt-module|docusaurus-plugin|jest-preset|serverless-plugin)[-/]|-(webpack-plugin|vite-plugin|plugin)$|\/eslint-plugin$/

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface RootCargo {
  /** The root Cargo.toml describes a package of its own (not only a workspace of other packages). */
  hasPackage: boolean
  hasWorkspace: boolean
  /** Names (or paths) of the programs declared with [[bin]]. */
  bins: string[]
  hasLib: boolean
}

/** The few facts we need from the root Cargo.toml, read line by line (no backtracking-prone patterns). */
function readRootCargo(text: string): RootCargo {
  const out: RootCargo = { hasPackage: false, hasWorkspace: false, bins: [], hasLib: false }
  let section = ''
  let binIndex = -1
  for (const raw of text.split('\n')) {
    const line = raw.length > 400 ? '' : raw.trim()
    if (!line || line.startsWith('#')) continue
    const header = /^\[\[?([A-Za-z0-9_.-]+)\]\]?/.exec(line)
    if (header) {
      section = header[1].toLowerCase()
      if (section === 'package') out.hasPackage = true
      else if (section === 'workspace') out.hasWorkspace = true
      else if (section === 'lib') out.hasLib = true
      if (section === 'bin' && line.startsWith('[[')) {
        out.bins.push('')
        binIndex = out.bins.length - 1
      }
      continue
    }
    if (section === 'bin' && binIndex >= 0) {
      const m = /^(name|path)[ \t]*=[ \t]*["']([^"']{1,80})["']/.exec(line)
      if (m && (m[1] === 'name' || !out.bins[binIndex])) out.bins[binIndex] = m[2]
    }
  }
  return out
}

function safeJson(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Infer what kind of project this is (web app, API server, library, CLI …) with confidence and plain-English reasons. */
export function detectProjectKind(input: ProjectKindInput): ProjectKind {
  const { files, techStack, manifests } = input
  const contents = input.contents ?? {}
  const scores = new Map<ProjectKindId, { score: number; reasons: { text: string; weight: number }[] }>()
  const add = (kind: ProjectKindId, weight: number, reason: string) => {
    let s = scores.get(kind)
    if (!s) {
      s = { score: 0, reasons: [] }
      scores.set(kind, s)
    }
    s.score += weight
    if (!s.reasons.some((r) => r.text === reason)) s.reasons.push({ text: reason, weight })
  }

  // ── Evidence ────────────────────────────────────────────────────────────────
  const deps = (manifests.dependencies ?? []).filter((d) => d && typeof d.name === 'string')
  const depNames = new Set(deps.map((d) => d.name.toLowerCase()))
  const runtimeDeps = new Set(deps.filter((d) => !d.dev).map((d) => d.name.toLowerCase()))
  const techIds = new Set<string>()
  for (const t of techStack) {
    techIds.add(norm(t.id))
    techIds.add(norm(t.name))
  }
  const paths = files.map((f) => f.path)
  const core = files.filter((f) => !isPeripheral(f.path))
  // Telltale file names only count in the project's own folders: examples/with-nextjs/next.config.js doesn't make it a Next.js app.
  const ownPaths = core.map((f) => f.path)
  const pathSet = new Set(ownPaths)
  const lowerBasenames = new Set(ownPaths.map((p) => basename(p).toLowerCase()))

  const depMatches = (pattern: string, pool: Set<string>): boolean => {
    const p = pattern.toLowerCase()
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1)
      for (const d of pool) if (d.startsWith(prefix)) return true
      return false
    }
    return pool.has(p)
  }
  /** 2 = a runtime dependency (or detected technology), 1 = a dev-only dependency, 0 = absent. */
  const strength = (fw: Framework): number => {
    if (fw.deps?.some((d) => depMatches(d, runtimeDeps))) return 2
    if (fw.ids?.some((id) => techIds.has(norm(id)))) return 2
    if (fw.files?.some((f) => pathSet.has(f) || lowerBasenames.has(f.toLowerCase()))) return 2
    if (fw.deps?.some((d) => depMatches(d, depNames))) return 1
    return 0
  }
  // When the repository *is* a framework (expressjs/express, pallets/flask …), its own name is not evidence of using it.
  const selfNames = new Set([norm(input.repoName ?? ''), ...(manifests.projectNames ?? []).map((n) => norm(String(n)))].filter((n) => n.length >= 2))
  const isSelf = (fw: Framework) => [fw.label, ...(fw.ids ?? []), ...(fw.deps ?? [])].some((n) => selfNames.has(norm(n.replace(/\*$/, ''))))
  const found = (list: Framework[]): { fw: Framework; s: number }[] =>
    list
      .filter((fw) => !isSelf(fw))
      .map((fw) => ({ fw, s: strength(fw) }))
      .filter((x) => x.s > 0)
  const uses = (fw: Framework) => `Uses ${fw.label}, ${fw.what}.`

  const rootPkg = safeJson(contents['package.json'])
  const text = `${input.description ?? ''}\n${(input.topics ?? []).join(' ')}`.toLowerCase()
  const readmeHead = (input.readme ?? '').slice(0, 6000)
  const repoName = (input.repoName ?? '').toLowerCase()

  const routesCore = core.reduce((s, f) => s + (f.kind === 'source' ? f.routes.length : 0), 0)
  const firstRoute = core.flatMap((f) => f.routes).find((r) => r.path)
  const uiFiles = core.filter((f) => f.kind === 'source' && (f.role === 'component' || f.role === 'page' || f.role === 'layout')).length
  const templates = core.filter((f) => f.kind === 'markup' && (f.role === 'page' || f.role === 'layout')).length
  const codeFiles = files.filter((f) => f.kind === 'source').length
  const docsFiles = files.filter((f) => f.kind === 'docs').length
  const contentFiles = files.filter((f) => f.kind !== 'asset' && f.kind !== 'generated').length || 1
  const notebooks = files.filter((f) => f.ext === 'ipynb').length
  const tfFiles = files.filter((f) => f.ext === 'tf' || f.ext === 'tfvars').length
  const serverStarts = core.filter((f) => f.role === 'entry' && f.layer === 'api').length
  const uiStarts = core.filter((f) => f.role === 'entry' && f.layer === 'ui').length

  // ── Websites, web apps & servers ────────────────────────────────────────────
  const front = found(FRONTEND)
  const sites = found(SITE_GENERATORS)
  const servers = found(SERVERS)
  const docGens = found(DOC_GENERATORS)

  for (const { fw, s } of front.slice(0, 2)) add('web-app', s === 2 ? 3 : 1.5, uses(fw))
  for (const { fw, s } of sites.slice(0, 1)) add('website', s === 2 ? 4.5 : 2, uses(fw))
  if (uiFiles >= 5) add('web-app', 1.5, `Much of its code builds screens and buttons people click (${count(uiFiles, 'UI file')}).`)
  else if (uiFiles >= 2 && front.length > 0) add('web-app', 0.75, 'Part of its code builds the screens people see.')
  if (uiStarts > 0) add('web-app', 1, 'One of its starting points puts an interactive screen on a web page.')

  for (const { fw, s } of servers.slice(0, 2)) add('api-server', s === 2 ? 3 : 1, uses(fw))
  if (routesCore > 0) {
    const example = firstRoute ? ` (for example ${firstRoute.method === 'ANY' ? '' : `${firstRoute.method} `}${firstRoute.path})` : ''
    add('api-server', 1 + Math.min(routesCore / 5, 2), `It answers ${count(routesCore, 'different web address', 'different web addresses')}${example}.`)
  }
  if (serverStarts > 0) add('api-server', 1.5, 'One of its starting points switches on a web server.')
  if (files.some((f) => f.role === 'schema' && (f.ext === 'graphql' || f.ext === 'gql' || /^(openapi|swagger)/i.test(f.name)))) {
    add('api-server', 1, 'It describes the requests it accepts in a formal “contract” file (an API schema).')
  }
  if (servers.length > 0 && (templates >= 2 || uiFiles >= 3)) {
    const fullStack = servers.some((x) => FULL_STACK_SERVERS.has(x.fw.label))
    add('web-app', fullStack ? 3.5 : 2.5, templates >= 2 ? 'It also builds the web pages people see (it has page templates).' : 'It has both the screens people see and the server behind them.')
  }
  if (sites.length === 0 && front.length === 0 && servers.length === 0) {
    const html = files.filter((f) => f.ext === 'html' && !zonesOf(f.path).includes('test')).length
    const css = files.filter((f) => f.kind === 'style').length
    if (html >= 1 && html + css >= codeFiles * 0.5) add('website', 2.5, 'It’s made of plain web pages (HTML and CSS) without a big app framework.')
    if (pathSet.has('_config.yml') && (paths.some((p) => p.startsWith('_posts/')) || paths.some((p) => p.startsWith('_layouts/')))) add('website', 3, 'It’s laid out like a Jekyll site, the tool that powers GitHub Pages.')
    if (pathSet.has('CNAME')) add('website', 1, 'It’s set up to be published at its own web address (it has a CNAME file).')
  }
  if (/\b(personal (web)?site|portfolio|landing page|blog|homepage|website)\b/.test(text)) add('website', 1.5, 'Its description talks about a website.')
  if (/\b(web ?app|dashboard|web application|single[- ]page app)\b/.test(text)) add('web-app', 1, 'Its description calls it a web app.')
  if (/\b(rest(ful)? api|api server|backend|microservice|graphql api)\b/.test(text)) add('api-server', 1.5, 'Its description says it’s a server that other programs talk to.')

  // ── Mobile, desktop, extensions, bots, games ───────────────────────────────
  for (const { fw, s } of found(MOBILE).slice(0, 2)) add('mobile-app', s === 2 ? 4 : 2, uses(fw))
  if (paths.some((p) => /(^|\/)AndroidManifest\.xml$/.test(p) && !isPeripheral(p))) add('mobile-app', 2.5, 'It has an Android app manifest, so it runs on Android phones.')
  if (paths.some((p) => /\.xcodeproj\//.test(p)) && files.some((f) => f.language === 'Swift' || f.language === 'Objective-C')) {
    const swiftUi = Object.entries(contents).some(([p, c]) => p.endsWith('.swift') && /^import\s+(SwiftUI|UIKit)\b/m.test(c))
    add(swiftUi || lowerBasenames.has('info.plist') ? 'mobile-app' : 'desktop-app', 3, 'It’s an Xcode project — the setup Apple uses for iPhone and Mac apps.')
  }
  for (const { fw, s } of found(DESKTOP).slice(0, 2)) add('desktop-app', s === 2 ? 4 : 2, uses(fw))
  if (Object.entries(contents).some(([p, c]) => p.endsWith('.py') && !isPeripheral(p) && /^[ \t]*(import tkinter|from tkinter|import PySimpleGUI)/m.test(c))) {
    add('desktop-app', 2.5, 'It builds desktop windows with Python’s built-in window toolkit.')
  }
  if (files.some((f) => f.ext === 'xaml') && files.some((f) => f.language === 'C#')) add('desktop-app', 2.5, 'It uses XAML screen layouts, the Windows way of designing app windows.')

  for (const [p, c] of Object.entries(contents)) {
    if (basename(p).toLowerCase() !== 'manifest.json' || depthOf(p) > 2 || isPeripheral(p)) continue
    const m = safeJson(c)
    if (!m) continue
    if ('manifest_version' in m && !('minAppVersion' in m)) add('browser-extension', 5, 'It has a browser-extension manifest that tells Chrome or Firefox what the add-on can do.')
    else if ('minAppVersion' in m) add('plugin', 4.5, 'Its manifest says it’s a plugin for the Obsidian note-taking app.')
    else if ('editorType' in m && 'api' in m) add('plugin', 4.5, 'Its manifest says it’s a plugin for the Figma design tool.')
  }
  for (const { fw } of found(EXTENSION_TOOLS).slice(0, 1)) add('browser-extension', 3, uses(fw))

  for (const { fw, s } of found(BOTS).slice(0, 1)) add('bot', s === 2 ? 4 : 2, uses(fw))
  if (core.some((f) => f.isEntry && /bot starts here/.test(f.entryReason ?? ''))) add('bot', 2, 'It logs in to a chat service and waits for messages.')
  if (/\bbot\b/.test(text)) add('bot', 1.5, 'Its description calls it a bot.')

  for (const { fw, s } of found(GAMES).slice(0, 1)) add('game', s === 2 ? 4 : 2, uses(fw))
  if (lowerBasenames.has('project.godot')) add('game', 5, 'It’s a Godot project — a free engine for making games.')
  if (paths.some((p) => p.startsWith('ProjectSettings/')) && paths.some((p) => p.startsWith('Assets/'))) add('game', 5, 'It’s laid out like a Unity project — a popular engine for making games.')
  if (pathSet.has('main.lua') && pathSet.has('conf.lua')) add('game', 4, 'It’s laid out like a LÖVE game (a small engine for making games in Lua).')
  if (/\b(game|gamedev|game-engine)\b/.test(text)) add('game', 1.5, 'Its description talks about a game.')

  // ── Data & machine learning ─────────────────────────────────────────────────
  const ml = found(ML)
  for (const { fw, s } of ml.slice(0, 2)) add('ml-model', s === 2 ? 3 : 1.5, uses(fw))
  const mlFiles = core.filter((f) => /^(train|training|finetune|fine_tune|inference|predict|evaluate|eval)\.(py|ipynb)$/i.test(f.name)).length
  if (mlFiles > 0 && (ml.length > 0 || notebooks > 0)) add('ml-model', 1.5, 'It has files for training a model and using it to make predictions.')
  if (/\b(machine[- ]learning|deep[- ]learning|neural network|llm|language model|computer vision|nlp)\b/.test(text)) add('ml-model', 1.5, 'Its description talks about machine learning.')

  for (const { fw, s } of found(DATA).slice(0, 2)) add('data-science', s === 2 ? 2 : 1, uses(fw))
  if (notebooks > 0) {
    add('data-science', Math.min(1.5 + notebooks / 3, 4), `It has ${count(notebooks, 'notebook')} — documents that mix notes, code and charts.`)
    if (ml.length > 0) add('ml-model', 0.5, 'Its notebooks experiment with AI models.')
  }
  const rFiles = files.filter((f) => f.language === 'R' || f.language === 'R Markdown').length
  if (rFiles >= 3 && rFiles >= codeFiles * 0.4) add('data-science', 3, 'Much of it is written in R, a language made for statistics and charts.')
  if (files.filter((f) => /\.(csv|parquet|tsv|xlsx)$/i.test(f.path)).length >= 3) add('data-science', 1, 'It includes data files (tables of information) to analyze.')
  if (/\b(data[- ]science|data analysis|analytics|jupyter|kaggle|dataset|visuali[sz]ation)\b/.test(text)) add('data-science', 1.5, 'Its description talks about analyzing data.')

  // ── Infrastructure & documentation ──────────────────────────────────────────
  if (tfFiles >= 2) add('infrastructure', 3 + (tfFiles >= codeFiles * 0.5 ? 2 : 0), `It has ${count(tfFiles, 'Terraform file')} describing cloud servers and services as code.`)
  if (lowerBasenames.has('chart.yaml')) add('infrastructure', 2, 'It has a Helm chart — a package for running apps on a Kubernetes server cluster.')
  const k8s = Object.entries(contents).filter(([p, c]) => /\.ya?ml$/.test(p) && /^apiVersion:[ \t]*\S+/m.test(c) && /^kind:[ \t]*(Deployment|Service|StatefulSet|DaemonSet|Ingress|ConfigMap|CronJob)\b/m.test(c)).length
  if (k8s >= 2) add('infrastructure', 2, `It has ${count(k8s, 'Kubernetes file')} describing how to run apps on a server cluster.`)
  if (paths.some((p) => /(^|\/)(playbook|site)\.ya?ml$/.test(p)) && paths.some((p) => p.startsWith('roles/'))) add('infrastructure', 3, 'It’s laid out like an Ansible project, which sets up servers automatically.')
  for (const { fw } of found(IAC).slice(0, 1)) add('infrastructure', 3, uses(fw))
  if (/\b(terraform|kubernetes|k8s|helm|ansible|infrastructure|devops|homelab)\b/.test(text)) add('infrastructure', 1.5, 'Its description talks about servers and infrastructure.')

  const docsShare = docsFiles / contentFiles
  const enoughDocs = docsFiles >= 3
  if (enoughDocs && docsShare > 0.6 && codeFiles < 15) add('documentation', 4, 'Most of its files are written guides rather than code.')
  else if (enoughDocs && docsShare > 0.45 && codeFiles < 30) add('documentation', 2, 'A large part of it is written guides.')
  for (const { fw } of docGens.slice(0, 1)) if (docsShare > 0.3) add('documentation', 2, uses(fw))
  if (/^awesome[-_]|\bawesome[- ]list\b|\bcurated list\b/.test(`${repoName} ${text}`)) add('documentation', 4, 'It’s a curated list of links and resources.')
  if (/\b(tutorial|course|book|guide|cheat ?sheet|interview questions|roadmap|notes)\b/.test(text) && codeFiles < 40) add('documentation', 1.5, 'Its description says it’s mainly something to read and learn from.')

  // ── Collections of projects ─────────────────────────────────────────────────
  // A Rust workspace whose root package builds a program (ripgrep: [[bin]] rg) is one tool split into crates.
  const cargo = pathSet.has('Cargo.toml') ? readRootCargo(contents['Cargo.toml'] ?? '') : null
  const rootCargoBin = !!cargo && (cargo.bins.length > 0 || (cargo.hasPackage && (pathSet.has('src/main.rs') || ownPaths.some((p) => /^src\/bin\/[^/]+\.rs$/.test(p)))))
  const oneProgram = rootCargoBin && !!cargo?.hasPackage
  const workspaces = (manifests.workspaces ?? []).filter((w) => typeof w === 'string' && w.trim())
  if (workspaces.length > 0) add('monorepo', oneProgram ? 0.75 : 2.5, 'It’s set up as a workspace that holds several separate packages together.')
  const pkgManifests = paths.filter((p) => /^(packages|apps|crates|libs|services|modules)\/[^/]+\/(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|setup\.py|pom\.xml)$/.test(p)).length
  if (pkgManifests >= 3) {
    add('monorepo', (1.5 + Math.min(pkgManifests / 10, 1.5)) * (oneProgram ? 0.3 : 1), `It contains ${count(pkgManifests, 'separate package')}, each with its own settings file.`)
  }
  if (paths.some((p) => /^(lerna|nx|turbo)\.json$|^pnpm-workspace\.yaml$|^go\.work$/.test(p))) add('monorepo', 1, 'It uses a tool for managing many packages in one repository.')

  // ── Libraries, command-line tools & plugins ─────────────────────────────────
  const appSignals = front.length + servers.length + sites.length
  if (rootPkg) {
    const hasMain = ['main', 'exports', 'module', 'types', 'typings'].some((k) => k in rootPkg)
    const isPrivate = rootPkg.private === true
    const bin = rootPkg.bin
    const engines = rootPkg.engines
    const pkgName = typeof rootPkg.name === 'string' ? rootPkg.name : ''
    if (bin && (typeof bin === 'string' || (typeof bin === 'object' && Object.keys(bin as object).length > 0))) add('cli-tool', 3, 'Its package.json installs a command you can type in the terminal.')
    if (hasMain && !isPrivate && appSignals === 0) add('library', 3, 'Its package.json describes a package other projects can install and use.')
    else if (hasMain && !isPrivate) add('library', 1.5, 'Its package.json lists a main file for other projects to use.')
    if (!hasMain && !isPrivate && !bin && appSignals === 0 && (pathSet.has('index.js') || pathSet.has('index.ts')) && pkgName) add('library', 2, 'It’s published as a package with a front-door index file for other projects to use.')
    if (engines && typeof engines === 'object' && 'vscode' in (engines as object)) add('plugin', 5, 'It’s an extension for the VS Code editor.')
    if (pkgName && PLUGIN_NAME_RE.test(pkgName)) add('plugin', 3.5, `Its name (${pkgName}) follows the naming pattern for plugins that extend another tool.`)
  }
  if (lowerBasenames.has('plugin.xml') && paths.some((p) => p.includes('META-INF/'))) add('plugin', 3, 'It’s laid out like a plugin for JetBrains code editors.')
  // [ \t]* rather than \s*: under /m, \s* would retry every run of blank lines from each line start (catastrophically slow).
  if (Object.entries(contents).some(([p, c]) => p.endsWith('.php') && depthOf(p) <= 1 && /^[ \t]*\*?[ \t]*Plugin Name:/m.test(c.slice(0, 3000)))) add('plugin', 5, 'It’s a WordPress plugin — an add-on for WordPress websites.')

  const pyproject = contents['pyproject.toml'] ?? ''
  const setupPy = contents['setup.py'] ?? ''
  const setupCfg = contents['setup.cfg'] ?? ''
  const pyPackaged = !!pyproject || !!setupPy || pathSet.has('setup.cfg')
  const pyCommand = (manifests.entryHints ?? []).map((h) => /^Runs when you type "([^"]{1,40})" in a terminal \((?:pyproject\.toml|setup\.py|setup\.cfg)\)/.exec(h?.reason ?? '')?.[1]).find(Boolean)
  if (pyCommand || /\[project\.scripts\]|\[tool\.poetry\.scripts\]|console_scripts/.test(pyproject + setupPy + setupCfg)) {
    add('cli-tool', 1.5, pyCommand ? `It installs a command you can type in the terminal (“${pyCommand}”).` : 'It installs a command you can type in the terminal.')
  }
  if (pyPackaged && appSignals === 0) {
    const pkgInit = paths.some((p) => /^(src\/)?[\w-]+\/__init__\.py$/.test(p))
    if (pkgInit) add('library', 2.5, 'It’s packaged so other Python projects can install it and use its code.')
  }
  const goMod = pathSet.has('go.mod')
  if (goMod) {
    const mainPkgs = Object.entries(contents).filter(([p, c]) => p.endsWith('.go') && !isPeripheral(p) && /^package\s+main\b/m.test(c))
    const cmdMain = mainPkgs.filter(([p]) => p.startsWith('cmd/') || p.includes('/cmd/')).length
    if (cmdMain > 0) add('cli-tool', 2.5, 'It has a “cmd” folder of programs you run from the terminal.')
    if (mainPkgs.length === 0 && files.some((f) => f.ext === 'go' && !isPeripheral(f.path))) add('library', 3, 'It’s a Go package other programs import — there’s no main program inside it.')
  }
  if (cargo) {
    if (cargo.hasPackage) {
      // Judge the root package itself; its workspace members are its building blocks.
      const lib = cargo.hasLib || pathSet.has('src/lib.rs')
      if (rootCargoBin) {
        const bin = cargo.bins.find((b) => b && !b.includes('/'))
        add('cli-tool', cargo.hasWorkspace || !lib ? 3 : 1.5, bin ? `Its main package builds the “${bin}” program you run from the terminal.` : 'It builds a program you run (it has a main.rs).')
      } else if (lib) {
        add('library', 3, 'It’s a Rust library (it has a lib.rs and no main program).')
      }
    } else {
      const lib = ownPaths.some((p) => /(^|\/)src\/lib\.rs$/.test(p))
      const main = ownPaths.some((p) => /(^|\/)src\/main\.rs$/.test(p) || /(^|\/)src\/bin\/[^/]+\.rs$/.test(p))
      if (lib && !main) add('library', 3, 'It’s a Rust library (it has a lib.rs and no main program).')
      if (main && !lib) add('cli-tool', 1, 'It builds a program you run (it has a main.rs).')
    }
  }
  if (paths.some((p) => p.endsWith('.gemspec') && depthOf(p) === 0)) add('library', 2.5, 'It’s packaged as a Ruby gem that other projects can install.')
  const composer = safeJson(contents['composer.json'])
  if (composer?.type === 'library') add('library', 2.5, 'Its composer.json says it’s a library for other PHP projects.')

  for (const { fw, s } of found(CLI_TOOLS).slice(0, 1)) add('cli-tool', s === 2 ? 2 : 1, uses(fw))
  if (core.some((f) => f.role === 'cli' && f.kind !== 'script')) add('cli-tool', 1, 'It has code that reads commands typed into the terminal.')
  // Saying "command-line" outright is stronger than how it happens to be packaged.
  const saysCli = /\b(command[- ]line|cli|terminal|shell tool)\b/.test(text)
  if (saysCli) add('cli-tool', 3, 'Its description says it’s used from the terminal.')

  // "an HTTP client for the API era" describes what a tool does, not that it's a library.
  if (/\b(framework|library|sdk|toolkit|bindings|wrapper)\b/.test(text)) {
    add('library', /\bframework\b/.test(text) ? 3 : 2.5, /\bframework\b/.test(text) ? 'Its description calls it a framework — a toolbox other programmers build on.' : 'Its description calls it a library — a toolbox other programmers plug into their own projects.')
  }
  if (/\b(npm (?:i|install)|yarn add|pnpm add|bun add|pip install|poetry add|uv add|go get|cargo add|composer require|dotnet add package|gem install)[ \t]+(?!-g\b|--global\b)[@\w]/.test(readmeHead)) {
    add('library', 1.5, 'The README shows how to add it to other projects.')
  }
  if (/\b(npm (?:i|install) (?:-g|--global)|brew install|pipx install|cargo install|go install|npx[ \t]+[\w@])/.test(readmeHead)) add('cli-tool', 1.5, 'The README shows how to install it as a command.')
  if (paths.some((p) => /^(examples?|demos?)\//i.test(p)) && (scores.get('library')?.score ?? 0) > 0) add('library', 1, 'It comes with examples showing other programmers how to use it.')

  // ── Decide ──────────────────────────────────────────────────────────────────
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
  const top = ranked[0]
  if (!top || top[1].score < 1.5) {
    const info = PROJECT_KIND_INFO.unknown
    return {
      id: 'unknown',
      label: info.label,
      description: info.description,
      emoji: info.emoji,
      confidence: 0.2,
      reasons: ['We didn’t find a clear sign of what kind of project this is, so we describe it in general terms.'],
    }
  }
  const [id, best] = top
  const second = ranked[1]?.[1].score ?? 0
  const margin = (best.score - second) / best.score
  const strengthOf = Math.min(1, best.score / 6)
  const confidence = Math.round(Math.min(0.97, Math.max(0.2, 0.25 + 0.45 * strengthOf + 0.3 * margin)) * 100) / 100
  const info = PROJECT_KIND_INFO[id]
  const reasons = [...best.reasons].sort((a, b) => b.weight - a.weight).slice(0, 4).map((r) => r.text)
  return { id, label: info.label, description: info.description, emoji: info.emoji, confidence, reasons }
}
