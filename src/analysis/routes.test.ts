import type { RouteInfo } from '@/core/types'
import { extractRoutes, joinRoute } from './routes'

const brief = (routes: RouteInfo[]) => routes.map((r) => `${r.method} ${r.path} @${r.line}`)

describe('joinRoute', () => {
  it('joins prefixes and paths cleanly', () => {
    expect(joinRoute('', '')).toBe('/')
    expect(joinRoute('/api', '')).toBe('/api')
    expect(joinRoute('api', 'users')).toBe('/api/users')
    expect(joinRoute('/api/', '/users/:id')).toBe('/api/users/:id')
    expect(joinRoute('', 'users/')).toBe('/users/')
    expect(joinRoute('/', '/')).toBe('/')
  })
})

describe('JavaScript / TypeScript', () => {
  it('Express routers', () => {
    const js = [
      "const express = require('express')", // 1
      'const app = express()', // 2
      'const router = express.Router()', // 3
      "app.get('/', (req, res) => res.send('hi'))", // 4
      "router.post('/users', createUser)", // 5
      'router.delete("/users/:id", removeUser)', // 6
      "app.use('/api', router)", // 7
      "app.route('/book').get(getBook).put(updateBook)", // 8
      "// app.get('/commented', x)", // 9
      "const s = \"app.get('/in-string', x)\"", // 10
      "axios.get('/api/users')", // 11
      "app.get('title')", // 12
      "app.all('*', notFound)", // 13
    ].join('\n')
    expect(brief(extractRoutes('src/server.js', js, 'JavaScript'))).toEqual([
      'GET / @4',
      'POST /users @5',
      'DELETE /users/:id @6',
      'GET /book @8',
      'PUT /book @8',
      'ANY * @13',
    ])
  })

  it('ignores HTTP client calls in frontend code', () => {
    const ts = "import api from './api'\nexport async function load() {\n  return api.get('/users')\n}\nclient.post('/login', body)\n"
    expect(extractRoutes('src/services/users.ts', ts, 'TypeScript')).toEqual([])
  })

  it('Fastify and Hono', () => {
    const ts = [
      "import Fastify from 'fastify'",
      'const fastify = Fastify()',
      "fastify.get('/health', async () => ({ ok: true }))",
      "fastify.route({ method: ['GET', 'HEAD'], url: '/items', handler })",
      "import { Hono } from 'hono'",
      'const api = new Hono()',
      "api.post('/posts', (c) => c.json({}))",
    ].join('\n')
    expect(brief(extractRoutes('src/app.ts', ts, 'TypeScript'))).toEqual([
      'GET /health @3',
      'GET /items @4',
      'HEAD /items @4',
      'POST /posts @7',
    ])
  })

  it('NestJS controllers', () => {
    const ts = [
      "@Controller('users')", // 1
      'export class UsersController {', // 2
      '  @Get()', // 3
      '  findAll() {}', // 4
      "  @Get(':id')", // 5
      '  findOne() {}', // 6
      "  @Post('bulk')", // 7
      '  create() {}', // 8
      '}', // 9
    ].join('\n')
    expect(brief(extractRoutes('src/users/users.controller.ts', ts, 'TypeScript'))).toEqual([
      'GET /users @3',
      'GET /users/:id @5',
      'POST /users/bulk @7',
    ])
  })

  it('Next.js App Router route handlers and Pages API routes', () => {
    const route = 'export async function GET(req: Request) {}\nexport const POST = async () => {}\n'
    expect(brief(extractRoutes('src/app/api/users/[id]/route.ts', route, 'TypeScript'))).toEqual(['GET /api/users/[id] @1', 'POST /api/users/[id] @2'])
    expect(brief(extractRoutes('app/(marketing)/feed/route.ts', 'export function GET() {}', 'TypeScript'))).toEqual(['GET /feed @1'])
    const pages = "export default function handler(req, res) {\n  if (req.method === 'POST') {}\n}\n"
    expect(brief(extractRoutes('pages/api/login.ts', pages, 'TypeScript'))).toEqual(['POST /api/login @1'])
    expect(brief(extractRoutes('src/pages/api/items/index.js', 'export default (req, res) => {}', 'JavaScript'))).toEqual(['ANY /api/items @1'])
  })

  it('SvelteKit, Astro, Nuxt and Remix', () => {
    expect(brief(extractRoutes('src/routes/api/todos/+server.ts', 'export async function GET() {}\nexport const DELETE = () => {}', 'TypeScript'))).toEqual([
      'GET /api/todos @1',
      'DELETE /api/todos @2',
    ])
    expect(brief(extractRoutes('src/pages/api/hello.ts', 'export const GET: APIRoute = () => {}', 'TypeScript'))).toEqual(['GET /api/hello @1'])
    expect(brief(extractRoutes('server/api/users.post.ts', 'export default defineEventHandler(async (e) => {})', 'TypeScript'))).toEqual([
      'POST /api/users @1',
    ])
    expect(brief(extractRoutes('app/routes/posts.$slug.tsx', 'export async function loader() {}\nexport async function action() {}\nexport default function Post() {}', 'TSX'))).toEqual([
      'GET /posts/:slug @1',
      'POST /posts/:slug @2',
    ])
  })
})

