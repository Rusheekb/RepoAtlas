import type { RouteInfo } from '@/core/types'

/**
 * Detect HTTP endpoints defined in a file (best effort, regex-based):
 * Express/Koa/Fastify/Hono (app.get('/x'), router.post(...), fastify.route({method, url})), NestJS decorators
 * (@Get('x') inside @Controller('prefix')), Next.js route handlers (app/.../route.ts exports GET/POST → path from folder),
 * Next.js pages/api files, Flask (@app.route('/x', methods=[…]), @bp.get), FastAPI (@app.get, @router.post),
 * Django urls.py (path('x/', view)), Rails routes.rb (get 'x', resources :users), Laravel (Route::get),
 * Go net/http & gin/echo/chi/fiber (r.GET("/x"), http.HandleFunc("/x")), Spring (@GetMapping("/x"), @RequestMapping),
 * ASP.NET ([HttpGet("x")], app.MapGet("/x")), Actix/Axum (.route("/x", get(handler)), #[get("/x")]).
 * Return at most 100 routes per file.
 */
export function extractRoutes(path: string, content: string, language: string): RouteInfo[] {
  void path; void content; void language
  return []
}
