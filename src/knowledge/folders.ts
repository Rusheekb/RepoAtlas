import type { Layer } from '@/core/types'
import type { FolderEvidence, FolderRole } from './types'

const F = (role: string, emoji: string, layer: Layer, description: string, requires?: FolderEvidence): FolderRole =>
  requires ? { role, description, emoji, layer, requires } : { role, description, emoji, layer }

/** Each role once, with every conventional folder name (lower-case) that means it. */
const DEFINITIONS: [names: string[], role: FolderRole][] = [
  // ── Main code ─────────────────────────────────────────────────────────────
  [['src', 'source', 'sources'], F('Main code', '📝', 'logic', 'The heart of the project: the code people actually wrote lives in here.')],
  [['lib'], F('Core code library', '📚', 'logic', 'Reusable code that the rest of the project (or other projects) builds on.')],
  [['app', 'application'], F('The application', '📱', 'logic', 'The main application itself; in some web frameworks, each folder in here is also a page address.')],
  [['core', 'kernel', 'foundation'], F('Core logic', '⚙️', 'logic', 'The central rules and machinery everything else depends on.')],
  [['common', 'shared', 'base'], F('Shared code', '🤝', 'logic', 'Pieces used by many different parts of the project, kept in one place to avoid duplicates.')],
  [['utils', 'util', 'utilities', 'helpers', 'helper', 'misc', 'support'], F('Helpers', '🧰', 'logic', 'Small, handy tools used all over the code, like formatting dates or tidying text.')],
  [['internal'], F('Private code', '🔒', 'logic', 'Code meant only for this project’s own use, not for outside programs (a convention in Go and other languages).')],
  [['pkg'], F('Reusable packages', '📦', 'logic', 'Go projects keep code here that other programs are welcome to reuse.', 'go-code')],
  [['cmd'], F('Programs to run', '▶️', 'api', 'Each folder in here is a separate program you can start, such as a server or a command-line tool (a Go convention).')],
  [['main'], F('Main program code', '🏁', 'logic', 'The primary code: in Java and Kotlin projects the real app lives under src/main, and in Electron apps this is the behind-the-scenes "main process".')],
  [['engine', 'runtime'], F('Engine', '🚂', 'logic', 'The machinery that does the heavy lifting and runs everything else.')],
  [['features', 'feature'], F('Features', '✨', 'logic', 'Code grouped by feature, so everything for one capability (like checkout or search) sits together.')],
  [['domain', 'domains', 'business'], F('Business rules', '🏛️', 'logic', 'The core ideas and rules of the problem being solved, kept separate from screens and databases.')],
  [['services', 'service'], F('Services', '🛎️', 'logic', 'Code that does specific jobs for the rest of the app, like sending emails or charging payments; in some repos, separate programs.')],
  [['algorithms', 'algorithm', 'math', 'calc'], F('Algorithms', '🧮', 'logic', 'Step-by-step recipes for calculations and problem-solving.')],
  [['parsers', 'parser', 'compiler', 'lexer', 'tokenizer'], F('Text readers', '🔍', 'logic', 'Code that reads text or code and works out its structure.')],
  [['include', 'includes', 'headers'], F('Shared declarations', '📑', 'logic', 'Header files that describe what C or C++ code provides, so other files can use it.')],
  [['plugins', 'plugin', 'extensions', 'addons', 'add-ons'], F('Plug-ins', '🔌', 'logic', 'Optional add-ons that extend what the project can do.')],
  [['validators', 'validator', 'validation'], F('Input checks', '✔️', 'logic', 'Rules that check information is complete and sensible before it is used.')],
  [['errors', 'error', 'exceptions'], F('Error definitions', '⚠️', 'logic', 'The kinds of things that can go wrong, named and described so the app can explain and handle them.')],
  [['logger', 'logging', 'telemetry', 'monitoring', 'observability'], F('Logging & monitoring', '📈', 'logic', 'Code that records what the app is doing and reports problems, so the team can spot and fix them.')],
  [['cache', 'caching'], F('Caching', '🗃️', 'logic', 'Code that keeps copies of results close at hand, so they don’t have to be fetched or calculated again.')],
  [['decorators'], F('Decorators', '🎀', 'logic', 'Reusable labels that add extra behavior to other code, such as logging or permission checks.')],
  [['polyfills', 'shims'], F('Compatibility fillers', '🩹', 'other', 'Small patches that add missing features to older browsers or systems.')],
  [['security', 'auth', 'authentication', 'authorization', 'permissions'], F('Sign-in & security', '🔐', 'logic', 'Code for logging in, checking who is allowed to do what, and keeping things safe.')],
  [['admin', 'backoffice', 'back-office'], F('Admin area', '🛠️', 'logic', 'Tools for the people who run the app: managing users, content and settings.')],

  // ── Screens & visuals ─────────────────────────────────────────────────────
  [['components', 'component'], F('Reusable screen pieces', '🧩', 'ui', 'Building blocks of the interface, like buttons, cards and menus, reused across many screens.')],
  [['ui', 'design-system', 'primitives', 'widgets', 'elements'], F('Interface kit', '🎛️', 'ui', 'The basic, reusable visual pieces the app’s screens are assembled from.')],
  [['pages', 'page'], F('Pages', '📄', 'ui', 'Whole screens people can visit; in many frameworks each file here becomes its own web address.')],
  [['views', 'view'], F('Screens', '🖼️', 'ui', 'The screens or page templates that show information to people.')],
  [['screens', 'screen'], F('App screens', '📱', 'ui', 'Each file is a full screen of the app, such as Home, Settings or Profile.')],
  [['routes', 'route', 'router', 'routing'], F('Web addresses', '🧭', 'api', 'Code that decides what happens for each web address, like /login or /orders.')],
  [['layouts', 'layout'], F('Page frames', '🪟', 'ui', 'The shared frame around pages: headers, sidebars and footers.')],
  [['templates', 'template'], F('Templates', '📋', 'ui', 'Page or email designs with blanks the app fills in, or starter files to copy.')],
  [['partials', 'fragments', 'snippets'], F('Page fragments', '🧱', 'ui', 'Small reusable chunks of a page, like a navigation bar, slotted into many templates.')],
  [['sections', 'blocks'], F('Page sections', '🧱', 'ui', 'Larger chunks of a page, like a hero banner or a pricing table.')],
  [['navigation', 'nav'], F('Navigation', '🧭', 'ui', 'Menus, tabs and links that help people move around the app.')],
  [['hooks', 'hook'], F('Reusable behaviors', '🪝', 'ui', 'Bundles of behavior that screen pieces plug in, like "load the current user" (common in React).')],
  [['composables'], F('Reusable behaviors', '🪝', 'ui', 'Vue’s bundles of reusable behavior that screens plug in, like "track the mouse".')],
  [['directives'], F('Page behaviors', '🪄', 'ui', 'Little instructions attached to page elements to give them extra behavior (Angular and Vue).')],
  [['mixins'], F('Shared style or behavior', '🧪', 'ui', 'Reusable bundles of styles or behavior mixed into other pieces.')],
  [['js', 'javascripts', 'client-scripts'], F('Browser scripts', '📜', 'ui', 'JavaScript files that make the web pages interactive.')],
  [['styles', 'style', 'css', 'scss', 'sass', 'less', 'stylesheets'], F('Styling', '🎨', 'ui', 'Colors, fonts, spacing and layout rules that control how everything looks.')],
  [['theme', 'themes', 'theming'], F('Themes', '🌈', 'ui', 'Color schemes and visual styles, such as light and dark mode.')],
  [['frontend', 'front-end', 'client', 'web', 'webapp', 'web-app', 'gui'], F('Front end', '🖥️', 'ui', 'The part of the project people see and use, usually running in a web browser.')],
  [['dashboard', 'dashboards'], F('Dashboard', '📊', 'ui', 'Screens that summarize information at a glance with numbers and charts.')],
  [['i18n', 'l10n', 'locales', 'locale', 'lang', 'langs', 'translations', 'translation'], F('Translations', '🌍', 'ui', 'The app’s text in different languages, so it can speak to people around the world.')],
  [['emails', 'email', 'mail', 'mailers', 'mailer'], F('Emails', '✉️', 'logic', 'Email designs and the code that sends them, like welcome messages and receipts.')],
  [['notifications'], F('Notifications', '🔔', 'logic', 'Code that alerts people by email, text message or push notification.')],
  [['popup'], F('Extension pop-up', '🪟', 'ui', 'The small window that opens when you click a browser extension’s icon.')],
  [['content-scripts', 'contentscripts'], F('Page add-ons', '🧷', 'logic', 'Browser-extension code that runs inside the web pages you visit.')],
  [['renderer'], F('App window', '🖼️', 'ui', 'The visible window of a desktop app (Electron), built like a web page.', 'desktop-shell')],
  [['preload'], F('Window bridge', '🌉', 'logic', 'A small safe bridge between a desktop app’s window and the computer’s system features.', 'desktop-shell')],
  [['src-tauri'], F('Desktop shell', '🖥️', 'logic', 'The Rust side of a Tauri desktop app, which talks to the computer on behalf of the interface.')],
  [['scenes', 'levels'], F('Game scenes', '🎬', 'ui', 'The different screens or levels of a game.', 'game')],

  // ── App memory (state) ────────────────────────────────────────────────────
  [['store', 'stores', 'state', 'redux', 'vuex', 'pinia', 'zustand'], F('App memory', '🧠', 'logic', 'Where the app keeps track of shared information while it runs, like who is logged in or what is in the cart.')],
  [['context', 'contexts', 'providers', 'provider'], F('Shared context', '🌐', 'logic', 'Information made available to every screen piece below it, like the current theme or user.')],
  [['slices', 'reducers', 'actions', 'selectors', 'sagas', 'epics', 'effects'], F('Memory updates', '🔄', 'logic', 'The rules for how the app’s shared memory changes and is read (Redux-style state).')],
  [['atoms'], F('Tiny pieces', '⚛️', 'ui', 'The smallest building blocks: either tiny interface pieces (atomic design) or tiny shared values (state tools like Jotai).')],

  // ── Connections ───────────────────────────────────────────────────────────
  [['api', 'apis', 'rest'], F('API', '🔌', 'api', 'How the project talks to the outside world: the requests it answers or the services it calls.')],
  [['server', 'backend', 'back-end', 'servers'], F('Server side', '🗄️', 'api', 'The behind-the-scenes part that runs on a server, stores data and applies the rules.')],
  [['controllers', 'controller'], F('Request handlers', '🎮', 'api', 'Code that receives each request, coordinates the work, and sends back the answer.')],
  [['handlers', 'handler'], F('Handlers', '🛎️', 'api', 'Code that responds to specific requests or events.')],
  [['endpoints', 'endpoint'], F('API endpoints', '📮', 'api', 'Each file answers specific web addresses of the project’s API.')],
  [['middleware', 'middlewares'], F('Checkpoints', '🚧', 'api', 'Steps every request passes through, like checking logins or recording visits.')],
  [['guards', 'interceptors', 'pipes', 'filters'], F('Request checkpoints', '🛂', 'api', 'Steps that check, transform or block requests before or after they are handled.')],
  [['resolvers', 'resolver'], F('Data answerers', '💡', 'api', 'Functions that fetch the data for each field a GraphQL request asks for.')],
  [['graphql', 'gql'], F('GraphQL API', '🕸️', 'api', 'The menu of data the app offers through GraphQL, and the code that answers it.')],
  [['proto', 'protos', 'protobuf', 'grpc'], F('Message formats', '📨', 'api', 'Definitions of the messages programs send each other, used to generate code automatically.')],
  [['queries', 'mutations'], F('Data requests', '❓', 'api', 'Prepared questions (and changes) the app sends to its data source.')],
  [['functions', 'lambdas', 'lambda', 'serverless'], F('Cloud functions', '☁️', 'api', 'Small pieces of server code that a cloud service runs on demand, with no server to manage.')],
  [['webhooks', 'webhook'], F('Webhooks', '🪝', 'api', 'Code that receives automatic notifications from other services, like "payment received".')],
  [['clients', 'sdk', 'sdks', 'api-client', 'api-clients'], F('Outside connections', '📡', 'api', 'Code that talks to other servers and services over the internet.')],
  [['integrations', 'connectors', 'adapters', 'adapter', 'gateways', 'gateway'], F('Integrations', '🔗', 'api', 'Connectors to outside services and tools, each wrapped so the rest of the app stays simple.')],
  [['cli', 'commands', 'command'], F('Commands', '⌨️', 'api', 'The commands people type in a terminal (or send to a bot) and the code that runs for each.')],
  [['bot', 'bots', 'cogs'], F('Bot', '🤖', 'api', 'Code for a chat bot that listens for messages and replies automatically.')],
  [['events', 'listeners', 'subscribers', 'observers'], F('Event reactions', '📣', 'logic', 'Code that reacts when something happens, like "a new user signed up".')],
  [['jobs', 'workers', 'worker', 'tasks', 'queues', 'queue', 'background'], F('Background jobs', '⏳', 'logic', 'Slow or scheduled work done behind the scenes, so the app stays fast for people.')],
  [['cron', 'schedules', 'schedulers', 'scheduler', 'crons'], F('Scheduled tasks', '⏰', 'logic', 'Jobs that run automatically on a timetable, like nightly backups.')],

  // ── Data & storage ────────────────────────────────────────────────────────
  [['models', 'model'], F('Data models', '🧾', 'data', 'Descriptions of the kinds of things the app stores, like a User, an Order or a Product.')],
  [['entities', 'entity'], F('Data entities', '🧾', 'data', 'The main kinds of things the app deals with, each described with its fields.')],
  [['schemas', 'schema'], F('Data rules', '📐', 'data', 'Definitions of what valid information looks like: which fields exist and what goes in them.')],
  [['types', 'typings', 'interfaces', 'contracts', 'typedefs'], F('Type definitions', '🏷️', 'data', 'Descriptions of the shapes of data, so mistakes are caught before the code runs.')],
  [['dto', 'dtos'], F('Data packages', '📦', 'data', 'Simple shapes for the information passed between parts of the app or over the network.')],
  [['serializers', 'serializer', 'mappers'], F('Data translators', '🔁', 'data', 'Code that converts stored information to and from formats like JSON for sending.')],
  [['db', 'database', 'databases', 'persistence', 'storage'], F('Database', '🗄️', 'data', 'Code and settings for storing information permanently.')],
  [['migrations', 'migration', 'migrate'], F('Database changes', '🪜', 'data', 'Numbered steps that change the database structure over time, applied in order everywhere.')],
  [['seeds', 'seed', 'seeders', 'seeder', 'seed-data'], F('Starter data', '🌱', 'data', 'Sample information loaded into a fresh database, like demo users or categories.')],
  [['repositories', 'repository', 'repos', 'dao', 'daos'], F('Data access', '🗃️', 'data', 'Code that reads and writes records in storage, so the rest of the app doesn’t have to.')],
  [['sql'], F('SQL files', '🗒️', 'data', 'Database instructions and questions written in SQL.')],
  [['prisma', 'drizzle'], F('Database toolkit', '🗄️', 'data', 'The database description and helper files for an ORM (a tool that lets code talk to the database).')],
  [['alembic'], F('Database changes', '🪜', 'data', 'Alembic’s numbered database changes for a Python project.')],
  [['loaders', 'loader', 'fetchers'], F('Data loaders', '📥', 'data', 'Code that fetches the information a screen needs before showing it.')],
  [['data', 'dataset', 'datasets', 'raw', 'processed'], F('Data files', '📊', 'data', 'Information the project works with, such as spreadsheets, sample records or prepared datasets.')],
  [['checkpoints', 'weights'], F('Saved AI models', '💾', 'data', 'Files holding what an AI model has learned, so it can be reused without retraining.')],

  // ── Data science & AI ─────────────────────────────────────────────────────
  [['notebooks', 'notebook', 'nbs'], F('Notebooks', '📓', 'logic', 'Interactive documents mixing notes, code and charts, used to explore data step by step.')],
  [['training', 'train'], F('Model training', '🏋️', 'logic', 'Code that teaches an AI model by showing it many examples.')],
  [['inference', 'predict', 'serving'], F('Using the model', '🔮', 'logic', 'Code that uses a trained AI model to make predictions or answers.')],
  [['pipelines', 'pipeline', 'dags', 'etl'], F('Processing pipelines', '🏭', 'logic', 'Chains of steps that move and transform data (or work) from start to finish.')],
  [['analysis', 'analytics', 'eda'], F('Analysis', '🔬', 'logic', 'Code that explores data to find patterns and answers.')],
  [['reports', 'results', 'outputs', 'figures', 'plots'], F('Results', '📈', 'other', 'Charts, tables and other outputs produced by running the code.')],
  [['research', 'papers'], F('Research notes', '🧑‍🔬', 'docs', 'Write-ups, papers and notes behind the project’s ideas.')],
  [['prompts'], F('AI prompts', '💬', 'logic', 'The written instructions the app sends to an AI model.')],
  [['agents', 'agent'], F('AI agents', '🤖', 'logic', 'Code for AI helpers that work through tasks step by step using tools.')],

  // ── Tests ─────────────────────────────────────────────────────────────────
  [['tests', 'test', '__tests__', 'testing', 'specs', 'spec', 't'], F('Automated tests', '✅', 'test', 'Code that automatically checks the rest of the project still works after every change.')],
  [['e2e', 'end-to-end', 'acceptance', 'cypress', 'playwright', 'integration', 'integration-tests', 'functional-tests'], F('Whole-app tests', '🧭', 'test', 'Tests that use the app like a real person would, clicking through complete journeys.')],
  [['unit', 'unit-tests'], F('Unit tests', '🔬', 'test', 'Small tests that each check one piece of code on its own.')],
  [['fixtures', 'fixture', '__fixtures__', 'testdata', 'test-data', 'test_data', 'testfiles'], F('Test samples', '🧪', 'test', 'Example data and files used by the tests, not part of the real app.')],
  [['mocks', '__mocks__', 'mock', 'stubs', 'fakes', 'doubles'], F('Test stand-ins', '🎭', 'test', 'Pretend versions of real services (like payments) so tests can run safely and predictably.')],
  [['test-utils', 'testutils', 'test-helpers', 'testhelpers', 'testlib'], F('Test helpers', '🧰', 'test', 'Handy tools shared by many tests.')],
  [['__snapshots__', 'snapshots'], F('Test snapshots', '📸', 'test', 'Saved copies of earlier output that tests compare against to spot unexpected changes.')],
  [['benchmarks', 'benchmark', 'bench', 'benches', 'perf', 'performance'], F('Speed tests', '⏱️', 'test', 'Code that measures how fast parts of the project run.')],
  [['coverage', '.nyc_output', 'htmlcov'], F('Test coverage reports', '🗺️', 'test', 'Generated reports showing which lines of code the tests actually exercised.')],
  [['qa'], F('Quality checks', '🔎', 'test', 'Material for checking the project works as intended.')],
  [['stories', 'storybook', '.storybook'], F('Component showroom', '🖼️', 'docs', 'Examples of each interface piece shown on its own, for browsing and visual testing (Storybook).')],

  // ── Documentation & examples ──────────────────────────────────────────────
  [['docs', 'doc', 'documentation', 'guides', 'guide', 'manual', 'handbook', 'wiki', 'help'], F('Documentation', '📖', 'docs', 'Written guides and explanations for people using or working on the project.')],
  [['adr', 'adrs', 'decisions', 'rfcs', 'rfc', 'proposals', 'design-docs'], F('Design decisions', '🧭', 'docs', 'Write-ups explaining important choices the team made and why.')],
  [['examples', 'example', 'samples', 'sample', 'demos', 'demo', 'tutorials', 'tutorial', 'cookbook', 'recipes'], F('Examples', '💡', 'docs', 'Sample projects and snippets showing how to use this project. They aren’t part of the main code.')],
  [['website', 'site', 'docs-site', 'homepage'], F('Project website', '🌐', 'docs', 'The project’s own website, often its documentation or landing page.')],
  [['blog', 'posts', 'articles', 'news'], F('Blog posts', '📰', 'docs', 'Written posts and articles published on the site.')],
  [['content', 'contents'], F('Website content', '📝', 'docs', 'The words and media that appear on the site, often as Markdown files.')],
  [['playground', 'sandbox', 'experiments', 'experimental', 'labs', 'scratch', 'poc', 'prototypes'], F('Experiments', '🧪', 'other', 'A space for trying things out; not necessarily part of the finished product.')],
  [['legacy', 'deprecated', 'archive', 'archived', 'old', 'attic', 'obsolete'], F('Old code', '🏚️', 'other', 'Older code kept for reference or backwards compatibility, usually not where new work happens.')],
  [['contrib', 'community'], F('Contributed extras', '🎁', 'other', 'Add-ons and extras contributed by the community, maintained separately from the core.')],

  // ── Settings & setup ──────────────────────────────────────────────────────
  [['config', 'configs', 'configuration', 'configurations', 'conf', 'settings', '.config', 'cfg'], F('Settings', '🎛️', 'config', 'Configuration files that tell the app and its tools how to behave.')],
  [['env', 'envs', 'environments', 'environment'], F('Environment settings', '🌡️', 'config', 'Settings for each place the app runs, like a developer’s laptop, testing and the live site.')],
  [['constants', 'constant', 'consts'], F('Fixed values', '📌', 'config', 'Values that never change while the app runs, collected in one place.')],
  [['.vscode', '.idea', '.fleet', '.zed'], F('Editor settings', '📝', 'config', 'Settings for code editors like VS Code, shared so everyone has the same setup.')],
  [['.husky', '.githooks', 'githooks'], F('Pre-save checks', '🐶', 'config', 'Automatic checks that run before changes are saved to the project history.')],
  [['.changeset', 'changesets'], F('Release notes in progress', '🗒️', 'config', 'Notes about upcoming changes, gathered for the next version’s release notes.')],
  [['.devcontainer'], F('Ready-made workspace', '🧳', 'config', 'Settings for a one-click coding environment (VS Code Dev Containers, GitHub Codespaces).')],

  // ── Build, deploy & automation ────────────────────────────────────────────
  [['.github'], F('GitHub settings', '🐙', 'infra', 'GitHub-specific files: automation pipelines, issue templates and contribution rules.')],
  [['workflows', '.circleci', '.gitlab', '.buildkite', 'ci', '.ci', '.azure-pipelines', '.woodpecker'], F('Automation pipelines', '🔁', 'infra', 'Instructions for robots that test, build and publish the project on every change.')],
  [['scripts', 'script', 'bin', 'hack', 'dev-scripts'], F('Scripts', '📜', 'infra', 'Small programs that automate chores like setting up, building or releasing the project.')],
  [['tools', 'tool', 'tooling', 'devtools', 'dev-tools'], F('Developer tools', '🔧', 'infra', 'Helper programs used while developing the project, not part of what users run.')],
  [['build', 'builds', 'dist', 'out', 'output', 'target', 'release', 'releases', 'artifacts', '.next', '.nuxt', '.svelte-kit', '.output'], F('Build output', '🏗️', 'other', 'Files produced automatically from the source code. You don’t edit these; they are regenerated.', 'generated')],
  [['generated', 'gen', '__generated__', 'codegen', 'autogen', 'auto-generated'], F('Generated code', '🤖', 'other', 'Code written automatically by a tool; it is recreated from its source, so it isn’t edited by hand.')],
  [['deploy', 'deployment', 'deployments'], F('Deployment', '🚀', 'infra', 'Instructions for putting the project live on servers or in the cloud.')],
  [['infra', 'infrastructure', 'ops', 'devops', 'iac'], F('Infrastructure', '🏗️', 'infra', 'Descriptions of the servers, networks and cloud services the project runs on.')],
  [['terraform', 'tf', 'pulumi', 'cdk'], F('Cloud blueprints', '🗺️', 'infra', 'Infrastructure-as-code files that create the project’s cloud servers and services automatically.')],
  [['k8s', 'kubernetes', 'kube', 'manifests', 'kustomize', 'overlays'], F('Kubernetes setup', '☸️', 'infra', 'Instructions for running the app’s containers on a Kubernetes cluster of servers.')],
  [['helm', 'charts', 'chart'], F('Helm charts', '⛵', 'infra', 'Packaged, configurable Kubernetes setups for installing the app.', 'helm-chart')],
  [['docker', '.docker', 'containers', 'container', 'dockerfiles'], F('Container setup', '📦', 'infra', 'Recipes for packing the app into containers that run the same on any computer.')],
  [['ansible', 'playbooks', 'roles', 'provisioning', 'puppet', 'chef', 'salt'], F('Server setup', '🛠️', 'infra', 'Step-by-step instructions that set up and configure servers automatically.')],
  [['nginx', 'apache', 'caddy', 'proxy'], F('Web server setup', '🚦', 'infra', 'Configuration for the web server that sits in front of the app and directs traffic.')],
  [['logs', 'log', 'tmp', 'temp', '.tmp', '.cache'], F('Temporary files', '🗑️', 'other', 'Logs and scratch files created while the app runs; not part of the real code.')],

  // ── Assets ────────────────────────────────────────────────────────────────
  [['public', 'static', 'www', 'wwwroot', 'webroot', 'htdocs'], F('Public files', '🌍', 'other', 'Files served to visitors exactly as they are, like the site icon, images and robots.txt.')],
  [['assets', 'asset', 'resources', 'res', 'media'], F('Assets', '🖼️', 'other', 'Images, fonts, sounds and other media the project uses.')],
  [['images', 'image', 'img', 'imgs', 'pictures', 'photos', 'screenshots', 'sprites', 'textures'], F('Images', '🖼️', 'other', 'Pictures and graphics used by the project or its documentation.')],
  [['icons', 'icon', 'svg', 'svgs'], F('Icons', '⭐', 'other', 'Small pictures used as icons on buttons and menus.')],
  [['fonts', 'font', 'typefaces'], F('Fonts', '🔤', 'other', 'Typeface files that give the text its look.')],
  [['audio', 'sounds', 'sound', 'music', 'sfx'], F('Sounds', '🔊', 'other', 'Sound effects and music files.')],
  [['videos', 'video'], F('Videos', '🎞️', 'other', 'Video files used by the project or its documentation.')],
  [['uploads', 'downloads'], F('Uploaded files', '📤', 'other', 'Files people upload or download while using the app.')],

  // ── Containers of other projects ──────────────────────────────────────────
  [['packages'], F('Packages', '📦', 'other', 'Several separate packages kept together in one repository; each folder inside is its own project.')],
  [['apps'], F('Apps', '🗂️', 'other', 'Several separate applications (for example a website and a mobile app) kept in one repository.')],
  [['libs'], F('Libraries', '📚', 'other', 'Shared libraries used by the apps in this repository; each folder is its own package.')],
  [['crates'], F('Rust packages', '🦀', 'other', 'Separate Rust packages ("crates") that together make up the project.')],
  [['modules', 'module'], F('Modules', '🧱', 'other', 'Self-contained parts of the project, each handling one area.')],
  [['projects', 'workspaces', 'sub-projects', 'subprojects'], F('Sub-projects', '🗂️', 'other', 'Several related projects kept together in one repository.')],
  [['vendor', 'vendors', 'third_party', 'third-party', 'thirdparty', 'external', 'externals', 'deps'], F('Borrowed code', '📥', 'other', 'Copies of other people’s code stored inside this project. It isn’t the project’s own work.')],
  [['node_modules', 'bower_components', 'site-packages', '.venv', 'venv'], F('Installed packages', '📥', 'other', 'Downloaded building blocks from other projects, installed automatically. Nobody edits these by hand.')],

  // ── Platforms ─────────────────────────────────────────────────────────────
  [['android'], F('Android app', '🤖', 'other', 'The Android-specific part of the app: project settings and native code for Android phones.')],
  [['ios'], F('iPhone app', '🍏', 'other', 'The iPhone- and iPad-specific part of the app: project settings and native code for Apple devices.')],
  [['macos', 'windows', 'linux'], F('Desktop platform files', '💻', 'other', 'Settings and native code needed to run the app on that operating system.')],
  [['mobile', 'native', 'react-native'], F('Mobile app', '📱', 'ui', 'The phone app version of the project.')],
  [['desktop', 'electron'], F('Desktop app', '💻', 'ui', 'The desktop app version of the project, installed on a computer.')],
  [['extension', 'browser-extension', 'chrome-extension'], F('Browser extension', '🧩', 'ui', 'An add-on for web browsers that changes or extends what pages do.')],
]

