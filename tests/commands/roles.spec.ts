import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole, answers, invoke } from '@tests/helpers.js'
import { roleCommand } from '@/commands/role.js'

const ROLES = [
  { id: 'role_developer', key: 'developer', name: 'Developer', scope: 'workspace', isSystem: true, grants: [{ permission: 'env.write', environments: { type: 'unprotected' } }] },
  { id: 'role_custom', key: null, name: 'QA writer', scope: 'workspace', isSystem: false, grants: [] },
]
const CATALOGUE = {
  permissions: [
    { key: 'env.read', level: 'env' },
    { key: 'env.write', level: 'env' },
    { key: 'project.manage', level: 'project' },
  ],
  levelsByScope: { instance: ['instance', 'team', 'project'], workspace: ['team', 'project', 'env'] },
}

test.group('Roles Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('show describes environment filters', async ({ assert }) => {
    const restore = mockFetch(async (url) => {
      if (url.endsWith('/api/roles')) return { ok: true, status: 200, json: async () => ROLES }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    const spy = spyConsole()
    await invoke(roleCommand.subCommands!.show, ['developer'])
    spy.restore()
    restore()
    assert.isTrue(spy.logs.some((line) => line.includes('env.write') && line.includes('unprotected environments')))
  })

  test('create sends the chosen grants', async ({ assert }) => {
    let sent: any = null
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/permissions')) return { ok: true, status: 200, json: async () => CATALOGUE }
      if (url.endsWith('/api/roles') && init?.method === 'POST') {
        sent = JSON.parse(init.body)
        return { ok: true, status: 201, json: async () => ({ ...sent, id: 'role_new' }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    answers(['QA writer', '', 'workspace', ['env.read', 'env.write'], 'all', 'list', 'qa, staging'])
    await invoke(roleCommand.subCommands!.create)
    restore()
    assert.deepEqual(sent, {
      name: 'QA writer',
      scope: 'workspace',
      grants: [
        { permission: 'env.read', environments: { type: 'all' } },
        { permission: 'env.write', environments: { type: 'list', names: ['qa', 'staging'] } },
      ],
    })
  })

  test('delete refuses default roles without calling the API', async ({ assert }) => {
    let deleted = false
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/roles') && !init?.method) return { ok: true, status: 200, json: async () => ROLES }
      if (init?.method === 'DELETE') deleted = true
      return { ok: true, status: 200, json: async () => ROLES }
    })
    await assert.rejects(() => invoke(roleCommand.subCommands!.delete, ['developer']), 'Default roles cannot be deleted.')
    restore()
    assert.isFalse(deleted)
  })
})
