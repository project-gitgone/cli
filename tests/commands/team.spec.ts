import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import { teamCommand } from '../../src/commands/team.js'

test.group('Team Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('create team successfully', async ({ assert }) => {
    let createdTeam: any = null;

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/teams') && init?.method === 'POST') {
        createdTeam = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'new_team_1', name: 'My Team' })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    await teamCommand.parseAsync(['create', 'My Team'], { from: 'user' })

    assert.isNotNull(createdTeam)
    assert.equal(createdTeam.name, 'My Team')

    restoreFetch()
  })

  test('add member to team', async ({ assert }) => {
    let addedMember: any = null;

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            teams: [{ id: 'team_1', name: 'My Team' }]
          })
        }
      }
      if (url.endsWith('/api/teams/team_1/members') && init?.method === 'POST') {
        addedMember = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject(['team_1', 'new@member.com', 'MEMBER'])

    await teamCommand.parseAsync(['add-member'], { from: 'user' })

    assert.isNotNull(addedMember)
    assert.equal(addedMember.email, 'new@member.com')
    assert.equal(addedMember.role, 'MEMBER')

    restoreFetch()
  })
})
