import { describe, expect, it } from 'vitest'
import { isPeripheral, isTestFileName, isWrapperScript, roleSegmentCount, zonesOf } from './zones'

describe('zonesOf', () => {
  it('treats folders below a JVM source root as package names, not folder roles', () => {
    // Spring Initializr's default package is com.example.demo; spring-petclinic lives in org/springframework/samples.
    expect(zonesOf('src/main/java/com/example/demo/DemoApplication.java')).toEqual([])
    expect(zonesOf('src/main/java/org/springframework/samples/petclinic/owner/Owner.java')).toEqual([])
    expect(zonesOf('src/main/kotlin/com/example/demo/App.kt')).toEqual([])
    expect(zonesOf('app/src/main/java/com/example/myapplication/MainActivity.kt')).toEqual([])
    expect(isPeripheral('complete/src/main/java/com/example/restservice/GreetingController.java')).toBe(false)
  })

  it('still sees zones above the source root', () => {
    expect(zonesOf('src/test/java/com/example/demo/DemoTests.java')).toEqual(['test'])
    expect(zonesOf('samples/hello/src/main/java/com/acme/Hello.java')).toEqual(['example'])
    expect(zonesOf('examples/basic/index.js')).toEqual(['example'])
    expect(zonesOf('packages/core/test/fixtures/a.json')).toEqual(['test'])
  })

  it('counts role segments up to the language folder', () => {
    expect(roleSegmentCount(['src', 'main', 'java', 'com', 'example'])).toBe(3)
    expect(roleSegmentCount(['lib', 'example'])).toBe(2)
  })
})

describe('isTestFileName', () => {
  it('recognises Django test modules and test set-up helpers', () => {
    expect(isTestFileName('tests.py')).toBe(true)
    expect(isTestFileName('test.py')).toBe(true)
    expect(isTestFileName('tests_views.py')).toBe(true)
    expect(isTestFileName('setupTests.ts')).toBe(true)
    expect(isTestFileName('setup-tests.js')).toBe(true)
    expect(isTestFileName('testFixtures.ts')).toBe(true)
    expect(isTestFileName('test-helpers.js')).toBe(true)
  })

  it('leaves ordinary files alone', () => {
    expect(isTestFileName('views.py')).toBe(false)
    expect(isTestFileName('testing.py')).toBe(false)
    expect(isTestFileName('fixtures.ts')).toBe(false)
    expect(isTestFileName('setup.py')).toBe(false)
    expect(isTestFileName('contest.ts')).toBe(false)
  })
})

describe('isWrapperScript', () => {
  it('spots the Maven and Gradle launchers projects copy in', () => {
    for (const p of ['mvnw', 'mvnw.cmd', 'gradlew', 'gradlew.bat', 'complete/mvnw', 'initial/gradlew']) expect(isWrapperScript(p)).toBe(true)
    for (const p of ['install', 'bin/run', 'mvnw.sh', 'scripts/gradlew-helper']) expect(isWrapperScript(p)).toBe(false)
  })
})
