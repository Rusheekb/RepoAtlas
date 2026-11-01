import type { TechKnowledgeEntry } from '../types'

/** A programming language explained for non-technical readers. */
export interface LanguageInfo {
  id: string
  name: string
  description: string
  analogy: string
  url?: string
}

/**
 * Programming languages, keyed by catalog id. Descriptions say what the language is for and where you meet it,
 * in everyday words.
 */
const LANGUAGES: LanguageInfo[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    description:
      'The language every web browser understands. It makes web pages interactive (menus that open, forms that check what you typed) and can also run servers.',
    analogy: 'Like the electricity in a house: the walls (HTML) and paint (CSS) just sit there until JavaScript makes things switch on and move.',
    url: 'https://developer.mozilla.org/docs/Web/JavaScript',
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    description:
      'JavaScript with labels added. Programmers write down what kind of information each piece of code expects, so many mistakes are caught before the program ever runs.',
    analogy: 'Like a recipe that lists exact quantities and units: the cooking is the same, but far fewer "a pinch of what?" surprises.',
    url: 'https://www.typescriptlang.org',
  },
  {
    id: 'python',
    name: 'Python',
    description:
      'A popular, readable language that looks a lot like plain English. It is used for websites, automation, data analysis and most AI work.',
    analogy: 'Like a Swiss Army knife that is also easy to hold: not the fastest tool for every job, but handy for almost all of them.',
    url: 'https://www.python.org',
  },
  {
    id: 'go',
    name: 'Go',
    description:
      'A language from Google designed to be simple and fast. It is a favorite for servers, cloud tools and command-line programs that must handle many things at once.',
    analogy: 'Like a well-organized professional kitchen: few fancy gadgets, but everyone knows where everything is and orders go out quickly.',
    url: 'https://go.dev',
  },
  {
    id: 'rust',
    name: 'Rust',
    description:
      'A fast language with very strict safety rules that stop whole families of crashes and security holes. It is used where speed and reliability both matter.',
    analogy: 'Like a driving instructor who refuses to let the car move until every seatbelt is fastened: annoying at first, much safer on the road.',
    url: 'https://www.rust-lang.org',
  },
  {
    id: 'java',
    name: 'Java',
    description:
      'A long-established language used for large business systems, Android apps and back-office servers. Its code runs on almost any computer through the "Java Virtual Machine".',
    analogy: 'Like a shipping container standard: build the box once and it fits on any ship, train or truck.',
    url: 'https://dev.java',
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    description:
      'A modern, more concise cousin of Java. It is Google’s recommended language for Android apps and is also used for servers.',
    analogy: 'Like a newer model of a trusted car: same roads and parts, smoother to drive.',
    url: 'https://kotlinlang.org',
  },
  {
    id: 'scala',
    name: 'Scala',
    description: 'A language that runs alongside Java and mixes several programming styles. It is popular for big data processing.',
    analogy: 'Like a multi-tool that fits the same sockets as Java’s toolbox but adds extra attachments.',
    url: 'https://www.scala-lang.org',
  },
  {
    id: 'csharp',
    name: 'C#',
    description:
      'Microsoft’s main programming language (said "C sharp"). It is used for Windows programs, business websites and many video games made with Unity.',
    analogy: 'Like a well-equipped workshop supplied by one big manufacturer: everything fits together neatly.',
    url: 'https://learn.microsoft.com/dotnet/csharp/',
  },
  {
    id: 'fsharp',
    name: 'F#',
    description: 'A Microsoft language that treats a program like a set of math-style formulas. It is used for data-heavy and financial work.',
    analogy: 'Like a spreadsheet of formulas: each result is calculated from the inputs, with nothing changing behind your back.',
    url: 'https://fsharp.org',
  },
  {
    id: 'c',
    name: 'C',
    description:
      'One of the oldest widely used languages, very close to how the computer’s hardware works. Operating systems, devices and other languages are built with it.',
    analogy: 'Like driving a manual car with no driving aids: total control and great speed, but every mistake is yours.',
    url: 'https://en.wikipedia.org/wiki/C_(programming_language)',
  },
  {
    id: 'cpp',
    name: 'C++',
    description:
      'A powerful extension of C used where raw speed matters: games, web browsers, design software and trading systems.',
    analogy: 'Like a race car workshop: incredible performance if you know exactly what you are doing.',
    url: 'https://isocpp.org',
  },
  {
    id: 'objective-c',
    name: 'Objective-C',
    description: 'The language Apple used for iPhone and Mac apps before Swift. Older Apple code is often written in it.',
    analogy: 'Like the original blueprints of a house that has since been extended with newer materials.',
    url: 'https://developer.apple.com/documentation/objectivec',
  },
  {
    id: 'swift',
    name: 'Swift',
    description: 'Apple’s modern language for building apps on iPhone, iPad, Mac, Apple Watch and Apple TV.',
    analogy: 'Like a purpose-built kitchen designed by the company that also makes all the appliances.',
    url: 'https://www.swift.org',
  },
  {
    id: 'dart',
    name: 'Dart',
    description: 'A language from Google, best known as the language behind Flutter, which builds phone, web and desktop apps from one codebase.',
    analogy: 'Like a universal adapter: write once, plug into many kinds of devices.',
    url: 'https://dart.dev',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    description: 'A friendly language designed to make programmers happy. It powers many websites through the Ruby on Rails framework.',
    analogy: 'Like a well-written cookbook: the instructions read almost like conversation.',
    url: 'https://www.ruby-lang.org',
  },
  {
    id: 'php',
    name: 'PHP',
    description:
      'A language made for building websites on the server. It runs a huge share of the web, including WordPress.',
    analogy: 'Like the kitchen behind a restaurant counter: you never see it, but it prepares every page you are served.',
    url: 'https://www.php.net',
  },
  {
    id: 'lua',
    name: 'Lua',
    description: 'A small, lightweight language often tucked inside bigger programs so users can customize them, especially in games and editors.',
    analogy: 'Like a remote control that comes with a device: small, simple, and it lets you change how the bigger thing behaves.',
    url: 'https://www.lua.org',
  },
  {
    id: 'r',
    name: 'R',
    description: 'A language made by statisticians for analyzing data and drawing charts. It is common in research and science.',
    analogy: 'Like a scientific calculator that can also draw beautiful graphs and write the lab report.',
    url: 'https://www.r-project.org',
  },
  {
    id: 'julia',
    name: 'Julia',
    description: 'A language for scientific and numerical computing that aims to be as easy as Python and as fast as C.',
    analogy: 'Like a lab assistant who is both quick at arithmetic and easy to give instructions to.',
    url: 'https://julialang.org',
  },
  {
    id: 'shell',
    name: 'Shell (Bash)',
    description:
      'Short scripts of terminal commands that automate chores such as installing, building or starting the project.',
    analogy: 'Like a checklist you hand to an assistant: "open this, copy that, then press start".',
    url: 'https://www.gnu.org/software/bash/',
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    description: 'Microsoft’s scripting language for automating chores on Windows (and other) computers.',
    analogy: 'Like a to-do list a Windows computer can carry out on its own.',
    url: 'https://learn.microsoft.com/powershell/',
  },
  {
    id: 'elixir',
    name: 'Elixir',
    description: 'A language built for systems that must stay up and handle many users at once, such as chat apps and real-time dashboards.',
    analogy: 'Like a team of many small workers who each handle one customer, so if one trips the others keep going.',
    url: 'https://elixir-lang.org',
  },
  {
    id: 'erlang',
    name: 'Erlang',
    description: 'A language originally built for telephone networks, designed to keep running even when parts fail.',
    analogy: 'Like a power grid with automatic backups: one line goes down and the lights stay on.',
    url: 'https://www.erlang.org',
  },
  {
    id: 'haskell',
    name: 'Haskell',
    description: 'A language based on mathematical functions, known for catching mistakes early through very precise rules.',
    analogy: 'Like a carefully proven math equation: if it checks out on paper, it works in practice.',
    url: 'https://www.haskell.org',
  },
  {
    id: 'clojure',
    name: 'Clojure',
    description: 'A modern member of the Lisp family of languages that runs alongside Java, prized for simple, data-focused code.',
    analogy: 'Like building with a few kinds of very versatile blocks instead of hundreds of special parts.',
    url: 'https://clojure.org',
  },
  {
    id: 'ocaml',
    name: 'OCaml',
    description: 'A precise, math-inspired language used for compilers, finance and tools that must be correct.',
    analogy: 'Like an accountant who double-checks every column before signing off.',
    url: 'https://ocaml.org',
  },
  {
    id: 'perl',
    name: 'Perl',
    description: 'A veteran scripting language famous for processing text, still found in older servers and system tools.',
    analogy: 'Like a trusty old pocket knife: not shiny, but it has cut a lot of rope.',
    url: 'https://www.perl.org',
  },
  {
    id: 'groovy',
    name: 'Groovy',
    description: 'A scripting language that runs alongside Java. You mostly meet it in build files (Gradle) and automation pipelines (Jenkins).',
    analogy: 'Like the handwritten notes clipped to a factory’s machine manuals.',
    url: 'https://groovy-lang.org',
  },
  {
    id: 'elm',
    name: 'Elm',
    description: 'A language for building web page interfaces that promises no surprise crashes in the browser.',
    analogy: 'Like a kit with pieces that only fit together the right way.',
    url: 'https://elm-lang.org',
  },
  {
    id: 'coffeescript',
    name: 'CoffeeScript',
    description: 'A shorter way of writing JavaScript that was popular in the early 2010s. It is turned into regular JavaScript before it runs.',
    analogy: 'Like shorthand notes that a secretary types up into a full letter.',
    url: 'https://coffeescript.org',
  },
  {
    id: 'visual-basic',
    name: 'Visual Basic',
    description: 'A beginner-friendly Microsoft language often used for business tools and older Windows programs.',
    analogy: 'Like a well-labeled control panel for Windows programs.',
    url: 'https://learn.microsoft.com/dotnet/visual-basic/',
  },
  {
    id: 'html',
    name: 'HTML',
    description:
      'The language that describes what is on a web page: headings, paragraphs, images, links and buttons. Every website is built on it.',
    analogy: 'Like the frame and rooms of a house, before any paint or furniture.',
    url: 'https://developer.mozilla.org/docs/Web/HTML',
  },
  {
    id: 'css',
    name: 'CSS',
    description: 'The language that controls how web pages look: colors, fonts, spacing and layout.',
    analogy: 'Like the paint, wallpaper and furniture arrangement of a house.',
    url: 'https://developer.mozilla.org/docs/Web/CSS',
  },
  {
    id: 'sql',
    name: 'SQL',
    description: 'The language for asking questions of a database ("show me all orders from last week") and for changing what is stored.',
    analogy: 'Like filling in a request slip at a library desk: you describe what you want, the librarian fetches it.',
    url: 'https://en.wikipedia.org/wiki/SQL',
  },
  {
    id: 'solidity',
    name: 'Solidity',
    description: 'The main language for "smart contracts": small programs that run on the Ethereum blockchain and move digital money by fixed rules.',
    analogy: 'Like a vending machine contract: put in the right coins and it must hand over the snack, no shopkeeper needed.',
    url: 'https://soliditylang.org',
  },
  {
    id: 'zig',
    name: 'Zig',
    description: 'A young language aiming to be a simpler, safer alternative to C for fast, low-level software.',
    analogy: 'Like a modern manual car with a few smart safety features added.',
    url: 'https://ziglang.org',
  },
  {
    id: 'matlab',
    name: 'MATLAB',
    description: 'A commercial language and toolbox used by engineers and scientists for math, simulations and signal processing.',
    analogy: 'Like a giant engineering calculator with a built-in lab notebook.',
    url: 'https://www.mathworks.com/products/matlab.html',
  },
  {
    id: 'assembly',
    name: 'Assembly',
    description: 'Instructions written almost directly in the computer processor’s own vocabulary. Used for tiny, extremely fast or hardware-specific pieces.',
    analogy: 'Like giving directions one footstep at a time instead of saying "walk to the shop".',
    url: 'https://en.wikipedia.org/wiki/Assembly_language',
  },
]

