import { test } from '@japa/runner'
import fs from 'fs'
import path from 'path'
import { setupEnvironment, mockFetch, spyConsole, invoke } from '@tests/helpers.js'
import { auditCommand } from '@/commands/audit.js'

const PAGE = { meta: { total: 1 }, data: [{ createdAt: '2026-10-06T10:00:00.000Z', actorLabel: 'a@example.com', action: 'secrets.pull', environment: 'production', projectId: 'prj_1' }] }

test.group('Audit Command', (group) => {
  let tmpDir = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    tmpDir = env.tmpDir
    fs.writeFileSync(path.join(tmpDir, '.gitgone'), JSON.stringify({ projectId: 'prj_1' }))
    return () => env.cleanup()
  })

  test('reads the audit of the linked project with filters', async ({ assert }) => {
    let calledUrl = ''
    const restore = mockFetch(async (url) => {
      calledUrl = url
      return { ok: true, status: 200, json: async () => PAGE }
    })
    const spy = spyConsole()
    await invoke(auditCommand, ['--action', 'secrets.pull', '--limit', '10'])
    spy.restore()
    restore()
    assert.include(calledUrl, '/api/audit?projectId=prj_1&action=secrets.pull&limit=10')
    assert.isTrue(spy.logs.some((line) => line.includes('a@example.com')))
  })

  test('--all reads the instance audit', async ({ assert }) => {
    let calledUrl = ''
    const restore = mockFetch(async (url) => {
      calledUrl = url
      return { ok: true, status: 200, json: async () => PAGE }
    })
    await invoke(auditCommand, ['--all'])
    restore()
    assert.include(calledUrl, '/api/audit?')
    assert.notInclude(calledUrl, 'projectId')
  })
})
