import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole } from '../helpers.js'
import { historyCommand } from '../../src/commands/history.js'
import { setLocalConfig } from '../../src/lib/config.js'

test.group('History Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('show history successfully', async ({ assert }) => {
    const projectId = 'proj_hist_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })

    const historyData = [
      { id: 'snap_1', version: 1, createdAt: new Date().toISOString(), creator: { fullName: 'User A' } },
      { id: 'snap_2', version: 2, createdAt: new Date().toISOString(), creator: { fullName: 'User B' } },
    ]

    const restoreFetch = mockFetch(async (url) => {
      if (url.includes('/api/secrets/history')) {
        return {
          ok: true,
          status: 200,
          json: async () => historyData
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    const consoleSpy = spyConsole()

    await historyCommand.parseAsync([], { from: 'user' })

    const output = consoleSpy.logs.join('\n')
    assert.include(output, 'User A')
    assert.include(output, 'User B')
    assert.include(output, 'snap_1')
    assert.include(output, 'snap_2')

    consoleSpy.restore()
    restoreFetch()
  })
})