describe('Python', () => {
  it('Flask with blueprints', () => {
    const py = [
      'bp = Blueprint("users", __name__, url_prefix="/users")', // 1
      '@app.route("/")', // 2
      'def index(): ...', // 3
      '@bp.route("/<int:id>", methods=["GET", "POST"])', // 4
      'def user(id): ...', // 5
      '@bp.delete("/<int:id>")', // 6
      'def remove(id): ...', // 7
      '# @app.route("/nope")', // 8
    ].join('\n')
    expect(brief(extractRoutes('app/views.py', py, 'Python'))).toEqual([
      'GET / @2',
      'GET /users/<int:id> @4',
      'POST /users/<int:id> @4',
      'DELETE /users/<int:id> @6',
    ])
  })

  it('FastAPI with router prefixes', () => {
    const py = [
      'router = APIRouter(prefix="/items", tags=["items"])', // 1
      '@router.get("/")', // 2
      'async def list_items(): ...', // 3
      '@router.post("/{item_id}/tags")', // 4
      'async def add_tag(item_id: int): ...', // 5
      '@app.websocket("/ws")', // 6
      'async def ws(): ...', // 7
      '@app.api_route("/legacy", methods=["GET", "POST"])', // 8
      'def legacy(): ...', // 9
    ].join('\n')
    expect(brief(extractRoutes('app/routers/items.py', py, 'Python'))).toEqual([
      'GET /items/ @2',
      'POST /items/{item_id}/tags @4',
      'WS /ws @6',
      'GET /legacy @8',
      'POST /legacy @8',
    ])
  })

  it('Django urls.py and DRF routers', () => {
    const py = [
      'router = DefaultRouter()',
      "router.register(r'users', UserViewSet)",
      'urlpatterns = [',
      "    path('', views.home, name='home'),",
      "    path('articles/<int:year>/', views.year_archive),",
      "    re_path(r'^about/$', views.about),",
      "    path('api/', include(router.urls)),",
      ']',
    ].join('\n')
    expect(brief(extractRoutes('mysite/urls.py', py, 'Python'))).toEqual([
      'ANY /users @2',
      'ANY / @4',
      'ANY /articles/<int:year>/ @5',
      'ANY /about/ @6',
    ])
  })
})

describe('Ruby', () => {
  it('Rails routes.rb with resources, nesting, namespaces and members', () => {
    const rb = [
      'Rails.application.routes.draw do', // 1
      "  root 'home#index'", // 2
      "  get 'about', to: 'pages#about'", // 3
      '  resources :photos, only: [:index, :show]', // 4
      '  resources :posts do', // 5
      '    resources :comments, only: [:create]', // 6
      '    member do', // 7
      "      post 'publish'", // 8
      '    end', // 9
      '    collection do', // 10
      "      get 'search'", // 11
      '    end', // 12
      '  end', // 13
      '  namespace :admin do', // 14
      '    resource :settings, only: [:show]', // 15
      '  end', // 16
      "  match 'legacy', to: 'x#y', via: [:get, :post]", // 17
      '  mount Sidekiq::Web => "/sidekiq"', // 18
      'end', // 19
    ].join('\n')
    expect(brief(extractRoutes('config/routes.rb', rb, 'Ruby'))).toEqual([
      'GET / @2',
      'GET /about @3',
      'GET /photos @4',
      'GET /photos/:id @4',
      'GET /posts @5',
      'POST /posts @5',
      'GET /posts/new @5',
      'GET /posts/:id/edit @5',
      'GET /posts/:id @5',
      'PATCH /posts/:id @5',
      'PUT /posts/:id @5',
      'DELETE /posts/:id @5',
      'POST /posts/:post_id/comments @6',
      'POST /posts/:id/publish @8',
      'GET /posts/search @11',
      'GET /admin/settings @15',
      'GET /legacy @17',
      'POST /legacy @17',
      'ANY /sidekiq @18',
    ])
  })

  it('Sinatra', () => {
    const rb = "require 'sinatra'\nget '/' do\n  'hi'\nend\npost '/login' do\nend\n"
    expect(brief(extractRoutes('app.rb', rb, 'Ruby'))).toEqual(['GET / @2', 'POST /login @5'])
  })
})

