import '@japa/runner'

declare module '@japa/runner' {
  interface TestContext {
    assert: import('@japa/assert').Assert
  }
}
