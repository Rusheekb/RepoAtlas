import type { CodeSymbol } from '@/core/types'
import { extractSymbols } from './symbols'

const brief = (syms: CodeSymbol[]) => syms.map((s) => `${s.kind}:${s.name}@${s.line}${s.exported ? '+' : ''}`)
const byName = (syms: CodeSymbol[], name: string) => syms.find((s) => s.name === name)

describe('JavaScript / TypeScript symbols', () => {
  const ts = [
    "import React from 'react'", // 1
    '', // 2
    'export interface User {', // 3
    '  id: string', // 4
    '}', // 5
    'export type Role = "admin" | "user"', // 6
    'export enum Status { Active, Inactive }', // 7
    'export const API_URL = "https://x"', // 8
    'const helper = (a: number, b: number): number => a + b', // 9
    'export async function login(email: string, password: string): Promise<User> {', // 10
    '  const inner = () => 1', // 11
    '  function nested() {}', // 12
    '  return fetchUser(email)', // 13
    '}', // 14
    'export function useAuth() {', // 15
    '  return React.useContext(Ctx)', // 16
    '}', // 17
    'export default class AuthService extends Base {', // 18
    '  private cache = new Map()', // 19
    '  constructor(private api: Api) { super() }', // 20
    '  async refresh(token: string) {', // 21
    '    if (token) { return }', // 22
    '  }', // 23
    '  #secret() {}', // 24
    '  handle = async (e: Event) => {}', // 25
    '  static create(): AuthService { return new AuthService(api) }', // 26
    '}', // 27
    'export namespace Utils {', // 28
    '  export function slug(s: string) { return s }', // 29
    '}', // 30
    'const config = {', // 31
    '  method() {},', // 32
    '}', // 33
    'function internal() {}', // 34
    'export { internal, helper as h }', // 35
  ].join('\n')
  const syms = extractSymbols('src/auth.ts', ts, 'TypeScript')

  it('finds top-level declarations with kinds, lines and exported flags', () => {
    expect(brief(syms)).toEqual([
      'interface:User@3+',
      'type:Role@6+',
      'enum:Status@7+',
      'constant:API_URL@8+',
      'function:helper@9+',
      'function:login@10+',
      'hook:useAuth@15+',
      'class:AuthService@18+',
      'method:constructor@20+',
      'method:refresh@21+',
      'method:#secret@24',
      'method:handle@25+',
      'method:create@26+',
      'module:Utils@28+',
      'function:slug@29+',
      'function:internal@34+',
    ])
  })

  it('builds one-line signatures without bodies', () => {
    expect(byName(syms, 'login')?.signature).toBe('export async function login(email: string, password: string): Promise<User>')
    expect(byName(syms, 'helper')?.signature).toBe('const helper = (a: number, b: number): number =>')
    expect(byName(syms, 'AuthService')?.signature).toBe('export default class AuthService extends Base')
    expect(byName(syms, 'Role')?.signature).toBe('export type Role = "admin" | "user"')
    expect(syms.every((s) => (s.signature ?? '').length <= 120)).toBe(true)
  })

  it('does not report nested functions, object methods or statements', () => {
    expect(byName(syms, 'inner')).toBeUndefined()
    expect(byName(syms, 'nested')).toBeUndefined()
    expect(byName(syms, 'method')).toBeUndefined()
    expect(byName(syms, 'if')).toBeUndefined()
    expect(byName(syms, 'cache')).toBeUndefined()
  })

  it('detects React components in .tsx files and in .js files that return JSX', () => {
    const tsx = [
      "import { memo, forwardRef } from 'react'",
      'export default function App() {',
      '  return <Layout />',
      '}',
      'export const Button = ({ label }: Props) => {',
      '  return <button>{label}</button>',
      '}',
      'const Card = memo(function Card(props) { return <div /> })',
      'export const Input = forwardRef<HTMLInputElement, Props>((props, ref) => <input ref={ref} />)',
      'export const Title = styled.h1`',
      '  color: red;',
      '`',
      'export function formatDate(d: Date) { return d.toISOString() }',
      'class Legacy extends React.Component {',
      '  render() { return <p /> }',
      '}',
      'export const useTheme = () => useContext(ThemeCtx)',
      'export const useStore = create<State>((set) => ({}))',
    ].join('\n')
    const s = extractSymbols('src/App.tsx', tsx, 'TSX')
    expect(brief(s)).toEqual([
      'component:App@2+',
      'component:Button@5+',
      'component:Card@8',
      'component:Input@9+',
      'component:Title@10+',
      'function:formatDate@13+',
      'component:Legacy@14',
      'method:render@15',
      'hook:useTheme@17+',
      'hook:useStore@18+',
    ])
    const js = 'export default function Header() {\n  return (\n    <header>Hi</header>\n  )\n}\nexport function sum(a, b) { return a + b }\n'
    expect(brief(extractSymbols('src/Header.js', js, 'JavaScript'))).toEqual(['component:Header@1+', 'function:sum@6+'])
    // Without JSX in a .ts file, PascalCase functions stay functions.
    expect(brief(extractSymbols('src/x.ts', 'export function Parse(s: string) { return s }', 'TypeScript'))).toEqual(['function:Parse@1+'])
  })

  it('handles CommonJS exports and multi-line arrow functions', () => {
    const js = [
      'function a() {}',
      'const b = function () {}',
      'const c = (',
      '  x,',
      '  y,',
      ') => x + y',
      'exports.d = () => 1',
      'module.exports = { a, b: b }',
    ].join('\n')
    expect(brief(extractSymbols('lib/x.js', js, 'JavaScript'))).toEqual(['function:a@1+', 'function:b@2+', 'function:c@3', 'function:d@7+'])
  })
})

