import type { RawImport } from '@/core/types'
import { expandPhpUse, expandScalaImport, expandUseTree, extractImports, parseJsClause } from './index'

const specs = (imps: RawImport[]) => imps.map((i) => i.specifier)
const find = (imps: RawImport[], spec: string) => imps.find((i) => i.specifier === spec)

describe('JavaScript / TypeScript imports', () => {
  const src = [
    "import React, { useState, type FC } from 'react'", // 1
    'import {', // 2
    '  a,', // 3
    '  b as c,', // 4
    "} from './utils'", // 5
    "import type { User } from '@/types/user'", // 6
    "import * as path from 'node:path'", // 7
    "import './styles.css'", // 8
    "export * from './reexport'", // 9
    "export { default as Button, type Props } from '@acme/ui/button'", // 10
    "const fs = require('fs')", // 11
    "const { join, resolve: r } = require(\"path\")", // 12
    "const lazy = () => import('./pages/Lazy')", // 13
    'const dyn = import(`./locales/${lang}.json`)', // 14 — not a literal: skipped
    "const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })", // 15
    "// import nope from 'commented-out'", // 16
    "const s = \"import fake from 'in-a-string'\"", // 17
    'const tpl = `', // 18
    "import alsoFake from 'in-a-template'", // 19
    '`', // 20
    "import def from \"double-quoted\";", // 21
    "import x = require('ts-equals')", // 22
    'export const value = 1', // 23
  ].join('\n')
  const imps = extractImports('src/app.tsx', src, 'TSX')

  it('finds every real import with correct 1-based lines', () => {
    expect(specs(imps)).toEqual([
      'react',
      './utils',
      '@/types/user',
      'node:path',
      './styles.css',
      './reexport',
      '@acme/ui/button',
      'fs',
      'path',
      './pages/Lazy',
      './worker.ts',
      'double-quoted',
      'ts-equals',
    ])
    expect(find(imps, 'react')?.line).toBe(1)
    expect(find(imps, './utils')?.line).toBe(2)
    expect(find(imps, '@/types/user')?.line).toBe(6)
    expect(find(imps, './styles.css')?.line).toBe(8)
    expect(find(imps, 'fs')?.line).toBe(11)
    expect(find(imps, './pages/Lazy')?.line).toBe(13)
    expect(find(imps, './worker.ts')?.line).toBe(15)
    expect(find(imps, 'double-quoted')?.line).toBe(21)
  })

  it('records names and kinds', () => {
    expect(find(imps, 'react')?.names).toEqual(['React', 'useState', 'FC'])
    expect(find(imps, './utils')?.names).toEqual(['a', 'b'])
    expect(find(imps, '@/types/user')?.kind).toBe('type')
    expect(find(imps, 'node:path')?.names).toEqual(['path'])
    expect(find(imps, './reexport')?.kind).toBe('export')
    expect(find(imps, '@acme/ui/button')?.names).toEqual(['Props'])
    expect(find(imps, 'fs')).toMatchObject({ kind: 'require', names: ['fs'] })
    expect(find(imps, 'path')?.names).toEqual(['join', 'resolve'])
    expect(find(imps, './pages/Lazy')?.kind).toBe('dynamic')
    expect(find(imps, './worker.ts')?.kind).toBe('url')
  })

  it('ignores comments, strings and template literals', () => {
    expect(specs(imps)).not.toContain('commented-out')
    expect(specs(imps)).not.toContain('in-a-string')
    expect(specs(imps)).not.toContain('in-a-template')
  })

  it('deduplicates specifiers, keeping the first line and merging names', () => {
    const out = extractImports(
      'a.ts',
      "import type { A } from './a'\nimport { b } from './a'\nconst c = require('./a')\n",
      'TypeScript',
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ specifier: './a', line: 1, kind: 'import', names: ['A', 'b', 'c'] })
  })

  it('handles minified-style and unusual spacing', () => {
    const out = extractImports('a.js', "import{a}from'x';import b from\"y\";export*from'z'", 'JavaScript')
    expect(specs(out)).toEqual(['x', 'y', 'z'])
  })

  it('does not confuse import.meta or identifiers containing "import"', () => {
    const out = extractImports(
      'a.js',
      'const u = import.meta.url\nconst importer = 1\nobj.import("x")\nreimport("y")\n',
      'JavaScript',
    )
    expect(out).toEqual([])
  })

  it('reads triple-slash path references', () => {
    const out = extractImports('a.ts', '/// <reference path="./globals.d.ts" />\n/// <reference types="node" />\n', 'TypeScript')
    expect(out).toEqual([{ specifier: './globals.d.ts', line: 1, kind: 'reference' }])
  })

  it('handles a default import named "type" and type-only namespace imports', () => {
    const out = extractImports('a.ts', "import type from 'x'\nimport type * as T from 'y'\n", 'TypeScript')
    expect(find(out, 'x')?.kind).toBe('import')
    expect(find(out, 'y')?.kind).toBe('type')
  })

  it('works when language is empty (detects from path)', () => {
    expect(specs(extractImports('src/a.mjs', "import x from 'y'", ''))).toEqual(['y'])
  })
})

