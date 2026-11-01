import { makeFile } from './testkit'
import { addSamePackageImports } from './samePackage'

describe('addSamePackageImports', () => {
  it('links Java classes in the same package that use each other without imports', () => {
    const dir = 'src/main/java/com/example/restservice'
    const controller = makeFile(`${dir}/GreetingController.java`, { language: 'Java', fetched: true })
    const greeting = makeFile(`${dir}/Greeting.java`, { language: 'Java', fetched: true })
    const unrelated = makeFile(`${dir}/Other.java`, { language: 'Java', fetched: true })
    const files = { [controller.path]: controller, [greeting.path]: greeting, [unrelated.path]: unrelated }
    const contents = {
      [controller.path]: 'package com.example.restservice;\n// Other is mentioned only in a comment\nclass GreetingController { Greeting greet() { return new Greeting(1, "hi"); } }',
      [greeting.path]: 'package com.example.restservice;\npublic record Greeting(long id, String content) {}',
      [unrelated.path]: 'package com.example.restservice;\nclass Other {}',
    }
    expect(addSamePackageImports(files, contents)).toBe(1)
    expect(controller.imports).toEqual([greeting.path])
    expect(greeting.imports).toEqual([])
  })

  it('ignores other languages and other folders', () => {
    const a = makeFile('pkg/a/Thing.java', { language: 'Java', fetched: true })
    const b = makeFile('pkg/b/User.java', { language: 'Java', fetched: true })
    const py = makeFile('pkg/a/Helper.py', { language: 'Python', fetched: true })
    const files = { [a.path]: a, [b.path]: b, [py.path]: py }
    const contents = { [a.path]: 'class Thing { User u; Helper h; }', [b.path]: 'class User {}', [py.path]: 'Thing = 1' }
    expect(addSamePackageImports(files, contents)).toBe(0)
  })
})