/**
 * Conventional folder names → plain-English role. Keys are lower-case folder basenames.
 * 550+ names across 160+ roles: src, lib, app, components, pages, views, screens, routes, api, server, client, public, static,
 * assets, images, styles, hooks, store, state, services, utils, helpers, common, shared, core, models, schemas, entities, db,
 * migrations, seeds, config, scripts, bin, cmd, internal, pkg, tests, __tests__, spec, e2e, fixtures, mocks, docs, examples,
 * .github, workflows, ci, deploy, infra, terraform, k8s, docker, middleware, controllers, handlers, plugins, templates,
 * layouts, i18n, locales, types, constants, data, notebooks, benchmarks, tools, packages, apps, crates, modules, features,
 * domain, adapters …
 */
export const FOLDER_ROLES: Record<string, FolderRole> = (() => {
  const out: Record<string, FolderRole> = {}
  for (const [names, role] of DEFINITIONS) for (const n of names) if (!Object.prototype.hasOwnProperty.call(out, n)) out[n] = role
  return out
})()

/** Safe lookups (a plain object would answer "constructor" or "toString" with built-in functions). */
const LOOKUP: ReadonlyMap<string, FolderRole> = new Map(Object.entries(FOLDER_ROLES))

const TEST_WORDS = new Set(['test', 'tests', 'testing', 'spec', 'specs', 'e2e', 'unittest', 'unittests'])

