import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import crypto from 'node:crypto'
import { pushCommand } from '../../src/commands/push.js'
import { setConfig, setLocalConfig } from '../../src/lib/config.js'
import { encryptVault, encryptProjectKeyForUser } from '../../src/lib/crypto.js'

test.group('Push Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('push secrets successfully', async ({ assert }) => {
    const projectId = 'proj_test_123'
    setLocalConfig({ projectId, serverUrl: 'http://test' })
    fs.writeFileSync('.env', 'DB_URL=postgres://localhost:5432/db')

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

    let pushedData: any = null;
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith(`/api/keys/${projectId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            encryptedKey: encryptedProjectKey
          })
        }
      }
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        pushedData = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'snap_1', version: 1 })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject([vaultPassword, 'production']);

    await pushCommand.parseAsync([], { from: 'user' });

    assert.isNotNull(pushedData, 'API should receive pushed data');
    assert.equal(pushedData.projectId, projectId);
    assert.equal(pushedData.environment, 'production');
    assert.exists(pushedData.encryptedData.ciphertext);
    assert.exists(pushedData.encryptedData.iv);
    assert.exists(pushedData.encryptedData.authTag);

    restoreFetch();
  })
})