describe('Vue / Svelte components', () => {
  it('names the component after the file and reads the script block', () => {
    const vue = '<template>\n  <div />\n</template>\n<script setup lang="ts">\nfunction onClick() {}\nconst count = ref(0)\n</script>\n'
    expect(brief(extractSymbols('src/components/user-card.vue', vue, 'Vue'))).toEqual(['component:UserCard@1+', 'function:onClick@5'])
    const svelte = '<script>\n  export let name\n  export function greet() {}\n</script>\n<h1>{name}</h1>\n'
    expect(brief(extractSymbols('src/routes/+page.svelte', svelte, 'Svelte'))).toEqual(['component:Page@1+', 'function:greet@3+'])
  })
})

describe('Python symbols', () => {
  const py = [
    'import os', // 1
    'MAX_RETRIES = 3', // 2
    '_PRIVATE = 1', // 3
    'logger = logging.getLogger(__name__)', // 4
    '', // 5
    '@dataclass', // 6
    'class User(BaseModel):', // 7
    '    """A user.', // 8
    '    def not_real(self): ...', // 9
    '    """', // 10
    '    name: str', // 11
    '    def greet(self, other: "User") -> str:', // 12
    '        def inner():', // 13
    '            pass', // 14
    '        return "hi"', // 15
    '    async def _load(self):', // 16
    '        pass', // 17
    '', // 18
    'async def fetch_all(', // 19
    '    session,', // 20
    '    urls: list[str],', // 21
    ') -> list[str]:', // 22
    '    pass', // 23
    'def _helper(x):', // 24
    '    return x', // 25
    'class Color(Enum):', // 26
    '    RED = 1', // 27
    'type Vector = list[float]', // 28
  ].join('\n')
  const syms = extractSymbols('app/models.py', py, 'Python')

  it('finds classes, methods, functions and constants', () => {
    expect(brief(syms)).toEqual([
      'constant:MAX_RETRIES@2+',
      'constant:_PRIVATE@3',
      'class:User@7+',
      'method:greet@12+',
      'method:_load@16',
      'function:fetch_all@19+',
      'function:_helper@24',
      'enum:Color@26+',
      'type:Vector@28+',
    ])
  })

  it('joins multi-line signatures', () => {
    expect(byName(syms, 'fetch_all')?.signature).toBe('async def fetch_all( session, urls: list[str], ) -> list[str]')
    expect(byName(syms, 'greet')?.signature).toBe('def greet(self, other: "User") -> str')
    expect(byName(syms, 'User')?.signature).toBe('class User(BaseModel)')
  })
})

