# 🗺️ RepoAtlas

**See how any GitHub project works — explained visually, in plain English.**

RepoAtlas turns any public GitHub repository into maps, diagrams and friendly explanations, so people with *no programming background* can understand what's going on under the hood — and anyone can learn a new codebase much faster.

**▶ Use it now: https://rusheekb.github.io/Explain-everything/**

Paste a link like `github.com/pallets/flask` and explore.

---

## What you get

| View | What it shows |
| --- | --- |
| 🔭 **The Big Picture** | What the project is, who it's for, what it's built with, its main parts, where it starts, and a suggested learning path. |
| 🗺️ **How It Connects** | An interactive architecture map: each box is a part of the project, arrows show which parts use which. Click any box for an explanation, or look inside to see its files. |
| 🧱 **Where Code Lives** | A zoomable “city map” of every file, sized by how much code it holds and colored by what kind of code it is. |
| 💡 **Key Ideas** | A concept map of the important ideas behind the project and how they relate. |
| 🧭 **Guided Tours** | Step-by-step walkthroughs (“Where does it all begin?”, “What happens when someone visits the app?”) that move through the real code. With Claude, ask for a tour of anything: *“How does login work?”* |
| 📂 **Read the Code** | A file browser with syntax highlighting, and a plain-English explanation beside every file. Select any lines to have them explained. |
| 💬 **Ask a Question** | Chat about the project with Claude. Answers point to real files you can click. |
| 🎓 **Test Yourself** | A quick quiz to check what you've learned. |
| 📘 **Glossary** | 170+ technical words explained simply, with everyday analogies. Terms are linked throughout the app. |

Claude's explanations can be pitched at your level — **Totally new** (the default), **Beginner**, **Some experience** or **Developer**.

## How it works

1. **Reads the repository from GitHub, in your browser.** RepoAtlas downloads the file list and the most important files directly from GitHub. There is no RepoAtlas server.
2. **Analyzes the code.** It detects languages, frameworks and tools (with a built-in knowledge base of 220+ technologies), follows `import` statements to see which files depend on which (JavaScript/TypeScript, Python, Go, Rust, Java/Kotlin, C#, C/C++, Ruby, PHP, Swift, Dart and more), finds where the program starts, and groups files into the project's main parts.
3. **Explains it.** Everything above works instantly and for free, using built-in heuristics. Add your own Claude API key to unlock in-depth explanations, smarter concept maps, custom tours, quizzes and chat — powered by **Claude Opus 5.5** by default.

## Optional: add your Claude API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. In RepoAtlas, open **Settings → Claude AI** and paste it.

You pay Anthropic directly for what you use. With Opus 5.5 and the default “Balanced” amount of code, the first answer about a project costs about 40¢, because Claude reads the code first; follow-up answers within the hour cost roughly 5–10¢ each, because RepoAtlas reuses that background (prompt caching). Sonnet and Haiku cost less, and so does reading less code per answer. You can pick Claude Opus 5.5 (most capable, default), Sonnet 5.5 (faster, cheaper) or Haiku 5.5 (fastest, cheapest), and choose how much code Claude reads per answer.

No key? Every AI feature also offers **“Copy a ready-made prompt”** that you can paste into [claude.ai](https://claude.ai).

## Optional: add a GitHub token

Without a token GitHub allows about 60 requests per hour (each repository costs ~3, and revisits within 10 minutes are cached). A free [fine-grained token](https://github.com/settings/personal-access-tokens/new) with read-only access to public repositories raises that to 5,000 — and lets you explore your own private repositories (grant *Contents: read*).

## Privacy

- Everything runs in your browser. Repository data is only fetched from GitHub; AI requests go straight from your browser to Anthropic.
- Keys are kept in this tab only, unless you choose “Remember my keys on this device”. Remembered keys are stored in plain text in your browser's storage for this web address, and the public site shares its address (`rusheekb.github.io`) with every other GitHub Pages site of that account, so any page there could read them. Only turn it on for a computer you trust, or run RepoAtlas from your own copy.
- Code from private repositories, and Claude's answers about it, are only saved on this device while “Remember my keys” is on. “Forget my keys now” (or turning that setting off) removes them, along with private projects in your Recent list.
- Analyses and AI answers for public projects are cached in your browser (IndexedDB) and can be cleared in **Settings → Privacy & data**.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # static site in dist/
```

Tech: Vite, React 19, TypeScript, Tailwind CSS v4, React Flow + dagre (graphs), d3-hierarchy / d3-force (treemap, concept map), Shiki (syntax highlighting), Zustand, and the official Anthropic TypeScript SDK.

```
src/
  github/      fetch repo metadata, file tree and contents (with caching & friendly errors)
  analysis/    languages, imports & resolution, symbols, routes, classification, modules, summaries, tours
  knowledge/   tech catalog, manifest parsers, glossary, folder conventions — the plain-English "teacher's notes"
  ai/          Claude client, repo context builder, prompts, structured outputs, React hooks
  components/  UI kit, graphs, code viewer, shell
  pages/       one page per view
```

### Deployment

Every push to `main` runs the type checks and tests, builds the site, and publishes `dist/` to the `gh-pages` branch (`.github/workflows/deploy.yml`), which GitHub Pages serves.
