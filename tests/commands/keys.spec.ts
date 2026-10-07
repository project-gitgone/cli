import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, answers, invoke } from '@tests/helpers.js'
import crypto from 'node:crypto'
import { keyCommand } from '@/commands/key.js'
import { getConfig, setConfig, setLocalConfig } from '@/lib/config.js'
import { encryptVault, encryptProjectKeyForUser, decryptProjectKey, publicKeyFingerprint } from '@/lib/crypto.js'

test.group('Keys Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('share keys with pending members', async ({ assert }) => {
    const projectId = 'proj_keys_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })

    const myKeys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const vaultPassword = 'secure_password';
    const vault = encryptVault(myKeys.privateKey, vaultPassword);
    
    setConfig('encryptedPrivateKey', vault.encryptedPrivateKey);
    setConfig('keySalt', vault.salt);
    setConfig('keyEncryptionAlgo', vault.algo);

    const rawProjectKey = crypto.randomBytes(32).toString('hex');
    const encryptedProjectKey = encryptProjectKeyForUser(rawProjectKey, myKeys.publicKey);

    const pendingUserKeys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    let sharedPayload: any = null;
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith(`/api/keys/${projectId}/pending`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: 'user_pending_1', fullName: 'Pending User', email: 'pending@test.com', publicKey: pendingUserKeys.publicKey }
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
      if (url.endsWith(`/api/keys/${projectId}/share`) && init?.method === 'POST') {
        sharedPayload = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    answers([true, vaultPassword, true])

    await invoke(keyCommand.subCommands!.share)

    assert.isNotNull(sharedPayload)
    assert.equal(sharedPayload.targetUserId, 'user_pending_1')
    
    const decryptedSharedKey = decryptProjectKey(sharedPayload.encryptedKey, pendingUserKeys.privateKey);
    assert.equal(decryptedSharedKey, rawProjectKey, 'Shared key should match original project key');
    assert.equal(
      getConfig().knownKeys?.user_pending_1?.fingerprint,
      publicKeyFingerprint(pendingUserKeys.publicKey),
      'the trusted key should be pinned'
    );

    restoreFetch()
  })
})
