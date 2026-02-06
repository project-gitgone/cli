import { test } from '@japa/runner'
import { setupEnvironment } from '../helpers.js'
import fs from 'fs'
import path from 'path'
import { configCommand } from '../../src/commands/config.js'
import { getConfig, getLocalConfig } from '../../src/lib/config.js'

test.group('Config Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('set global config', async ({ assert }) => {
    await configCommand.parseAsync(['set', 'serverUrl', 'http://new-url.com'], { from: 'user' })

    const config = getConfig()
    assert.equal(config.serverUrl, 'http://new-url.com')
  })

  test('set local config', async ({ assert }) => {
    await configCommand.parseAsync(['local-set', 'projectId', 'proj_ABC'], { from: 'user' })

    const localConfig = getLocalConfig()
    assert.equal(localConfig?.projectId, 'proj_ABC')

    const configPath = path.resolve(process.cwd(), '.gitgone')
    assert.isTrue(fs.existsSync(configPath))
  })
})