describe('PHP', () => {
  it('Laravel routes with resources and prefix groups', () => {
    const php = [
      '<?php', // 1
      "Route::get('/', [HomeController::class, 'index']);", // 2
      "Route::post('login', [AuthController::class, 'login']);", // 3
      "Route::match(['get', 'post'], '/contact', ContactController::class);", // 4
      "Route::prefix('admin')->group(function () {", // 5
      "    Route::get('/dashboard', DashboardController::class);", // 6
      '});', // 7
      "Route::get('/after', AfterController::class);", // 8
      "Route::apiResource('photos', PhotoController::class);", // 9
    ].join('\n')
    expect(brief(extractRoutes('routes/web.php', php, 'PHP'))).toEqual([
      'GET / @2',
      'POST /login @3',
      'GET /contact @4',
      'POST /contact @4',
      'GET /admin/dashboard @6',
      'GET /after @8',
      'GET /photos @9',
      'POST /photos @9',
      'GET /photos/{photo} @9',
      'PUT /photos/{photo} @9',
      'PATCH /photos/{photo} @9',
      'DELETE /photos/{photo} @9',
    ])
  })

  it('Symfony attributes and annotations', () => {
    const php = [
      '<?php', // 1
      "#[Route('/blog')]", // 2
      'class BlogController extends AbstractController', // 3
      '{', // 4
      "    #[Route('/{slug}', name: 'post', methods: ['GET'])]", // 5
      '    public function show(string $slug) {}', // 6
      '    /**', // 7
      '     * @Route("/new", methods={"POST"})', // 8
      '     */', // 9
      '    public function create() {}', // 10
      '}', // 11
    ].join('\n')
    expect(brief(extractRoutes('src/Controller/BlogController.php', php, 'PHP'))).toEqual(['GET /blog/{slug} @5', 'POST /blog/new @8'])
  })
})

describe('Go', () => {
  it('net/http, gin groups and chi route blocks', () => {
    const go = [
      'func main() {', // 1
      '\thttp.HandleFunc("/health", health)', // 2
      '\tmux.HandleFunc("GET /users/{id}", getUser)', // 3
      '\tr := gin.Default()', // 4
      '\tr.GET("/ping", ping)', // 5
      '\tv1 := r.Group("/api/v1")', // 6
      '\tv1.POST("/login", login)', // 7
      '\tadmin := v1.Group("/admin")', // 8
      '\tadmin.DELETE("/users/:id", del)', // 9
      '\tresp, _ := http.Get("https://example.com")', // 10
      '\tc.Route("/articles", func(c chi.Router) {', // 11
      '\t\tc.Get("/", list)', // 12
      '\t\tc.Post("/{id}", update)', // 13
      '\t})', // 14
      '\tg.HandleFunc("/legacy", h).Methods("PUT")', // 15
      '}', // 16
    ].join('\n')
    expect(brief(extractRoutes('cmd/server/main.go', go, 'Go'))).toEqual([
      'ANY /health @2',
      'GET /users/{id} @3',
      'GET /ping @5',
      'POST /api/v1/login @7',
      'DELETE /api/v1/admin/users/:id @9',
      'GET /articles/ @12',
      'POST /articles/{id} @13',
      'PUT /legacy @15',
    ])
  })
})

describe('Java / Kotlin', () => {
  it('Spring controllers', () => {
    const java = [
      '@RestController', // 1
      '@RequestMapping("/api/users")', // 2
      'public class UserController {', // 3
      '    @GetMapping', // 4
      '    public List<User> all() { return null; }', // 5
      '    @GetMapping("/{id}")', // 6
      '    public User one(@PathVariable long id) { return null; }', // 7
      '    @PostMapping(value = "/bulk", consumes = "application/json")', // 8
      '    public void bulk() {}', // 9
      '    @RequestMapping(path = "/legacy", method = RequestMethod.PUT)', // 10
      '    public void legacy() {}', // 11
      '}', // 12
    ].join('\n')
    expect(brief(extractRoutes('src/main/java/com/acme/UserController.java', java, 'Java'))).toEqual([
      'GET /api/users @4',
      'GET /api/users/{id} @6',
      'POST /api/users/bulk @8',
      'PUT /api/users/legacy @10',
    ])
  })

  it('JAX-RS resources', () => {
    const java = [
      '@Path("/orders")', // 1
      'public class OrderResource {', // 2
      '    @GET', // 3
      '    public List<Order> list() { return null; }', // 4
      '    @POST', // 5
      '    @Path("/{id}/cancel")', // 6
      '    public void cancel() {}', // 7
      '}', // 8
    ].join('\n')
    expect(brief(extractRoutes('src/main/java/OrderResource.java', java, 'Java'))).toEqual(['GET /orders @3', 'POST /orders/{id}/cancel @5'])
  })

  it('Ktor routing', () => {
    const kt = [
      'fun Application.module() {', // 1
      '    routing {', // 2
      '        get("/") { call.respondText("hi") }', // 3
      '        route("/api") {', // 4
      '            post("/items") {', // 5
      '            }', // 6
      '            get {', // 7
      '            }', // 8
      '        }', // 9
      '    }', // 10
      '}', // 11
    ].join('\n')
    expect(brief(extractRoutes('src/main/kotlin/Application.kt', kt, 'Kotlin'))).toEqual(['GET / @3', 'POST /api/items @5', 'GET /api @7'])
  })
})

