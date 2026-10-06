import { test } from '@japa/runner'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import prompts from 'prompts'
import { setupEnvironment, mockFetch } from '../helpers.js'
import { setConfig } from '../../src/lib/config.js'
import { createKdfParams, deriveAccountKeys, encryptProjectKeyForUser, encryptVaultV2, generateKeyPair } from '../../src/lib/crypto.js'
import { pushCommand } from '../../src/commands/secrets/push.js'
import { keysCommand } from '../../src/commands/project/keys.js'
import { envCommand } from '../../src/commands/project/env.js'

const password = 'vault-password'

function login(tmpDir: string) {
  const { publicKey, privateKey } = generateKeyPair()
  const kdf = createKdfParams()
  const { vaultKey } = deriveAccountKeys(password, kdf)
  setConfig('cryptoVersion', 2)
  setConfig('kdfParams', kdf)
  setConfig('encryptedPrivateKey', encryptVaultV2(privateKey, vaultKey))
  setConfig('publicKey', publicKey)
  setConfig('userEmail', 'me@example.com')
  fs.writeFileSync(path.join(tmpDir, '.gitgone'), JSON.stringify({ projectId: 'prj_1' }))
  fs.writeFileSync(path.join(tmpDir, '.env'), 'A=1')
  return { publicKey }
}

const base = '/api/projects/prj_1/environments'

test.group('Environment keyring', (group) => {
  let tmpDir = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    tmpDir = env.tmpDir
    return () => env.cleanup()
  })

  test('the first push to a new environment gives it its own key', async ({ assert }) => {
    const { publicKey } = login(tmpDir)
    const calls: { url: string; body?: any }[] = []
    const restore = mockFetch(async (url, init: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined })
      if (url.endsWith(`${base}`)) return { ok: true, status: 200, json: async () => [] }
      if (url.endsWith(`${base}/qa/key/recipients`)) {
        return { ok: true, status: 200, json: async () => [{ id: 'usr_me', email: 'me@example.com', publicKey }] }
      }
      if (url.endsWith(`${base}/qa/key/rotate`)) return { ok: true, status: 200, json: async () => ({ keyVersion: 1, revokedTokens: 0 }) }
      if (url.includes('/api/secrets/history')) return { ok: false, status: 404, json: async () => ({ message: 'none' }) }
      if (url.endsWith('/api/secrets')) return { ok: true, status: 201, json: async () => ({ id: 'snap_1', version: 1 }) }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    prompts.inject([password, '__new__', 'qa'])
    await pushCommand.parseAsync([], { from: 'user' })
    restore()

    const rotate = calls.find((c) => c.url.endsWith(`${base}/qa/key/rotate`))
    assert.exists(rotate)
    assert.include(rotate!.body, { expectedKeyVersion: 0 })
    assert.deepEqual(rotate!.body.snapshots, [])
    assert.deepEqual(rotate!.body.keys.map((k: any) => k.userId), ['usr_me'])
    const pushed = calls.find((c) => c.url.endsWith('/api/secrets'))
    assert.include(pushed!.body, { environment: 'qa', keyVersion: 1, keyScope: 'environment' })
  })

  test('keys share -e uses the environment keyring', async ({ assert }) => {
    const { publicKey } = login(tmpDir)
    const projectKey = crypto.randomBytes(32).toString('base64url')
    let sharedUrl = ''
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith(`${base}/production/key/pending`)) {
        return { ok: true, status: 200, json: async () => [{ id: 'usr_me', email: 'me@example.com', fullName: 'Me', publicKey }] }
      }
      if (url.endsWith(`${base}/production/key`)) {
        return { ok: true, status: 200, json: async () => ({ scope: 'environment', encryptedKey: encryptProjectKeyForUser(projectKey, publicKey), keyVersion: 2 }) }
      }
      if (init?.method === 'POST') {
        sharedUrl = url
        return { ok: true, status: 200, json: async () => ({}) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    prompts.inject([true, password, true])
    await keysCommand.parseAsync(['share', '-e', 'production'], { from: 'user' })
    restore()
    keysCommand.commands.find((c) => c.name() === 'share')!.setOptionValue('env', undefined)
    assert.isTrue(sharedUrl.endsWith(`${base}/production/key/share`))
  })

  test('env rotate rotates the environment keyring', async ({ assert }) => {
    const { publicKey } = login(tmpDir)
    const projectKey = crypto.randomBytes(32).toString('base64url')
    let rotated: any = null
    const restore = mockFetch(async (url, init: any) => {
      if (url.endsWith(`${base}/production/key`)) {
        return { ok: true, status: 200, json: async () => ({ scope: 'environment', encryptedKey: encryptProjectKeyForUser(projectKey, publicKey), keyVersion: 2 }) }
      }
      if (url.endsWith(`${base}/production/key/snapshots`)) return { ok: true, status: 200, json: async () => ({ keyVersion: 2, snapshots: [] }) }
      if (url.endsWith(`${base}/production/key/recipients`)) {
        return { ok: true, status: 200, json: async () => [{ id: 'usr_me', email: 'me@example.com', publicKey }] }
      }
      if (url.endsWith(`${base}/production/key/rotate`)) {
        rotated = JSON.parse(init.body)
        return { ok: true, status: 200, json: async () => ({ keyVersion: 3, revokedTokens: 0 }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    prompts.inject([password])
    await envCommand.parseAsync(['rotate', 'production'], { from: 'user' })
    restore()
    assert.include(rotated, { expectedKeyVersion: 2 })
  })

  test('a recipient using my email but another public key must be trusted explicitly', async ({ assert }) => {
    login(tmpDir)
    const impostor = generateKeyPair()
    let rotated = false
    const restore = mockFetch(async (url) => {
      if (url.endsWith(`${base}`)) return { ok: true, status: 200, json: async () => [] }
      if (url.endsWith(`${base}/qa/key/recipients`)) {
        return { ok: true, status: 200, json: async () => [{ id: 'usr_x', email: 'me@example.com', publicKey: impostor.publicKey }] }
      }
      if (url.endsWith(`${base}/qa/key/rotate`)) {
        rotated = true
        return { ok: true, status: 200, json: async () => ({ keyVersion: 1, revokedTokens: 0 }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })
    prompts.inject([password, '__new__', 'qa', false])
    await pushCommand.parseAsync([], { from: 'user' })
    restore()
    assert.isFalse(rotated)
  })
})
