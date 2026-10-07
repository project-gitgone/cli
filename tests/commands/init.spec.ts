import { test } from '@japa/runner'
import crypto from 'node:crypto'
import { initCommand } from '@/commands/project.js'
import { getLocalConfig, setConfig } from '@/lib/config.js'
import { answers, invoke, mockFetch, setupEnvironment } from '@tests/helpers.js'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const PROJECTS = [
  { id: 'proj_1', name: 'Project 1', team: { name: 'Team A' } },
  { id: 'proj_2', name: 'Project 2', team: { name: 'Team B' } },
]

test.group('Init Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    setConfig('authToken', 'test-token')
    return () => env.cleanup()
  })

  test('creates a project when there is none, then picks a new environment', async ({ assert }) => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    setConfig('publicKey', publicKey)
    let created: any = null
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/me')) return json(200, { teams: [{ id: 'team_1', name: 'Test Team' }], user: { publicKey } })
      if (url.endsWith('/api/projects') && !init?.method) return json(200, [])
      if (url.endsWith('/api/teams/team_1/projects') && init?.method === 'POST') {
        created = JSON.parse(init.body)
        return json(201, { id: 'proj_1', name: created.name })
      }
      if (url.endsWith('/api/keys/proj_1/setup')) return json(200, {})
      if (url.endsWith('/api/projects/proj_1/environments')) return json(200, [])
      return json(404, {})
    })
    answers(['test-project', '__new__', 'development'])
    try {
      const result = await invoke(initCommand)
      assert.deepEqual(result, { projectId: 'proj_1', projectName: 'test-project', environment: 'development' })
    } finally {
      restore()
    }
    assert.deepEqual(created, { name: 'test-project' })
    assert.include(getLocalConfig() ?? {}, { projectId: 'proj_1', projectName: 'test-project', environment: 'development' })
  })

  test('links an existing project and its environment', async ({ assert }) => {
    const restore = mockFetch(async (url) => {
      if (url.endsWith('/api/projects')) return json(200, PROJECTS)
      if (url.endsWith('/api/projects/proj_2/environments')) return json(200, [{ id: 'env_1', name: 'production', protected: true }])
      return json(404, {})
    })
    answers(['proj_2', 'production'])
    try {
      await invoke(initCommand)
    } finally {
      restore()
    }
    assert.include(getLocalConfig() ?? {}, { projectId: 'proj_2', projectName: 'Project 2', environment: 'production' })
  })

  test('links without questions from options, in CI', async ({ assert }) => {
    const restore = mockFetch(async (url) => (url.endsWith('/api/projects') ? json(200, PROJECTS) : json(404, {})))
    try {
      await invoke(initCommand, ['--project', 'Project 1', '-e', 'staging', '--json'])
    } finally {
      restore()
    }
    assert.include(getLocalConfig() ?? {}, { projectId: 'proj_1', environment: 'staging' })
  })

  test('an unknown project is refused', async ({ assert }) => {
    const restore = mockFetch(async (url) => (url.endsWith('/api/projects') ? json(200, PROJECTS) : json(404, {})))
    try {
      await assert.rejects(() => invoke(initCommand, ['--project', 'nope', '--json']), 'Unknown project "nope".')
    } finally {
      restore()
    }
  })
})