describe('Go symbols', () => {
  it('finds funcs, methods, types and grouped declarations', () => {
    const go = [
      'package server', // 1
      '', // 2
      'const Version = "1.0"', // 3
      'var ErrNotFound = errors.New("not found")', // 4
      'var internalCache = map[string]int{}', // 5
      'type (', // 6
      '\tHandler func(w http.ResponseWriter)', // 7
      '\tConfig struct {', // 8
      '\t\tPort int', // 9
      '\t}', // 10
      ')', // 11
      'type Server struct {', // 12
      '\tcfg Config', // 13
      '}', // 14
      'type Store interface {', // 15
      '\tGet(id string) error', // 16
      '}', // 17
      'func New(cfg Config) *Server {', // 18
      '\treturn &Server{cfg: cfg}', // 19
      '}', // 20
      'func (s *Server) Start(ctx context.Context) error {', // 21
      '\treturn nil', // 22
      '}', // 23
      'func helper[T any](x T) T { return x }', // 24
      'const (', // 25
      '\tModeA = iota', // 26
      '\tmodeB', // 27
      ')', // 28
    ].join('\n')
    const s = extractSymbols('server/server.go', go, 'Go')
    expect(brief(s)).toEqual([
      'constant:Version@3+',
      'variable:ErrNotFound@4+',
      'type:Handler@7+',
      'struct:Config@8+',
      'struct:Server@12+',
      'interface:Store@15+',
      'function:New@18+',
      'method:Start@21+',
      'function:helper@24',
      'constant:ModeA@26+',
      'constant:modeB@27',
    ])
    expect(byName(s, 'Start')?.signature).toBe('func (s *Server) Start(ctx context.Context) error')
  })
})

describe('Rust symbols', () => {
  it('finds items, impl methods and visibility', () => {
    const rs = [
      'use std::io;', // 1
      'pub struct Config {', // 2
      '    pub port: u16,', // 3
      '}', // 4
      'enum State { On, Off }', // 5
      'pub trait Store {', // 6
      '    fn get(&self, id: &str) -> Option<String>;', // 7
      '}', // 8
      'impl Config {', // 9
      '    pub fn new(port: u16) -> Self {', // 10
      '        Self { port }', // 11
      '    }', // 12
      '    fn validate(&self) -> bool { true }', // 13
      '}', // 14
      'impl<T: Clone> Store for Cache<T> {', // 15
      '    fn get(&self, id: &str) -> Option<String> { None }', // 16
      '}', // 17
      'pub(crate) async fn run() -> io::Result<()> {', // 18
      '    Ok(())', // 19
      '}', // 20
      'pub const MAX: usize = 10;', // 21
      'pub type Result<T> = std::result::Result<T, Error>;', // 22
      'mod tests {', // 23
      '    fn helper() {}', // 24
      '}', // 25
      '#[macro_export]', // 26
      'macro_rules! hello {', // 27
      '    () => {};', // 28
      '}', // 29
    ].join('\n')
    expect(brief(extractSymbols('src/lib.rs', rs, 'Rust'))).toEqual([
      'struct:Config@2+',
      'enum:State@5',
      'trait:Store@6+',
      'method:get@7+',
      'method:new@10+',
      'method:validate@13',
      'method:get@16',
      'function:run@18+',
      'constant:MAX@21+',
      'type:Result@22+',
      'module:tests@23',
      'function:hello@27+',
    ])
  })
})