/** Display names (as produced by the language detector) → catalog id. Covers languages and language-like formats. */
const DISPLAY_TO_ID: Record<string, string> = {
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  TSX: 'typescript',
  Python: 'python',
  Cython: 'python',
  Go: 'go',
  Rust: 'rust',
  Java: 'java',
  Kotlin: 'kotlin',
  Scala: 'scala',
  'C#': 'csharp',
  'F#': 'fsharp',
  C: 'c',
  'C++': 'cpp',
  Cuda: 'cpp',
  'Objective-C': 'objective-c',
  'Objective-C++': 'objective-c',
  Swift: 'swift',
  Dart: 'dart',
  Ruby: 'ruby',
  PHP: 'php',
  Hack: 'php',
  Lua: 'lua',
  Luau: 'lua',
  R: 'r',
  Julia: 'julia',
  Shell: 'shell',
  fish: 'shell',
  PowerShell: 'powershell',
  Elixir: 'elixir',
  Erlang: 'erlang',
  Haskell: 'haskell',
  Clojure: 'clojure',
  OCaml: 'ocaml',
  Perl: 'perl',
  Groovy: 'groovy',
  Elm: 'elm',
  CoffeeScript: 'coffeescript',
  'Visual Basic .NET': 'visual-basic',
  HTML: 'html',
  CSS: 'css',
  SQL: 'sql',
  PLpgSQL: 'sql',
  Solidity: 'solidity',
  Zig: 'zig',
  MATLAB: 'matlab',
  Assembly: 'assembly',
  // Language-like formats that belong to a tool or framework in the catalog.
  Vue: 'vue',
  Svelte: 'svelte',
  Astro: 'astro',
  'Jupyter Notebook': 'jupyter',
  Dockerfile: 'docker',
  Makefile: 'make',
  CMake: 'cmake',
  HCL: 'terraform',
  Prisma: 'prisma',
  GraphQL: 'graphql',
  SCSS: 'sass',
  Sass: 'sass',
  Less: 'less',
  'Protocol Buffer': 'protobuf',
  Blade: 'laravel',
  GDScript: 'godot',
  Gradle: 'gradle',
}

