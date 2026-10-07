import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyExit, answers, invoke } from '@tests/helpers.js'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { runCommand } from '@/commands/secrets.js'
import { setConfig, setLocalConfig } from '@/lib/config.js'
import { encryptVault, encryptProjectKeyForUser, encryptSecret } from '@/lib/crypto.js'

test.group('Run Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('fetch and inject secrets when local .env missing', async ({ assert }) => {
    const projectId = 'proj_run_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })
    const envPath = path.resolve(process.cwd(), '.env')
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath)

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const vaultPassword = 'secure_password';
    const vault = encryptVault(privateKey, vaultPassword);
    
    setConfig('encryptedPrivateKey', vault.encryptedPrivateKey);
    setConfig('keySalt', vault.salt);
    setConfig('keyEncryptionAlgo', vault.algo);

    const projectKey = crypto.randomBytes(32).toString('hex');
    const encryptedProjectKey = encryptProjectKeyForUser(projectKey, publicKey);
    
    const secretContent = 'INJECTED_VAR=secret_value';
    const encryptedSecret = encryptSecret(secretContent, projectKey);

    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith(`/api/projects/${projectId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ disallowPull: false })
        }
      }
      if (url.endsWith(`/api/projects/${projectId}/environments/development/key`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ encryptedKey: encryptedProjectKey })
        }
      }
      if (url.includes('/api/secrets/latest') && url.includes('mode=memory')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 5,
            ciphertext: encryptedSecret.ciphertext,
            iv: encryptedSecret.iv,
            tag: encryptedSecret.authTag
          })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    answers([vaultPassword])

    const exitSpy = spyExit()

    try {
        await invoke(runCommand, ['-e', 'development', '--', 'echo', 'hello'])
        assert.equal(await exitSpy.exited, 0)
    } finally {
        exitSpy.restore()
        restoreFetch()
    }

    assert.equal(process.env.INJECTED_VAR, 'secret_value')
  })
})