describe('Java / Kotlin symbols', () => {
  it('Java classes, methods, constructors and constants', () => {
    const java = [
      'package com.acme;', // 1
      '@RestController', // 2
      'public class UserController {', // 3
      '    private static final int MAX_USERS = 10;', // 4
      '    private final UserService service;', // 5
      '    public UserController(UserService service) {', // 6
      '        this.service = service;', // 7
      '    }', // 8
      '    @GetMapping("/users")', // 9
      '    public List<User> list(@RequestParam int page) {', // 10
      '        if (page > 0) { return service.all(); }', // 11
      '        return List.of();', // 12
      '    }', // 13
      '    private void audit() {}', // 14
      '}', // 15
      'interface Repo {', // 16
      '    User find(long id);', // 17
      '}', // 18
      'public enum Role { ADMIN, USER }', // 19
      'public record Point(int x, int y) {}', // 20
    ].join('\n')
    expect(brief(extractSymbols('src/main/java/com/acme/UserController.java', java, 'Java'))).toEqual([
      'class:UserController@3+',
      'constant:MAX_USERS@4',
      'method:UserController@6+',
      'method:list@10+',
      'method:audit@14',
      'interface:Repo@16',
      'method:find@17+',
      'enum:Role@19+',
      'class:Point@20+',
    ])
  })

  it('Kotlin classes, objects, functions and Compose components', () => {
    const kt = [
      'package com.acme', // 1
      'const val TIMEOUT = 30', // 2
      'data class User(val id: Long, val name: String)', // 3
      'sealed class Result {', // 4
      '    object Loading : Result()', // 5
      '}', // 6
      'class Repo(private val api: Api) {', // 7
      '    suspend fun load(id: Long): User = api.get(id)', // 8
      '    private fun cache() {}', // 9
      '    companion object {', // 10
      '        fun create(): Repo = Repo(Api())', // 11
      '    }', // 12
      '}', // 13
      '@Composable', // 14
      'fun Greeting(name: String) {', // 15
      '    Text("Hi $name")', // 16
      '}', // 17
      'fun String.slugify(): String = lowercase()', // 18
      'private fun helper() = 1', // 19
      'typealias Handler = (Event) -> Unit', // 20
      'enum class Color { RED, GREEN }', // 21
    ].join('\n')
    expect(brief(extractSymbols('app/src/main/kotlin/com/acme/Repo.kt', kt, 'Kotlin'))).toEqual([
      'constant:TIMEOUT@2+',
      'class:User@3+',
      'class:Result@4+',
      'class:Loading@5+',
      'class:Repo@7+',
      'method:load@8+',
      'method:cache@9',
      'method:create@11+',
      'component:Greeting@15+',
      'function:slugify@18+',
      'function:helper@19',
      'type:Handler@20+',
      'enum:Color@21+',
    ])
  })
})

describe('C# symbols', () => {
  it('namespaces, types, methods and constructors', () => {
    const cs = [
      'namespace MyApp.Services', // 1
      '{', // 2
      '    public interface IUserService', // 3
      '    {', // 4
      '        Task<User> GetAsync(int id);', // 5
      '    }', // 6
      '    public class UserService : IUserService', // 7
      '    {', // 8
      '        public const int PageSize = 20;', // 9
      '        private readonly AppDb _db;', // 10
      '        public UserService(AppDb db) { _db = db; }', // 11
      '        public async Task<User> GetAsync(int id)', // 12
      '        {', // 13
      '            using (var scope = Begin()) { }', // 14
      '            return await _db.Users.FindAsync(id);', // 15
      '        }', // 16
      '        private static void Log(string m) { }', // 17
      '        public string Name { get; set; }', // 18
      '    }', // 19
      '    public record UserDto(string Name);', // 20
      '}', // 21
    ].join('\n')
    expect(brief(extractSymbols('Services/UserService.cs', cs, 'C#'))).toEqual([
      'module:MyApp.Services@1+',
      'interface:IUserService@3+',
      'method:GetAsync@5+',
      'class:UserService@7+',
      'constant:PageSize@9+',
      'method:UserService@11+',
      'method:GetAsync@12+',
      'method:Log@17',
      'class:UserDto@20+',
    ])
  })
})