describe('C#', () => {
  it('ASP.NET controllers and minimal APIs', () => {
    const cs = [
      '[ApiController]', // 1
      '[Route("api/[controller]")]', // 2
      'public class ProductsController : ControllerBase', // 3
      '{', // 4
      '    [HttpGet]', // 5
      '    public IActionResult List() => Ok();', // 6
      '    [HttpGet("{id}")]', // 7
      '    public IActionResult Get(int id) => Ok();', // 8
      '    [HttpPost("/absolute")]', // 9
      '    public IActionResult Post() => Ok();', // 10
      '}', // 11
      'var todos = app.MapGroup("/todos");', // 12
      'app.MapGet("/", () => "Hello");', // 13
      'todos.MapPost("/{id}", (int id) => id);', // 14
    ].join('\n')
    expect(brief(extractRoutes('Controllers/ProductsController.cs', cs, 'C#'))).toEqual([
      'GET /api/Products @5',
      'GET /api/Products/{id} @7',
      'POST /absolute @9',
      'GET / @13',
      'POST /todos/{id} @14',
    ])
  })
})

describe('Rust, Elixir, Swift, Dart', () => {
  it('Actix, Rocket and Axum', () => {
    const rs = [
      '#[get("/hello/{name}")]', // 1
      'async fn hello() -> impl Responder { "" }', // 2
      '#[post("/echo")]', // 3
      'async fn echo() {}', // 4
      'let app = Router::new()', // 5
      '    .route("/", get(root))', // 6
      '    .route("/users", get(list_users).post(create_user))', // 7
      '    .route("/x", web::get().to(x));', // 8
    ].join('\n')
    expect(brief(extractRoutes('src/main.rs', rs, 'Rust'))).toEqual([
      'GET /hello/{name} @1',
      'POST /echo @3',
      'GET / @6',
      'GET /users @7',
      'POST /users @7',
      'GET /x @8',
    ])
  })

  it('Phoenix router', () => {
    const ex = [
      'defmodule MyAppWeb.Router do', // 1
      '  use MyAppWeb, :router', // 2
      '  scope "/", MyAppWeb do', // 3
      '    get "/", PageController, :home', // 4
      '    live "/dashboard", DashboardLive', // 5
      '  end', // 6
      '  scope "/api", MyAppWeb do', // 7
      '    resources "/users", UserController, only: [:index, :show]', // 8
      '  end', // 9
      'end', // 10
    ].join('\n')
    expect(brief(extractRoutes('lib/my_app_web/router.ex', ex, 'Elixir'))).toEqual([
      'GET / @4',
      'GET /dashboard @5',
      'GET /api/users @8',
      'GET /api/users/:id @8',
    ])
  })

  it('Vapor and shelf_router', () => {
    const swift = 'import Vapor\nfunc routes(_ app: Application) throws {\n  app.get("hello", ":name") { req in "hi" }\n  let users = app.grouped("users")\n  users.post(use: create)\n  users.delete(":id") { req in "" }\n}\n'
    expect(brief(extractRoutes('Sources/App/routes.swift', swift, 'Swift'))).toEqual(['GET /hello/:name @3', 'POST /users @5', 'DELETE /users/:id @6'])
    const dart = "import 'package:shelf_router/shelf_router.dart';\nfinal router = Router()\n  ..get('/hello', handler)\n  ..post('/items', create);\n"
    expect(brief(extractRoutes('bin/server.dart', dart, 'Dart'))).toEqual(['GET /hello @3', 'POST /items @4'])
  })
})

describe('limits', () => {
  it('returns [] for unrelated files and caps at 100 routes', () => {
    expect(extractRoutes('README.md', "app.get('/x')", 'Markdown')).toEqual([])
    expect(extractRoutes('src/a.ts', '', 'TypeScript')).toEqual([])
    const many = Array.from({ length: 150 }, (_, i) => `app.get('/r${i}', h)`).join('\n')
    expect(extractRoutes('server.js', many, 'JavaScript')).toHaveLength(100)
  })
})
