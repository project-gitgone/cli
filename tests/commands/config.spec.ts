import { test } from '@japa/runner'
import fs from 'fs'
import path from 'path'
import { configCommand } from '@/commands/config.js'
import { setConfig, getConfig, getLocalConfig } from '@/lib/config.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { invoke, setupEnvironment } from '@tests/helpers.js'

const { get, set } = configCommand.subCommands!

test.group('Config Command', (group) => {
  let output = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    output = ''
    setOutput((text) => (output += text))
    return () => {
      resetOutput()
      env.cleanup()
    }
  })

  test('set global config', async ({ assert }) => {
    await invoke(set, ['serverUrl', 'http://new-url.com'])
    assert.equal(getConfig().serverUrl, 'http://new-url.com')
  })

  test('set local config with --local', async ({ assert }) => {
    await invoke(set, ['environment', 'staging', '--local'])
    assert.equal(getLocalConfig()?.environment, 'staging')
    assert.isTrue(fs.existsSync(path.resolve(process.cwd(), '.gitgone')))
  })

  test('an unknown key is refused', async ({ assert }) => {
    await assert.rejects(() => invoke(set, ['authToken', 'x']), 'Unknown key "authToken".')
  })

  test('get never shows the session or the keys', async ({ assert }) => {
    setConfig('authToken', 'oat_secret_token')
    setConfig('encryptedPrivateKey', 'encrypted-private-key')
    const result = await invoke(get, [])
    assert.notInclude(output, 'oat_secret_token')
    assert.notInclude(output, 'encrypted-private-key')
    assert.notInclude(JSON.stringify(result), 'oat_secret_token')
    assert.include(output, 'serverUrl')
  })
})