describe('Swift, Dart, PHP, Ruby', () => {
  it('Swift (SwiftUI views become components)', () => {
    const swift = [
      'import SwiftUI', // 1
      'struct ContentView: View {', // 2
      '    var body: some View { Text("Hi") }', // 3
      '}', // 4
      'final class Store: ObservableObject {', // 5
      '    init(api: API) {}', // 6
      '    func load() async throws {}', // 7
      '    private func cache() {}', // 8
      '}', // 9
      'protocol API { func fetch() }', // 10
      'enum Route { case home }', // 11
      'extension Store {', // 12
      '    func reset() {}', // 13
      '}', // 14
      'func formatPrice(_ v: Double) -> String { "" }', // 15
    ].join('\n')
    expect(brief(extractSymbols('Sources/App/ContentView.swift', swift, 'Swift'))).toEqual([
      'component:ContentView@2+',
      'class:Store@5+',
      'method:init@6+',
      'method:load@7+',
      'method:cache@8',
      'interface:API@10+',
      'enum:Route@11+',
      'method:reset@13+',
      'function:formatPrice@15+',
    ])
  })

  it('Dart (Flutter widgets become components)', () => {
    const dart = [
      "import 'package:flutter/material.dart';", // 1
      'void main() => runApp(const MyApp());', // 2
      'class MyApp extends StatelessWidget {', // 3
      '  const MyApp({super.key});', // 4
      '  @override', // 5
      '  Widget build(BuildContext context) {', // 6
      '    return MaterialApp();', // 7
      '  }', // 8
      '  void _private() {}', // 9
      '}', // 10
      'mixin Logger {}', // 11
      'String formatName(String n) => n;', // 12
    ].join('\n')
    expect(brief(extractSymbols('lib/main.dart', dart, 'Dart'))).toEqual([
      'function:main@2+',
      'component:MyApp@3+',
      'method:MyApp@4+',
      'method:build@6+',
      'method:_private@9',
      'trait:Logger@11+',
      'function:formatName@12+',
    ])
  })

  it('PHP', () => {
    const php = [
      '<?php', // 1
      'namespace App\\Http\\Controllers;', // 2
      'use App\\Models\\User;', // 3
      'final class UserController extends Controller', // 4
      '{', // 5
      '    public const PER_PAGE = 15;', // 6
      '    public function index(Request $request): View', // 7
      '    {', // 8
      '        return view("users");', // 9
      '    }', // 10
      '    private function guard() {}', // 11
      '}', // 12
      'interface Shape {}', // 13
      'trait HasSlug {}', // 14
      'function helper($x) { return $x; }', // 15
    ].join('\n')
    expect(brief(extractSymbols('app/Http/Controllers/UserController.php', php, 'PHP'))).toEqual([
      'module:App\\Http\\Controllers@2+',
      'class:UserController@4+',
      'constant:PER_PAGE@6+',
      'method:index@7+',
      'method:guard@11',
      'interface:Shape@13+',
      'trait:HasSlug@14+',
      'function:helper@15+',
    ])
  })

  it('Ruby (with private sections)', () => {
    const rb = [
      'module Billing', // 1
      '  TAX_RATE = 0.2', // 2
      '  class Invoice < ApplicationRecord', // 3
      '    def self.build(attrs)', // 4
      '    end', // 5
      '    def total', // 6
      '      items.sum(&:price)', // 7
      '    end', // 8
      '    private', // 9
      '    def recalc!', // 10
      '    end', // 11
      '  end', // 12
      'end', // 13
      'def top_level_helper', // 14
      'end', // 15
    ].join('\n')
    expect(brief(extractSymbols('app/models/invoice.rb', rb, 'Ruby'))).toEqual([
      'module:Billing@1+',
      'constant:TAX_RATE@2+',
      'class:Invoice@3+',
      'method:build@4+',
      'method:total@6+',
      'method:recalc!@10',
      'function:top_level_helper@14+',
    ])
  })
})

describe('C / C++ symbols', () => {
  it('functions, prototypes, structs, classes and macros', () => {
    const c = [
      '#include <stdio.h>', // 1
      '#ifndef UTIL_H', // 2
      '#define UTIL_H', // 3
      '#define MAX_LEN 256', // 4
      '#define SQUARE(x) ((x) * (x))', // 5
      'typedef struct {', // 6
      '    int x;', // 7
      '} Point;', // 8
      'struct node {', // 9
      '    struct node *next;', // 10
      '};', // 11
      'int add(int a, int b);', // 12
      'static int helper(void) {', // 13
      '    return 0;', // 14
      '}', // 15
      'int main(int argc, char **argv)', // 16
      '{', // 17
      '    printf("hi");', // 18
      '    return add(1, 2);', // 19
      '}', // 20
      'char *', // 21
      'dup_string(const char *s)', // 22
      '{', // 23
      '    return 0;', // 24
      '}', // 25
    ].join('\n')
    expect(brief(extractSymbols('src/util.c', c, 'C'))).toEqual([
      'constant:MAX_LEN@4+',
      'function:SQUARE@5+',
      'struct:Point@6+',
      'struct:node@9+',
      'function:helper@13',
      'function:main@16+',
      'function:dup_string@22+',
    ])
  })

  it('C++ classes with access sections, namespaces and out-of-line methods', () => {
    const cpp = [
      'namespace net {', // 1
      'class Server {', // 2
      'public:', // 3
      '    explicit Server(int port);', // 4
      '    ~Server();', // 5
      '    void start();', // 6
      'private:', // 7
      '    int port_;', // 8
      '    bool ready() const;', // 9
      '};', // 10
      'void Server::start() {', // 11
      '    if (ready()) {}', // 12
      '}', // 13
      'std::vector<int> parse(const std::string& s) {', // 14
      '    return {};', // 15
      '}', // 16
      '}  // namespace net', // 17
    ].join('\n')
    expect(brief(extractSymbols('src/server.cpp', cpp, 'C++'))).toEqual([
      'module:net@1+',
      'class:Server@2+',
      'method:Server@4+',
      'method:~Server@5+',
      'method:start@6+',
      'method:ready@9',
      'method:Server::start@11+',
      'function:parse@14+',
    ])
  })
})