const VERSION_ROLE = (n: string): FolderRole => F(`Version ${n}`, '🔢', 'other', `Version ${n} of this part of the project, kept separate so older versions keep working.`)
const DYNAMIC_SEGMENT = F('Changing page address', '🔀', 'ui', 'A placeholder in a web address: the brackets mean "any value goes here", like a product ID or a username.')
const ROUTE_GROUP = F('Page group', '🗂️', 'ui', 'A folder that groups related pages without changing their web addresses (the brackets mean it is just for organizing).')

function lookupWithVariants(word: string): FolderRole | null {
  if (!word) return null
  const direct = LOOKUP.get(word)
  if (direct) return direct
  const variants: string[] = []
  if (word.endsWith('ies') && word.length > 4) variants.push(`${word.slice(0, -3)}y`)
  if (word.endsWith('es') && word.length > 3) variants.push(word.slice(0, -2))
  if (word.endsWith('s') && word.length > 2) variants.push(word.slice(0, -1))
  if (word.endsWith('y') && word.length > 2) variants.push(`${word.slice(0, -1)}ies`)
  if (!word.endsWith('s')) variants.push(`${word}s`, `${word}es`)
  for (const v of variants) {
    const hit = LOOKUP.get(v)
    if (hit) return hit
  }
  return null
}

