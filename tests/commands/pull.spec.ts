import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { pullCommand } from '../../src/commands/pull.js'
import { setConfig, setLocalConfig } from '../../src/lib/config.js'
import { encryptVault, encryptProjectKeyForUser, encryptSecret } from '../../src/lib/crypto.js'

test.group('Pull Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('pull secrets successfully into empty dir', async ({ assert }) => {
    const projectId = 'proj_pull_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })

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
    
    const secretContent = 'API_KEY=12345\nDEBUG=true';
    const encryptedSecret = encryptSecret(secretContent, projectKey);

    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith(`/api/keys/${projectId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ encryptedKey: encryptedProjectKey })
        }
      }
      if (url.includes('/api/secrets/latest')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 2,
            ciphertext: encryptedSecret.ciphertext,
            iv: encryptedSecret.iv,
            tag: encryptedSecret.authTag
          })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject([vaultPassword])

    await pullCommand.parseAsync([], { from: 'user' })

    const envPath = path.resolve(process.cwd(), '.env');
    assert.isTrue(fs.existsSync(envPath), '.env should be created');
    assert.equal(fs.readFileSync(envPath, 'utf-8'), secretContent);

    restoreFetch()
  })
})