/** Formats that are not programming languages (never shown as a language in the tech stack). */
export const NON_CODE_LANGUAGES: ReadonlySet<string> = new Set([
  'markdown',
  'mdx',
  'restructuredtext',
  'asciidoc',
  'org',
  'tex',
  'bibtex',
  'text',
  'json',
  'json5',
  'yaml',
  'toml',
  'xml',
  'svg',
  'ini',
  'csv',
  'tsv',
  'dotenv',
  'editorconfig',
  'ignore list',
  'git config',
  'git attributes',
  'go module',
  'go checksums',
  'pip requirements',
  'procfile',
  'diff',
  'lockfile',
  'nginx',
  'caddyfile',
  'r markdown',
])

export const LANGUAGE_INFO: ReadonlyMap<string, LanguageInfo> = new Map(LANGUAGES.map((l) => [l.id, l]))

const DISPLAY_LOWER = new Map(Object.entries(DISPLAY_TO_ID).map(([k, v]) => [k.toLowerCase(), v]))

/** Catalog id for a language display name ("TSX" → "typescript", "Vue" → "vue"); undefined when unknown. */
export function languageTechId(displayName: string): string | undefined {
  return DISPLAY_TO_ID[displayName] ?? DISPLAY_LOWER.get(displayName.toLowerCase())
}

/** Kebab-case slug for language names we have no entry for ("Common Lisp" → "common-lisp"). */
export function languageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'unknown'
}

/** Catalog entries for every language above. */
export const LANGUAGE_ENTRIES: TechKnowledgeEntry[] = LANGUAGES.map((l) => ({
  id: l.id,
  name: l.name,
  category: 'language',
  description: l.description,
  analogy: l.analogy,
  url: l.url,
  importance: 'core',
  // TypeScript is also installed as a tool, so its package is evidence too.
  ...(l.id === 'typescript' ? { packages: { npm: ['typescript'] }, files: ['tsconfig.json'] } : {}),
}))
