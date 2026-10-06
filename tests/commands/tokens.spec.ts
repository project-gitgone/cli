import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole } from '../helpers.js'
import prompts from 'prompts'
import crypto from 'node:crypto'
import { tokensCommand } from '../../src/commands/project/tokens.js'
import { setConfig, setLocalConfig } from '../../src/lib/config.js'
import {
  deriveTokenKeys,
  encryptVault,
  encryptProjectKeyForUser,
} from '../../src/lib/crypto.js'

const VECTOR = {
  secret: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
  authVerifier: 'VX7x9LggC97ndIX-_dpxvleFUYMTBnzETdJt-rx7bdw',
  encryptionKey: '3acadc0318b1c0832045103da95813d37d7866dfe42c428b37965994b0cab319',
}

const decryptWrappedKey = (bundle: string, encryptionKey: Buffer) => {
  const [iv, authTag, ciphertext] = bundle.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'))
  decipher.setAAD(Buffer.from('gitgone/v2/token-project-key'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')
}

test.group('Tokens v2 crypto', () => {
  test('derives the shared test vector', ({ assert }) => {
    const keys = deriveTokenKeys(VECTOR.secret)
    assert.equal(keys.authVerifier, VECTOR.authVerifier)
    assert.equal(keys.encryptionKey.toString('hex'), VECTOR.encryptionKey)
  })
})

test.group('Tokens Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('create sends only a verifier and prints a v2 token', async ({ assert }) => {
    const projectId = 'proj_test_123'
    setLocalConfig({ projectId, serverUrl: 'http://test' })

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    const vaultPassword = 'secure_password'
    const vault = encryptVault(privateKey, vaultPassword)
    setConfig('encryptedPrivateKey', vault.encryptedPrivateKey)
    setConfig('keySalt', vault.salt)
    setConfig('keyEncryptionAlgo', vault.algo)

    const projectKey = crypto.randomBytes(16).toString('hex')

    let createBody: any = null
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith(`/api/projects/${projectId}/environments/production/key`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ encryptedKey: encryptProjectKeyForUser(projectKey, publicKey) }),
        }
      }
      if (url.endsWith(`/api/projects/${projectId}/tokens`) && init?.method === 'POST') {
        createBody = JSON.parse(init.body)
        return { ok: true, status: 201, json: async () => ({ id: 'ptok_abc123' }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    const consoleSpy = spyConsole()
    prompts.inject([vaultPassword])

    try {
      await tokensCommand.parseAsync(['create', 'CI', '-e', 'production'], { from: 'user' })
    } finally {
      consoleSpy.restore()
      restoreFetch()
    }

    const printed = consoleSpy.logs.join('\n').match(/v2\.ptok_abc123\.([A-Za-z0-9_-]+)/)
    assert.isNotNull(printed, 'a v2 token should be printed')
    const secret = printed![1]

    const keys = deriveTokenKeys(secret)
    assert.isNotNull(createBody)
    assert.equal(createBody.authVerifier, keys.authVerifier)
    assert.notProperty(createBody, 'tokenSecretHash')
    assert.notInclude(JSON.stringify(createBody), secret)
    assert.equal(decryptWrappedKey(createBody.encryptedProjectKey, keys.encryptionKey), projectKey)
  })
})