describe('Vue / Svelte / Astro / MDX / HTML', () => {
  it('scans only the <script> blocks of a Vue file, with real line numbers', () => {
    const vue = [
      '<template>', // 1
      "  <div>import fake from 'not-code'</div>", // 2
      '</template>', // 3
      '<script setup lang="ts">', // 4
      "import Child from './Child.vue'", // 5
      "import { ref } from 'vue'", // 6
      '</script>', // 7
      '<style lang="scss" scoped>', // 8
      "@use '../styles/vars' as *;", // 9
      '</style>', // 10
    ].join('\n')
    const out = extractImports('src/App.vue', vue, 'Vue')
    expect(specs(out)).toEqual(['./Child.vue', 'vue', '../styles/vars'])
    expect(find(out, './Child.vue')?.line).toBe(5)
    expect(find(out, '../styles/vars')?.line).toBe(9)
  })

  it('handles multiple Svelte script blocks', () => {
    const svelte = [
      '<script context="module">',
      "  import { load } from './load'",
      '</script>',
      '<script>',
      "  import Button from '$lib/Button.svelte'",
      '</script>',
      '<Button />',
    ].join('\n')
    expect(specs(extractImports('src/routes/+page.svelte', svelte, 'Svelte'))).toEqual(['./load', '$lib/Button.svelte'])
  })

  it('reads Astro frontmatter', () => {
    const astro = "---\nimport Layout from '../layouts/Base.astro'\nconst title = 'x'\n---\n<Layout title={title} />\n"
    const out = extractImports('src/pages/index.astro', astro, 'Astro')
    expect(out).toEqual([{ specifier: '../layouts/Base.astro', line: 2, kind: 'import', names: ['Layout'] }])
  })

  it('reads MDX ESM lines but not code fences', () => {
    const mdx = "import Chart from './Chart'\n\n# Title\n\n```js\nimport nope from 'nope'\n```\n"
    expect(specs(extractImports('docs/a.mdx', mdx, 'MDX'))).toEqual(['./Chart'])
  })

  it('reads HTML script/link references and inline module scripts', () => {
    const html = [
      '<!doctype html>',
      '<link rel="stylesheet" href="/styles/main.css">',
      '<link rel="icon" href="/favicon.svg">',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2">',
      '<!-- <script src="old.js"></script> -->',
      '<script type="module" src="/src/main.tsx"></script>',
      '<script type="module">',
      "  import { boot } from './boot.js'",
      '</script>',
    ].join('\n')
    const out = extractImports('index.html', html, 'HTML')
    expect(specs(out)).toEqual(['/styles/main.css', '/src/main.tsx', './boot.js'])
    expect(find(out, '/src/main.tsx')?.line).toBe(6)
    expect(find(out, './boot.js')?.line).toBe(8)
  })

  it('reads template-language includes', () => {
    const jinja = '{% extends "base.html" %}\n{% include \'partials/nav.html\' %}\n<script src="/static/app.js"></script>'
    expect(specs(extractImports('templates/index.html.j2', jinja, 'Jinja'))).toEqual([
      'base.html',
      'partials/nav.html',
      '/static/app.js',
    ])
    expect(specs(extractImports('resources/views/home.blade.php', "@extends('layouts.app')\n@include('partials.nav')", 'Blade'))).toEqual([
      'layouts.app',
      'partials.nav',
    ])
  })
})

