import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import { projectCommand } from '../../src/commands/project.js'
import { setLocalConfig } from '../../src/lib/config.js'

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

    prompts.inject(['team_1'])

    await projectCommand.parseAsync(['create', 'MyProject'], { from: 'user' })

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

    prompts.inject([true])

    await projectCommand.parseAsync(['set-policy'], { from: 'user' })

    assert.isNotNull(patchData)
    assert.equal(patchData.disallowPull, true)

    restoreFetch()
  })
})
