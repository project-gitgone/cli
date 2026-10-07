import crypto from 'node:crypto'
import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, answers, invoke } from '@tests/helpers.js'
import { projectCommand } from '@/commands/project.js'
import { setConfig } from '@/lib/config.js'
import { setLocalConfig } from '@/lib/config.js'

test.group('Project Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('create project successfully', async ({ assert }) => {
    let createdProjectData: any = null;

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            teams: [{ id: 'team_1', name: 'Test Team' }]
          })
        }
      }
      if (url.endsWith('/api/keys/new_proj_1/setup')) return { ok: true, status: 200, json: async () => ({}) }
      if (url.includes('/api/teams/team_1/projects') && init?.method === 'POST') {
        createdProjectData = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'new_proj_1', name: 'New Project' })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    setConfig('publicKey', crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey)

    await invoke(projectCommand.subCommands!.create, ['MyProject'])

    assert.isNotNull(createdProjectData)
    assert.equal(createdProjectData.name, 'MyProject')

    restoreFetch()
  })

  test('set project policy', async ({ assert }) => {
    const projectId = 'proj_policy_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })

    let patchData: any = null;

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith(`/api/projects/${projectId}`) && init?.method === 'PATCH') {
        patchData = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({})
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    answers(['memory-only'])

    await invoke(projectCommand.subCommands!.policy)

    assert.isNotNull(patchData)
    assert.equal(patchData.disallowPull, true)

    restoreFetch()
  })
})
