import { assert } from '@japa/assert'
import { configure, run } from '@japa/runner'
import { scriptedAsker, setAsker } from '@/ui/ask.js'
import { setPlainSpinner } from '@/ui/spinner.js'
import { setSecretStore } from '@/services/keychain.js'
import { setColor } from '@/ui/theme.js'
import { memorySecretStore } from '@tests/helpers.js'

setAsker(scriptedAsker([]))
setPlainSpinner(true)
setColor(false)
setSecretStore(memorySecretStore())

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
