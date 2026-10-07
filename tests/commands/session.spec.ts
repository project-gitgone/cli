import { test } from '@japa/runner'
import { logoutCommand, statusCommand, whoamiCommand } from '@/commands/session.js'
import { getConfig, setConfig, setLocalConfig } from '@/lib/config.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { invoke, mockFetch, setupEnvironment } from '@tests/helpers.js'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test.group('Session commands', (group) => {
  let output = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    output = ''
    setOutput((text) => (output += text))
    return () => {
      resetOutput()
      env.cleanup()
    }
  })

  test('logout forgets the session and keys but keeps the server and trusted keys', async ({ assert }) => {
    setConfig('serverUrl', 'https://gitgone.example.com')
    setConfig('authToken', 'oat_1')
    setConfig('encryptedPrivateKey', 'vault')
    setConfig('knownKeys', { usr_1: { email: 'a@example.com', fingerprint: 'ab' } })
    assert.deepEqual(await invoke(logoutCommand), { loggedOut: true })
    const config = getConfig()
    assert.isUndefined(config.authToken)
    assert.isUndefined(config.encryptedPrivateKey)
    assert.equal(config.serverUrl, 'https://gitgone.example.com')
    assert.exists(config.knownKeys?.usr_1)
  })

  test('whoami needs a session', async ({ assert }) => {
    await assert.rejects(() => invoke(whoamiCommand), 'You are not logged in.')
  })

  test('whoami shows the account', async ({ assert }) => {
    setConfig('authToken', 'oat_1')
    const restore = mockFetch(async (url) =>
      url.endsWith('/api/auth/me')
        ? json(200, { user: { id: 'u', email: 'ada@example.com', fullName: 'Ada' }, instanceRole: { name: 'Owner' }, permissions: [], teams: [] })
        : json(404, {}),
    )
    try {
      const result = await invoke(whoamiCommand)
      assert.deepInclude(result as object, { email: 'ada@example.com', fullName: 'Ada', role: 'Owner' })
      assert.include(output, 'Ada <ada@example.com>')
    } finally {
      restore()
    }
  })

  test('status points to the next step', async ({ assert }) => {
    setLocalConfig({ projectId: 'prj_1', projectName: 'shop' })
    const restore = mockFetch(async (url) => (url.endsWith('/healthcheck') ? json(200, { initialized: true }) : json(404, {})))
    try {
      const result = await invoke(statusCommand)
      assert.deepInclude(result as object, { reachable: true, loggedIn: false, project: { id: 'prj_1', name: 'shop' } })
      assert.include(output, 'gitgone login')
    } finally {
      restore()
    }
  })

  test('status reports an unreachable server', async ({ assert }) => {
    const restore = mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    try {
      const result = await invoke(statusCommand, ['--json'])
      assert.isFalse((result as { reachable: boolean }).reachable)
      assert.isFalse(JSON.parse(output).reachable)
    } finally {
      restore()
    }
  })
})
