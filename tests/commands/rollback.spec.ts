import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, answers, invoke } from '@tests/helpers.js'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { rollbackCommand } from '@/commands/secrets.js'
import { setConfig, setLocalConfig } from '@/lib/config.js'
import { decryptSnapshot, encryptVault, encryptProjectKeyForUser, encryptSecret } from '@/lib/crypto.js'

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
      if (url.endsWith(`/api/projects/${projectId}/environments/development/key`)) {
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
          json: async () => ({ id: 'snap_3', version: rolledBackData.version })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    answers(['snap_1', true, vaultPassword])

    await invoke(rollbackCommand, ['-e', 'development'])

    const envPath = path.resolve(process.cwd(), '.env');
    assert.isTrue(fs.existsSync(envPath), '.env should be created/updated');
    assert.equal(fs.readFileSync(envPath, 'utf-8'), oldSecretContent);

    assert.isNotNull(rolledBackData);
    assert.equal(rolledBackData.version, 3);
    assert.equal(rolledBackData.cryptoVersion, 2);
    assert.equal(rolledBackData.rollbackOf, 'snap_1');
    const restored = decryptSnapshot(
      { ...rolledBackData.encryptedData, tag: rolledBackData.encryptedData.authTag, version: 3, cryptoVersion: 2 },
      projectKey,
      { projectId, environment: 'development' }
    );
    assert.equal(restored, oldSecretContent);

    restoreFetch()
  })
})
