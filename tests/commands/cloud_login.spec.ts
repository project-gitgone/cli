import { test } from '@japa/runner'
import http from 'node:http'
import crypto from 'node:crypto'
import prompts from 'prompts'
import { setupEnvironment, mockFetch, spyConsole } from '../helpers.js'
import { cloudLoginAction, loginAction } from '../../src/flows/login.js'
import { getConfig } from '../../src/lib/config.js'
import { unlockPrivateKey } from '../../src/services/session.js'

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const PHRASE = 'a long unlock phrase'

const browserReturning = (params: (state: string) => Record<string, string>) => (url: string) => {
  const login = new URL(url)
  const port = login.searchParams.get('port')!
  const query = new URLSearchParams(params(login.searchParams.get('state')!))
  http.get(`http://127.0.0.1:${port}/callback?${query}`, (response) => response.resume())
}

test.group('Cloud login', (group) => {
  let cleanup: () => void
  group.each.setup(() => {
    cleanup = setupEnvironment().cleanup
    return () => cleanup()
  })

  test('signs in through the browser and creates the unlock phrase vault', async ({ assert }) => {
    let challenge = ''
    let uploaded: any = null
    const restore = mockFetch(async (url, options) => {
      if (url.endsWith('/api/auth/cloud/exchange')) {
        const body = JSON.parse(options.body)
        assert.equal(body.code, 'one-time-code')
        assert.equal(crypto.createHash('sha256').update(body.codeVerifier).digest('base64url'), challenge)
        return json(200, {
          token: { token: 'session-token' },
          user: { email: 'sso@example.com', full_name: 'SSO User', encryptedPrivateKey: null, cryptoVersion: 2 },
        })
      }
      if (url.endsWith('/api/keys/upload-public-key')) {
        uploaded = JSON.parse(options.body)
        return json(200, { message: 'ok' })
      }
      return json(404, { message: 'not found' })
    })
    const consoleSpy = spyConsole()
    prompts.inject([PHRASE, PHRASE])
    try {
      await cloudLoginAction((url) => {
        challenge = new URL(url).searchParams.get('code_challenge')!
        browserReturning((state) => ({ code: 'one-time-code', state }))(url)
      })
    } finally {
      consoleSpy.restore()
      restore()
    }

    const config = getConfig()
    assert.equal(config.authToken, 'session-token')
    assert.equal(config.cryptoVersion, 2)
    assert.deepEqual(config.kdfParams, uploaded.kdf)
    assert.equal(config.publicKey, uploaded.publicKey)
    assert.match(unlockPrivateKey(PHRASE), /BEGIN PRIVATE KEY/)
  })

  test('a denied login saves no session', async ({ assert }) => {
    const restore = mockFetch(async () => json(500, { message: 'should not be called' }))
    const consoleSpy = spyConsole()
    try {
      await cloudLoginAction(browserReturning((state) => ({ error: 'access_denied', state })))
    } finally {
      consoleSpy.restore()
      restore()
    }
    assert.isUndefined(getConfig().authToken)
    assert.isTrue(consoleSpy.logs.some((line) => line.includes('Login failed')))
  })

  test('a self-hosted server keeps the password login', async ({ assert }) => {
    const calls: string[] = []
    const restore = mockFetch(async (url) => {
      calls.push(new URL(url).pathname)
      if (url.endsWith('/api/capabilities')) return json(200, { features: ['rbac'] })
      return json(401, { message: 'Invalid credentials' })
    })
    const consoleSpy = spyConsole()
    prompts.inject(['someone@example.com', 'password123'])
    try {
      await loginAction()
    } finally {
      consoleSpy.restore()
      restore()
    }
    assert.includeMembers(calls, ['/api/capabilities', '/api/auth/prelogin'])
    assert.notInclude(calls, '/api/auth/cloud/exchange')
  })
})