describe('other languages', () => {
  it('Elixir, Lua, Shell, R', () => {
    const ex = 'defmodule MyApp.Accounts do\n  def list_users, do: []\n  defp secret(x), do: x\n  defmacro m(x), do: x\nend\n'
    expect(brief(extractSymbols('lib/accounts.ex', ex, 'Elixir'))).toEqual([
      'module:MyApp.Accounts@1+',
      'function:list_users@2+',
      'function:secret@3',
      'function:m@4+',
    ])
    const lua = 'local M = {}\nfunction M.setup(opts)\nend\nlocal function helper()\nend\nfunction M:method() end\nM.run = function() end\nreturn M\n'
    expect(brief(extractSymbols('lua/x/init.lua', lua, 'Lua'))).toEqual(['function:M.setup@2+', 'function:helper@4', 'method:M:method@6+', 'function:M.run@7+'])
    const sh = '#!/bin/bash\nlog() {\n  echo "$1"\n}\nfunction deploy {\n  log hi\n}\n'
    expect(brief(extractSymbols('deploy.sh', sh, 'Shell'))).toEqual(['function:log@2+', 'function:deploy@5+'])
    const r = 'clean_data <- function(df) {\n  df\n}\n.hidden = function() 1\n'
    expect(brief(extractSymbols('R/clean.R', r, 'R'))).toEqual(['function:clean_data@1+', 'function:.hidden@4'])
  })

  it('Solidity, SQL, GraphQL, Protobuf, Terraform, Haskell', () => {
    expect(brief(extractSymbols('A.sol', 'contract Token {\n  function transfer(address to) public {}\n  function _burn() internal {}\n  event Sent();\n}\n', 'Solidity'))).toEqual([
      'class:Token@1+',
      'function:transfer@2+',
      'function:_burn@3',
      'function:Sent@4+',
    ])
    expect(brief(extractSymbols('schema.sql', 'CREATE TABLE IF NOT EXISTS users (id int);\ncreate or replace function add_one() returns int as $$ select 1 $$;\n', 'SQL'))).toEqual([
      'struct:users@1+',
      'function:add_one@2+',
    ])
    expect(brief(extractSymbols('schema.graphql', 'type Query {\n  me: User\n}\ninput NewUser { name: String }\nenum Role { ADMIN }\n', 'GraphQL'))).toEqual([
      'type:Query@1+',
      'type:NewUser@4+',
      'enum:Role@5+',
    ])
    expect(brief(extractSymbols('a.proto', 'message User {\n  string id = 1;\n}\nservice Users {\n  rpc Get(GetReq) returns (User);\n}\n', 'Protocol Buffer'))).toEqual([
      'struct:User@1+',
      'interface:Users@4+',
      'method:Get@5+',
    ])
    expect(brief(extractSymbols('main.tf', 'resource "aws_s3_bucket" "logs" {\n}\nvariable "region" {}\nmodule "vpc" {}\n', 'HCL'))).toEqual([
      'module:aws_s3_bucket.logs@1+',
      'variable:region@3+',
      'module:vpc@4+',
    ])
    expect(brief(extractSymbols('Main.hs', 'module Main where\nmain :: IO ()\nmain = print 1\ndata Shape = Circle\n', 'Haskell'))).toEqual([
      'module:Main@1+',
      'function:main@2+',
      'type:Shape@4+',
    ])
  })

  it('Prisma: only top-level blocks, never fields called type or model (NextAuth Account)', () => {
    const schema = [
      'model Account {', // 1
      '  id                String  @id @default(cuid())', // 2
      '  userId            String', // 3
      '  type              String', // 4
      '  model             String?', // 5
      '  provider          String', // 6
      '}', // 7
      '', // 8
      'enum Role {', // 9
      '  ADMIN', // 10
      '}', // 11
      'type Address {', // 12
      '  street String', // 13
      '}', // 14
      'view UserInfo {', // 15
      '  id Int @unique', // 16
      '}', // 17
    ].join('\n')
    expect(brief(extractSymbols('prisma/schema.prisma', schema, 'Prisma'))).toEqual([
      'struct:Account@1+',
      'enum:Role@9+',
      'type:Address@12+',
      'struct:UserInfo@15+',
    ])
  })

  it('reads declarations the same way however much blank space sits inside them', () => {
    const spaced = `export   async    function     ${' '.repeat(300)}load  (id: string) {}\nclass    Box${' '.repeat(500)}{}\n`
    expect(brief(extractSymbols('a.ts', spaced, 'TypeScript'))).toEqual(['function:load@1+', 'class:Box@2'])
    // Python indentation still decides what is a method.
    const py = 'class A:\n        def m(self):\n                def inner(): pass\n'
    expect(brief(extractSymbols('a.py', py, 'Python'))).toEqual(['class:A@1+', 'method:m@2+'])
  })

  it('returns [] for prose, data and empty input; caps at 200', () => {
    expect(extractSymbols('README.md', '# Title\nfunction x() {}', 'Markdown')).toEqual([])
    expect(extractSymbols('a.json', '{"a": 1}', 'JSON')).toEqual([])
    expect(extractSymbols('a.ts', '', 'TypeScript')).toEqual([])
    const many = Array.from({ length: 400 }, (_, i) => `export function f${i}() {}`).join('\n')
    expect(extractSymbols('many.ts', many, 'TypeScript')).toHaveLength(200)
  })

  it('trims long signatures to 120 characters', () => {
    const long = `export function veryLong(${Array.from({ length: 30 }, (_, i) => `arg${i}: string`).join(', ')}) {}`
    const s = extractSymbols('a.ts', long, 'TypeScript')[0]
    expect(s.signature?.length).toBeLessThanOrEqual(120)
    expect(s.signature?.endsWith('…')).toBe(true)
  })
})

