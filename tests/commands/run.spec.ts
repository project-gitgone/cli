import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyExit } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { runCommand } from '../../src/commands/run.js'
import { setConfig, setLocalConfig } from '../../src/lib/config.js'
import { encryptVault, encryptProjectKeyForUser, encryptSecret } from '../../src/lib/crypto.js'

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
      if (url.endsWith(`/api/keys/${projectId}`)) {
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

    prompts.inject([vaultPassword])

    const restoreExit = spyExit()

    try {
        await runCommand.parseAsync(['echo', 'hello'], { from: 'user' })
    } catch (e: any) {
        if (!e.message.includes('Process exit')) {
            throw e;
        }
    }

    assert.equal(process.env.INJECTED_VAR, 'secret_value')

    restoreExit()
    restoreFetch()
  })
})
