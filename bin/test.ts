import { assert } from '@japa/assert'
import { configure, run } from '@japa/runner'

configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert()],
})

run()

declare module '@japa/runner' {
  interface TestContext {
    assert: import('@japa/assert').Assert
  }
}