describe('Python imports', () => {
  const py = [
    'import os, sys', // 1
    'import numpy as np', // 2
    'import a.b.c as d', // 3
    'from . import utils', // 4
    'from .. import models, views as v', // 5
    'from .services.auth import (', // 6
    '    login,', // 7
    '    logout as lo,', // 8
    ')', // 9
    'from app.core.config import settings', // 10
    'from __future__ import annotations', // 11
    'try:', // 12
    '    import ujson as json', // 13
    'except ImportError:', // 14
    '    import json', // 15
    '"""', // 16
    'import not_real', // 17
    '"""', // 18
    '# import commented', // 19
    'from x import \\', // 20
    '    y', // 21
    'import q; import r', // 22
    "mod = importlib.import_module('plugins.extra')", // 23
    'from .pkg import *', // 24
  ].join('\n')
  const imps = extractImports('app/api/routes.py', py, 'Python')

  it('finds all forms with correct lines', () => {
    expect(specs(imps)).toEqual([
      'os',
      'sys',
      'numpy',
      'a.b.c',
      '.',
      '..',
      '.services.auth',
      'app.core.config',
      '__future__',
      'ujson',
      'json',
      'x',
      'q',
      'r',
      'plugins.extra',
      '.pkg',
    ])
    expect(find(imps, '.services.auth')?.line).toBe(6)
    expect(find(imps, 'ujson')?.line).toBe(13)
    expect(find(imps, 'json')?.line).toBe(15)
    expect(find(imps, 'x')?.line).toBe(20)
    expect(find(imps, 'r')?.line).toBe(22)
  })

  it('records imported names', () => {
    expect(find(imps, '.')?.names).toEqual(['utils'])
    expect(find(imps, '..')?.names).toEqual(['models', 'views'])
    expect(find(imps, '.services.auth')?.names).toEqual(['login', 'logout'])
    expect(find(imps, 'numpy')?.names).toEqual(['np'])
    expect(find(imps, 'x')?.names).toEqual(['y'])
    expect(find(imps, '.pkg')?.names).toEqual(['*'])
  })

  it('skips docstrings and comments', () => {
    expect(specs(imps)).not.toContain('not_real')
    expect(specs(imps)).not.toContain('commented')
  })

  it('reads code cells of Jupyter notebooks, keeping file line numbers', () => {
    const nb = JSON.stringify(
      {
        cells: [
          { cell_type: 'markdown', source: ['from the start import nothing\n'] },
          { cell_type: 'code', source: ['import pandas as pd\n', 'from sklearn.model_selection import train_test_split\n'] },
        ],
      },
      null,
      1,
    )
    const out = extractImports('analysis.ipynb', nb, 'Jupyter Notebook')
    expect(specs(out)).toEqual(['pandas', 'sklearn.model_selection'])
    const lines = nb.split('\n')
    expect(lines[(find(out, 'pandas')?.line ?? 0) - 1]).toContain('import pandas')
  })
})