/** Split "shared-components", "test_utils", "userServices" into lower-case words. */
function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[-_.\s]+/)
    .filter(Boolean)
}

/**
 * Describe a folder by its name (case-insensitive; handles plurals and common prefixes like "test_" / "_" / "." / "@").
 * Also understands version folders ("v2"), framework route segments ("[id]", "(marketing)") and compound names
 * ("shared-components" → components, "tests-e2e" → tests). Returns null for names with no known convention.
 */
export function describeFolder(name: string): FolderRole | null {
  if (typeof name !== 'string') return null
  const cached = CACHE.get(name)
  if (cached !== undefined) return cached
  const result = describeUncached(name)
  // Folder names repeat a lot across a repo; keep the memo bounded for huge trees.
  if (CACHE.size >= 20_000) CACHE.clear()
  CACHE.set(name, result)
  return result
}

const CACHE = new Map<string, FolderRole | null>()

function describeUncached(name: string): FolderRole | null {
  const trimmed = name.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const base = trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed
  const lower = base.toLowerCase()

  const exact = LOOKUP.get(lower)
  if (exact) return exact

  if (/^\[.+\]$/.test(lower)) return DYNAMIC_SEGMENT
  const group = /^\((.+)\)$/.exec(lower)
  if (group) return describeUncached(group[1]) ?? ROUTE_GROUP

  const stripped = lower.replace(/^[_.@~+]+/, '').replace(/[_.~]+$/, '')
  if (!stripped) return null
  const strippedHit = lookupWithVariants(stripped)
  if (strippedHit) return strippedHit

  const version = /^v(\d+(?:\.\d+)*)$/.exec(stripped)
  if (version) return VERSION_ROLE(version[1])

  const words = wordsOf(base.replace(/^[_.@~+]+/, ''))
  if (words.length < 2) return null
  // "test_utils", "tests-e2e", "integration_tests": anything clearly about tests is a test folder.
  if (words.some((w) => TEST_WORDS.has(w))) {
    const joined = words.join('-')
    return LOOKUP.get(joined) ?? LOOKUP.get('tests') ?? null
  }
  // "shared-components" → components, "user_services" → services; then the first word ("api-gateway" → api).
  return lookupWithVariants(words[words.length - 1]) ?? lookupWithVariants(words[0]) ?? lookupWithVariants(words.join('-'))
}