describe('line endings', () => {
  it('handles CRLF files', () => {
    const ts = 'export function a(x: number) {\r\n  return x\r\n}\r\nexport class B {\r\n  run() {}\r\n}\r\n'
    expect(brief(extractSymbols('a.ts', ts, 'TypeScript'))).toEqual(['function:a@1+', 'class:B@4+', 'method:run@5+'])
    expect(extractSymbols('a.ts', ts, 'TypeScript')[0].signature).toBe('export function a(x: number)')
    const py = 'class A:\r\n    def m(self):\r\n        pass\r\ndef f():\r\n    pass\r\n'
    expect(brief(extractSymbols('a.py', py, 'Python'))).toEqual(['class:A@1+', 'method:m@2+', 'function:f@4+'])
  })
})

describe('classic Node.js object style', () => {
  it('finds functions assigned to objects and prototypes', () => {
    const js = [
      'var app = exports = module.exports = {}', // 1
      'app.init = function init() {', // 2
      '  this.cache = {}', // 3
      '}', // 4
      'app.use = function use(fn) {}', // 5
      'Router.prototype.handle = function handle(req, res) {}', // 6
      'res.json = (obj) => obj', // 7
      'this.ignored = function () {}', // 8
    ].join('\n')
    expect(brief(extractSymbols('lib/application.js', js, 'JavaScript'))).toEqual([
      'method:app.init@2+',
      'method:app.use@5+',
      'method:Router.handle@6+',
      'method:res.json@7+',
    ])
  })
})
