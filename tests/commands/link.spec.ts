import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import { linkCommand } from '../../src/commands/link.js'
import { getLocalConfig, setConfig } from '../../src/lib/config.js'

test.group('Link Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('link an existing project successfully', async ({ assert }) => {
    setConfig('authToken', 'test-token')
    
    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith('/api/projects')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: 'proj_link_1', name: 'Project Link 1', team: { name: 'Team A' } },
            { id: 'proj_link_2', name: 'Project Link 2', team: { name: 'Team B' } },
          ])
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject(['proj_link_1'])

    await linkCommand.parseAsync([], { from: 'user' })

    const configPath = path.resolve(process.cwd(), '.gitgone')
    assert.isTrue(fs.existsSync(configPath), '.gitgone file should be created')
    
    const localConfig = getLocalConfig()
    assert.equal(localConfig?.projectId, 'proj_link_1')

    restoreFetch()
  })
})
