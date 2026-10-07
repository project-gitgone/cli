import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole, answers } from '@tests/helpers.js'
import { loginAction } from '@/flows/login.js'
import { getConfig, setConfig } from '@/lib/config.js'

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const PASSWORD = 'a strong admin password'

test.group('Login', (group) => {
  let cleanup: () => void
  group.each.setup(() => {
    cleanup = setupEnvironment().cleanup
    setConfig('serverUrl', 'http://localhost:3333')
    return () => cleanup()
  })

  test('creates the first administrator on a self-hosted server that is not initialized', async ({ assert }) => {
    let created: any = null
    const restore = mockFetch(async (url, options) => {
      if (url.endsWith('/api/capabilities')) return json(200, { features: ['rbac'] })
      if (url.endsWith('/healthcheck')) return json(200, { status: 'ok', initialized: false })
      if (url.endsWith('/api/setup/init-admin')) {
        created = JSON.parse(options.body)
        return json(201, {
          token: { token: 'admin-token' },
          user: { email: created.email, full_name: created.fullName, cryptoVersion: 2 },
        })
      }
      return json(404, { message: 'not found' })
    })
    const consoleSpy = spyConsole()
    answers(['admin@example.com', 'Ada Admin', PASSWORD, PASSWORD])
    try {
      await loginAction()
    } finally {
      consoleSpy.restore()
      restore()
    }

    assert.equal(created.email, 'admin@example.com')
    assert.equal(created.fullName, 'Ada Admin')
    assert.isString(created.publicKey)
    assert.equal(getConfig().authToken, 'admin-token')
  })

  test('signs in with a password once the server is initialized', async ({ assert }) => {
    const calls: string[] = []
    const restore = mockFetch(async (url) => {
      calls.push(new URL(url).pathname)
      if (url.endsWith('/api/capabilities')) return json(200, { features: ['rbac'] })
      if (url.endsWith('/healthcheck')) return json(200, { status: 'ok', initialized: true })
      if (url.endsWith('/api/auth/prelogin')) return json(404, { message: 'not found' })
      if (url.endsWith('/api/auth/login')) {
        return json(200, { token: { token: 'user-token' }, user: { email: 'user@example.com', full_name: 'User' } })
      }
      return json(404, { message: 'not found' })
    })
    const consoleSpy = spyConsole()
    answers(['user@example.com', 'password123'])
    try {
      await loginAction()
    } finally {
      consoleSpy.restore()
      restore()
    }

    assert.notInclude(calls, '/api/setup/init-admin')
    assert.include(calls, '/api/auth/login')
    assert.equal(getConfig().authToken, 'user-token')
  })
})
