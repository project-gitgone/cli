import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, answers, invoke } from '@tests/helpers.js'
import { teamCommand } from '@/commands/team.js'

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

    await invoke(teamCommand.subCommands!.create, ['My Team'])

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
      if (url.endsWith('/api/roles')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'role_developer', key: 'developer', name: 'Developer', scope: 'workspace', isSystem: true, grants: [] }]
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

    answers(['new@member.com', 'role_developer'])

    await invoke(teamCommand.subCommands!.add)

    assert.isNotNull(addedMember)
    assert.equal(addedMember.email, 'new@member.com')
    assert.equal(addedMember.roleId, 'role_developer')

    restoreFetch()
  })
})