describe('Go imports', () => {
  it('handles single, grouped, aliased, blank and dot imports', () => {
    const go = [
      'package main', // 1
      '', // 2
      'import "fmt"', // 3
      'import (', // 4
      '\t"net/http"', // 5
      '\tlog "github.com/sirupsen/logrus"', // 6
      '\t_ "github.com/lib/pq"', // 7
      '\t. "github.com/onsi/gomega"', // 8
      '', // 9
      '\t"github.com/acme/app/internal/db" // the db', // 10
      ')', // 11
      'var s = "import \\"fake\\""', // 12
    ].join('\n')
    const out = extractImports('cmd/server/main.go', go, 'Go')
    expect(specs(out)).toEqual([
      'fmt',
      'net/http',
      'github.com/sirupsen/logrus',
      'github.com/lib/pq',
      'github.com/onsi/gomega',
      'github.com/acme/app/internal/db',
    ])
    expect(find(out, 'net/http')?.line).toBe(5)
    expect(find(out, 'github.com/sirupsen/logrus')).toMatchObject({ line: 6, names: ['log'] })
    expect(find(out, 'github.com/lib/pq')?.names).toEqual(['_'])
    expect(find(out, 'github.com/acme/app/internal/db')?.line).toBe(10)
  })
})

describe('Rust imports', () => {
  it('expands use trees', () => {
    expect(expandUseTree('crate::a::{b, c::{d, e as f}, self}')).toEqual([
      'crate::a::b',
      'crate::a::c::d',
      'crate::a::c::e',
      'crate::a',
    ])
    expect(expandUseTree('std::collections::*')).toEqual(['std::collections'])
    expect(expandUseTree('::serde::{Serialize, Deserialize}')).toEqual(['serde::Serialize', 'serde::Deserialize'])
    expect(expandUseTree('{a::b, c}')).toEqual(['a::b', 'c'])
    expect(expandUseTree('super::super::x')).toEqual(['super::super::x'])
  })

  it('finds mod, use, pub use, extern crate and include!', () => {
    const rs = [
      'mod config;', // 1
      'pub mod api;', // 2
      'pub(crate) mod db;', // 3
      'mod inline { fn x() {} }', // 4
      'use std::io::{self, Read};', // 5
      'use crate::db::models::User;', // 6
      'pub use super::shared::*;', // 7
      'use serde::{', // 8
      '    Deserialize,', // 9
      '    Serialize,', // 10
      '};', // 11
      'extern crate log;', // 12
      'const S: &str = include_str!("../assets/schema.sql");', // 13
      '#[path = "platform/unix.rs"]', // 14
      'mod platform;', // 15
      '// use fake::thing;', // 16
    ].join('\n')
    const out = extractImports('src/lib.rs', rs, 'Rust')
    expect(specs(out)).toEqual([
      'config',
      'api',
      'db',
      'std::io',
      'std::io::Read',
      'crate::db::models::User',
      'super::shared',
      'serde::Deserialize',
      'serde::Serialize',
      'log',
      '../assets/schema.sql',
      'platform/unix.rs',
    ])
    expect(find(out, 'config')?.kind).toBe('mod')
    expect(find(out, 'serde::Serialize')?.line).toBe(8)
    expect(find(out, 'platform/unix.rs')).toMatchObject({ kind: 'mod-path', line: 15, names: ['platform'] })
    expect(find(out, 'log')?.kind).toBe('extern')
  })
})

describe('JVM imports', () => {
  it('handles Java imports including static and wildcard', () => {
    const java = [
      'package com.acme.app;',
      'import java.util.List;',
      'import static org.junit.Assert.assertEquals;',
      'import com.acme.app.models.*;',
      'import com.acme.app.service.UserService;',
    ].join('\n')
    const out = extractImports('src/main/java/com/acme/app/App.java', java, 'Java')
    expect(specs(out)).toEqual([
      'java.util.List',
      'org.junit.Assert.assertEquals',
      'com.acme.app.models.*',
      'com.acme.app.service.UserService',
    ])
    expect(find(out, 'org.junit.Assert.assertEquals')?.kind).toBe('static')
    expect(find(out, 'com.acme.app.service.UserService')?.line).toBe(5)
  })

  it('handles Kotlin imports with aliases', () => {
    const kt = 'package a\n\nimport kotlinx.coroutines.flow.Flow\nimport com.acme.util.format as fmt\n'
    const out = extractImports('src/main/kotlin/a/App.kt', kt, 'Kotlin')
    expect(specs(out)).toEqual(['kotlinx.coroutines.flow.Flow', 'com.acme.util.format'])
    expect(find(out, 'com.acme.util.format')?.names).toEqual(['fmt'])
  })

  it('expands Scala selectors', () => {
    expect(expandScalaImport('scala.collection.mutable.{Map, Set => MSet, _}')).toEqual([
      'scala.collection.mutable.Map',
      'scala.collection.mutable.Set',
      'scala.collection.mutable.*',
    ])
    expect(expandScalaImport('a.b._, c.d.E')).toEqual(['a.b.*', 'c.d.E'])
    const out = extractImports('src/main/scala/App.scala', 'import akka.actor.{ActorSystem, Props}\n', 'Scala')
    expect(specs(out)).toEqual(['akka.actor.ActorSystem', 'akka.actor.Props'])
  })
})

