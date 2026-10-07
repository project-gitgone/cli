import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, answers, invoke } from '@tests/helpers.js'
import fs from 'fs'
import crypto from 'node:crypto'
import { pushCommand } from '@/commands/secrets.js'
import { setConfig, setLocalConfig } from '@/lib/config.js'
import { decryptSnapshot, encryptVault, encryptProjectKeyForUser } from '@/lib/crypto.js'

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
      if (url.endsWith(`/api/projects/${projectId}/environments/live/key`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            encryptedKey: encryptedProjectKey
          })
        }
      }
      if (url.endsWith(`/api/projects/${projectId}/environments`)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'env_1', name: 'live', protected: true, retention: null, snapshotCount: 0, lastPushAt: null }]
        }
      }
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        pushedData = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'snap_1', version: pushedData.version })
        }
      }
      if (url.includes('/api/secrets/latest')) {
        return { ok: false, status: 404, json: async () => ({ message: 'No secrets' }) }
      }
      if (url.includes('/api/secrets/history')) {
        return { ok: false, status: 404, json: async () => ({ message: 'No history' }) }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    answers(['live', vaultPassword, true]);

    const result = await invoke(pushCommand);
    assert.deepEqual(result, { pushed: true, environment: 'live', version: 1, changes: { added: ['DB_URL'], changed: [], removed: [] } });

    assert.isNotNull(pushedData, 'API should receive pushed data');
    assert.equal(pushedData.projectId, projectId);
    assert.equal(pushedData.environment, 'live');
    assert.exists(pushedData.encryptedData.ciphertext);
    assert.exists(pushedData.encryptedData.iv);
    assert.exists(pushedData.encryptedData.authTag);
    assert.equal(pushedData.cryptoVersion, 2);
    assert.equal(pushedData.version, 1);
    assert.equal(pushedData.keyVersion, 1);

    const pushed = decryptSnapshot(
      { ...pushedData.encryptedData, tag: pushedData.encryptedData.authTag, version: 1, cryptoVersion: 2 },
      projectKey,
      { projectId, environment: 'live' }
    );
    assert.equal(pushed, 'DB_URL=postgres://localhost:5432/db');

    restoreFetch();
  })
})
