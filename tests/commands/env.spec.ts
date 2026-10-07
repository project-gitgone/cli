import { test } from '@japa/runner'
import fs from 'fs'
import path from 'path'
import { setupEnvironment, mockFetch, invoke } from '@tests/helpers.js'
import { envCommand } from '@/commands/env.js'

const ENVIRONMENTS = [{ id: 'env_1', name: 'live', protected: false, retention: null, snapshotCount: 2, lastPushAt: null }]

test.group('Env Command', (group) => {
  let tmpDir = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    tmpDir = env.tmpDir
    fs.writeFileSync(path.join(tmpDir, '.gitgone'), JSON.stringify({ projectId: 'prj_1' }))
    return () => env.cleanup()
  })

  test('protect patches the environment found by name', async ({ assert }) => {
    let sent: any = null
    let patchedUrl = ''
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/projects/prj_1/environments') && !init?.method) {
        return { ok: true, status: 200, json: async () => ENVIRONMENTS }
      }
      if (init?.method === 'PATCH') {
        patchedUrl = url
        sent = JSON.parse(init.body)
        return { ok: true, status: 200, json: async () => ({ ...ENVIRONMENTS[0], protected: true }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    await invoke(envCommand.subCommands!.protect, ['live'])
    restore()
    assert.isTrue(patchedUrl.endsWith('/api/projects/prj_1/environments/env_1'))
    assert.deepEqual(sent, { protected: true })
  })

  test('retention off sends null, create sends options', async ({ assert }) => {
    const bodies: any[] = []
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/projects/prj_1/environments') && !init?.method) {
        return { ok: true, status: 200, json: async () => ENVIRONMENTS }
      }
      bodies.push(JSON.parse(init.body))
      return { ok: true, status: 200, json: async () => ({}) }
    })
    await invoke(envCommand.subCommands!.retention, ['live', 'off'])
    await invoke(envCommand.subCommands!.create, ['qa', '--protected', '--retention', '5'])
    restore()
    assert.deepEqual(bodies, [{ retention: null }, { name: 'qa', protected: true, retention: 5 }])
  })

  test('an invalid retention is refused without calling the API', async ({ assert }) => {
    let patched = false
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/projects/prj_1/environments') && !init?.method) {
        return { ok: true, status: 200, json: async () => ENVIRONMENTS }
      }
      if (init?.method === 'PATCH') patched = true
      return { ok: true, status: 200, json: async () => ({}) }
    })
    await assert.rejects(() => invoke(envCommand.subCommands!.retention, ['live', '1O']), /Retention must be/)
    restore()
    assert.isFalse(patched)
  })
})
