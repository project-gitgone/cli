import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { rollbackCommand } from '../../src/commands/rollback.js'
import { setConfig, setLocalConfig } from '../../src/lib/config.js'
import { encryptVault, encryptProjectKeyForUser, encryptSecret } from '../../src/lib/crypto.js'

test.group('Rollback Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('rollback to previous version successfully', async ({ assert }) => {
    const projectId = 'proj_rollback_1'
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
    
    const oldSecretContent = 'API_KEY=old_value';
    const encryptedOldSecret = encryptSecret(oldSecretContent, projectKey);

    let rolledBackData: any = null;
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.includes('/api/secrets/history')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: 'snap_2', version: 2, createdAt: new Date().toISOString() },
            { id: 'snap_1', version: 1, createdAt: new Date().toISOString() } 
          ])
        }
      }
      if (url.endsWith(`/api/keys/${projectId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ encryptedKey: encryptedProjectKey })
        }
      }
      if (url.endsWith('/api/secrets/version/snap_1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'snap_1',
            version: 1,
            ciphertext: encryptedOldSecret.ciphertext,
            iv: encryptedOldSecret.iv,
            tag: encryptedOldSecret.authTag
          })
        }
      }
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        rolledBackData = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'snap_3', version: 3 })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject(['snap_1', vaultPassword])

    await rollbackCommand.parseAsync([], { from: 'user' })

    const envPath = path.resolve(process.cwd(), '.env');
    assert.isTrue(fs.existsSync(envPath), '.env should be created/updated');
    assert.equal(fs.readFileSync(envPath, 'utf-8'), oldSecretContent);

    assert.isNotNull(rolledBackData);
    assert.equal(rolledBackData.encryptedData.ciphertext, encryptedOldSecret.ciphertext);

    restoreFetch()
  })
})