describe('C# imports', () => {
  it('handles using forms but not using statements', () => {
    const cs = [
      'using System;',
      'using System.Collections.Generic;',
      'global using MyApp.Shared;',
      'using static System.Math;',
      'using Json = Newtonsoft.Json;',
      'namespace MyApp.Web;',
      'class A { void F() { using (var s = new Stream()) {} using var x = Make(); } }',
    ].join('\n')
    const out = extractImports('Program.cs', cs, 'C#')
    expect(specs(out)).toEqual(['System', 'System.Collections.Generic', 'MyApp.Shared', 'System.Math', 'Newtonsoft.Json'])
    expect(find(out, 'Newtonsoft.Json')?.names).toEqual(['Json'])
    expect(find(out, 'System.Math')?.kind).toBe('static')
  })
})

describe('C / C++ imports', () => {
  it('distinguishes quoted and angle includes', () => {
    const c = '#include <stdio.h>\n#include "utils/helpers.h"\n  #  include <boost/asio.hpp>\n// #include "fake.h"\n#import <Foundation/Foundation.h>\n@import UIKit;\n'
    const out = extractImports('src/main.cpp', c, 'C++')
    expect(out).toEqual([
      { specifier: 'stdio.h', line: 1, kind: 'include-system' },
      { specifier: 'utils/helpers.h', line: 2, kind: 'include' },
      { specifier: 'boost/asio.hpp', line: 3, kind: 'include-system' },
      { specifier: 'Foundation/Foundation.h', line: 5, kind: 'include-system' },
      { specifier: 'UIKit', line: 6, kind: 'module' },
    ])
  })
})

