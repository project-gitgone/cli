import { test } from '@japa/runner'
import fs from 'fs'
import path from 'path'
import { setupEnvironment, mockFetch, spyConsole, invoke } from '@tests/helpers.js'
import { accessCommand } from '@/commands/access.js'

const ROLES = [{ id: 'role_viewer', key: 'viewer', name: 'Viewer', scope: 'workspace', isSystem: true, grants: [] }]

const linkProject = (dir: string) =>
  fs.writeFileSync(path.join(dir, '.gitgone'), JSON.stringify({ projectId: 'prj_1' }))

test.group('Access Command', (group) => {
  let tmpDir = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    tmpDir = env.tmpDir
    return () => env.cleanup()
  })

  test('grant gives a project role by role name', async ({ assert }) => {
    linkProject(tmpDir)
    let sent: any = null
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/roles')) return { ok: true, status: 200, json: async () => ROLES }
      if (url.endsWith('/api/projects/prj_1/members') && init?.method === 'PUT') {
        sent = JSON.parse(init.body)
        return { ok: true, status: 200, json: async () => ({ member: {}, projectsToRotate: [] }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    await invoke(accessCommand.subCommands!.grant, ['guest@example.com', 'viewer'])
    restore()
    assert.deepEqual(sent, { email: 'guest@example.com', roleId: 'role_viewer' })
  })

  test('list shows where each access comes from', async ({ assert }) => {
    linkProject(tmpDir)
    const restore = mockFetch(async (url) => {
      if (url.endsWith('/api/projects/prj_1/members')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { source: 'team', role: 'Maintainer', user: { email: 'a@example.com', fullName: 'A' } },
            { source: 'project', role: 'Viewer', user: { email: 'b@example.com', fullName: 'B' } },
          ],
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    const spy = spyConsole()
    const members = (await invoke(accessCommand.subCommands!.list)) as { source: string; user: { email: string } }[]
    spy.restore()
    restore()
    assert.isTrue(members.some((member) => member.source === 'team' && member.user.email === 'a@example.com'))
    assert.isTrue(spy.logs.some((line) => line.includes('a@example.com') && line.includes('team')))
  })

  test('revoke removes the project role of the user', async ({ assert }) => {
    linkProject(tmpDir)
    let deletedUrl = ''
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/projects/prj_1/members') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { source: 'team', userId: 'usr_a', role: 'Maintainer', user: { email: 'a@example.com' } },
            { source: 'project', userId: 'usr_b', role: 'Viewer', user: { email: 'b@example.com' } },
          ],
        }
      }
      if (init?.method === 'DELETE') {
        deletedUrl = url
        return { ok: true, status: 200, json: async () => ({ projectsToRotate: [] }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    await invoke(accessCommand.subCommands!.revoke, ['b@example.com'])
    restore()
    assert.isTrue(deletedUrl.endsWith('/api/projects/prj_1/members/usr_b'))
  })
})