describe('Ruby, PHP, Swift, Dart, Elixir, Lua, R, Shell', () => {
  it('Ruby', () => {
    const rb = [
      "require 'json'",
      'require "net/http"',
      "require_relative '../lib/helper'",
      "require File.expand_path('../config/environment', __FILE__)",
      "require File.join(__dir__, 'support', 'x')",
      "autoload :Parser, 'my_gem/parser'",
      'require "#{dir}/dynamic"',
      "# require 'commented'",
    ].join('\n')
    const out = extractImports('spec/spec_helper.rb', rb, 'Ruby')
    expect(specs(out)).toEqual(['json', 'net/http', '../lib/helper', './config/environment', './support/x', 'my_gem/parser'])
    expect(find(out, '../lib/helper')?.kind).toBe('require_relative')
  })

  it('PHP', () => {
    expect(expandPhpUse('App\\Models\\{User, Post as P}')).toEqual(['App\\Models\\User', 'App\\Models\\Post'])
    expect(expandPhpUse('A\\B, C\\D as E')).toEqual(['A\\B', 'C\\D'])
    const php = [
      '<?php',
      'namespace App\\Http\\Controllers;',
      'use App\\Models\\User;',
      'use Illuminate\\Http\\{Request, Response};',
      'use function App\\Support\\helper;',
      "require_once __DIR__ . '/../bootstrap/app.php';",
      "include 'partials/header.php';",
      'class A {',
      '  use HasFactory;',
      '  public function f() { return function () use ($x) {}; }',
      '}',
    ].join('\n')
    const out = extractImports('app/Http/Controllers/A.php', php, 'PHP')
    expect(specs(out)).toEqual([
      'App\\Models\\User',
      'Illuminate\\Http\\Request',
      'Illuminate\\Http\\Response',
      'App\\Support\\helper',
      './../bootstrap/app.php',
      'partials/header.php',
    ])
    expect(find(out, 'App\\Support\\helper')?.kind).toBe('function')
  })

  it('Swift', () => {
    const out = extractImports('Sources/App/main.swift', 'import Foundation\n@testable import MyApp\nimport struct Vapor.Request\n', 'Swift')
    expect(specs(out)).toEqual(['Foundation', 'MyApp', 'Vapor.Request'])
  })

  it('Dart', () => {
    const dart = "import 'package:flutter/material.dart';\nimport 'dart:async';\nimport 'src/widgets/button.dart' as b;\nexport 'models.dart';\npart 'app.g.dart';\npart of 'main.dart';\n"
    expect(specs(extractImports('lib/main.dart', dart, 'Dart'))).toEqual([
      'package:flutter/material.dart',
      'dart:async',
      'src/widgets/button.dart',
      'models.dart',
      'app.g.dart',
    ])
  })

  it('Elixir', () => {
    const ex = 'defmodule MyAppWeb.UserController do\n  use MyAppWeb, :controller\n  alias MyApp.{Accounts, Repo}\n  import Ecto.Query\n  require Logger\nend\n'
    expect(specs(extractImports('lib/my_app_web/user_controller.ex', ex, 'Elixir'))).toEqual([
      'MyAppWeb',
      'MyApp.Accounts',
      'MyApp.Repo',
      'Ecto.Query',
      'Logger',
    ])
  })

  it('Lua', () => {
    const lua = "local cfg = require('config.settings')\nlocal u = require \"utils\"\n-- require('nope')\ndofile('init.lua')\n"
    expect(specs(extractImports('lua/plugin/init.lua', lua, 'Lua'))).toEqual(['config.settings', 'utils', 'init.lua'])
  })

  it('R', () => {
    const r = 'library(dplyr)\nrequire("ggplot2")\nsource("R/helpers.R")\nx <- stringr::str_detect(a, "b")\n# library(nope)\n'
    const out = extractImports('analysis.R', r, 'R')
    expect(specs(out)).toEqual(['dplyr', 'ggplot2', 'R/helpers.R', 'stringr'])
    expect(find(out, 'R/helpers.R')?.kind).toBe('source')
  })

  it('Shell', () => {
    const sh = '#!/bin/bash\nsource ./lib/common.sh\n. "$(dirname "$0")/env.sh"\nsource "${SCRIPT_DIR}/util.sh"\nsource $HOME/.bashrc\n# source nope.sh\n'
    expect(specs(extractImports('scripts/deploy.sh', sh, 'Shell'))).toEqual(['./lib/common.sh', './env.sh', './util.sh'])
  })
})

describe('CSS imports', () => {
  it('handles @import/@use/@forward, url(), lists and partials', () => {
    const scss = [
      "@use 'sass:math';",
      "@import 'variables', 'mixins';",
      '@import url("theme.css");',
      '@import url(reset.css);',
      "@forward 'src/list' hide list-reset;",
      "@import 'https://fonts.googleapis.com/css?family=Inter';",
      "// @import 'nope';",
      '.a { composes: b from "./shared.module.css"; }',
    ].join('\n')
    const out = extractImports('styles/main.scss', scss, 'SCSS')
    expect(specs(out)).toEqual(['sass:math', 'variables', 'mixins', 'theme.css', 'reset.css', 'src/list', './shared.module.css'])
    expect(find(out, 'mixins')?.line).toBe(2)
  })

  it('handles Tailwind v4 imports in plain CSS', () => {
    const out = extractImports('src/index.css', '@import "tailwindcss";\n@plugin "@tailwindcss/typography";\n', 'CSS')
    expect(specs(out)).toEqual(['tailwindcss', '@tailwindcss/typography'])
  })
})

describe('other languages', () => {
  it('Zig, Solidity, Protobuf, Haskell, Julia, Terraform, CMake, Starlark', () => {
    expect(specs(extractImports('src/main.zig', 'const std = @import("std");\nconst m = @import("math.zig");', 'Zig'))).toEqual(['std', 'math.zig'])
    expect(specs(extractImports('contracts/A.sol', 'import "./B.sol";\nimport {C} from "@openzeppelin/contracts/C.sol";', 'Solidity'))).toEqual([
      './B.sol',
      '@openzeppelin/contracts/C.sol',
    ])
    expect(specs(extractImports('a.proto', 'syntax = "proto3";\nimport "google/protobuf/timestamp.proto";\nimport public "common.proto";', 'Protocol Buffer'))).toEqual([
      'google/protobuf/timestamp.proto',
      'common.proto',
    ])
    expect(specs(extractImports('src/Main.hs', 'module Main where\nimport qualified Data.Map as M\nimport App.Types\n', 'Haskell'))).toEqual(['Data.Map', 'App.Types'])
    expect(specs(extractImports('src/a.jl', 'using LinearAlgebra, Statistics\nimport Base: show\ninclude("utils.jl")', 'Julia'))).toEqual([
      'LinearAlgebra',
      'Statistics',
      'Base',
      'utils.jl',
    ])
    expect(specs(extractImports('main.tf', 'module "vpc" {\n  source = "./modules/vpc"\n}\nmodule "x" { source = "hashicorp/consul/aws" }', 'HCL'))).toEqual([
      './modules/vpc',
      'hashicorp/consul/aws',
    ])
    expect(specs(extractImports('CMakeLists.txt', 'add_subdirectory(src)\ninclude(cmake/Deps.cmake)\n# add_subdirectory(nope)', 'CMake'))).toEqual([
      'src',
      'cmake/Deps.cmake',
    ])
    expect(specs(extractImports('BUILD', 'load("//tools:defs.bzl", "rule")\nload("@rules_go//go:def.bzl", "go_library")', 'Starlark'))).toEqual([
      '//tools:defs.bzl',
      '@rules_go//go:def.bzl',
    ])
  })

  it('returns [] for prose, data and empty input', () => {
    expect(extractImports('README.md', "import x from 'y'", 'Markdown')).toEqual([])
    expect(extractImports('a.json', '{"import": "x"}', 'JSON')).toEqual([])
    expect(extractImports('a.ts', '', 'TypeScript')).toEqual([])
  })
})

describe('parseJsClause', () => {
  it('parses default, namespace and named parts', () => {
    expect(parseJsClause('React, * as R')).toEqual({ names: ['React', 'R'], typeOnly: false })
    expect(parseJsClause('type { A, B as C }')).toEqual({ names: ['A', 'B'], typeOnly: true })
  })
})

describe('performance', () => {
  it('handles a large file quickly', () => {
    const body = Array.from({ length: 5000 }, (_, i) => `import m${i} from './mod${i}'\nconst v${i} = m${i}(1) // note`).join('\n')
    const t = performance.now()
    const out = extractImports('big.ts', body, 'TypeScript')
    expect(out).toHaveLength(1000)
    expect(performance.now() - t).toBeLessThan(2000)
  })
})

describe('line endings and BOMs', () => {
  it('handles CRLF files and a leading BOM', () => {
    const ts = "\uFEFFimport a from './a'\r\nimport {\r\n  b,\r\n} from './b'\r\n"
    const out = extractImports('x.ts', ts, 'TypeScript')
    expect(out.map((i) => [i.specifier, i.line])).toEqual([
      ['./a', 1],
      ['./b', 2],
    ])
    const py = 'import os, sys\r\nfrom .x import (\r\n  y,\r\n)\r\n'
    expect(extractImports('a.py', py, 'Python').map((i) => [i.specifier, i.line, i.names])).toEqual([
      ['os', 1, undefined],
      ['sys', 1, undefined],
      ['.x', 2, ['y']],
    ])
  })
})
