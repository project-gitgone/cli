import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { pullCommand } from '../../src/commands/secrets/pull.js'
import { keysCommand } from '../../src/commands/project/keys.js'
import { projectCommand } from '../../src/commands/project/project.js'
import { getConfig, setConfig, setLocalConfig } from '../../src/lib/config.js'
import {
  decryptProjectKey,
  decryptSnapshot,
  encryptProjectKeyForUser,
  encryptSecret,
  encryptSnapshot,
  encryptVault,
  publicKeyFingerprint,
} from '../../src/lib/crypto.js'

const PASSWORD = 'secure_password'

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const generateKeys = () =>
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

const loginAs = (email: string, keys: { publicKey: string; privateKey: string }) => {
  const vault = encryptVault(keys.privateKey, PASSWORD)
  setConfig('userEmail', email)
  setConfig('publicKey', keys.publicKey)
  setConfig('encryptedPrivateKey', vault.encryptedPrivateKey)
  setConfig('keySalt', vault.salt)
}

const silently = async (fn: () => Promise<unknown>) => {
  const consoleSpy = spyConsole()
  try {
    await fn()
  } finally {
    consoleSpy.restore()
  }
  return consoleSpy.logs.join('\n')
}

test.group('Snapshots v2 crypto', () => {
  test('a snapshot only decrypts for its own project, environment and version', ({ assert }) => {
    const projectKey = 'project-key'
    const context = { projectId: 'proj_1', environment: 'production', version: 3 }
    const encrypted = encryptSnapshot('SECRET=1', projectKey, context)
    const snapshot = { ...encrypted, tag: encrypted.authTag, version: 3, cryptoVersion: 2 }

    assert.equal(
      decryptSnapshot(snapshot, projectKey, { projectId: 'proj_1', environment: 'production' }),
      'SECRET=1'
    )
    assert.throws(() =>
      decryptSnapshot(snapshot, projectKey, { projectId: 'proj_1', environment: 'staging' })
    )
    assert.throws(() =>
      decryptSnapshot(snapshot, projectKey, { projectId: 'proj_2', environment: 'production' })
    )
    assert.throws(() =>
      decryptSnapshot({ ...snapshot, version: 4 }, projectKey, {
        projectId: 'proj_1',
        environment: 'production',
      })
    )
  })
})

test.group('Anti-rollback', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('pull refuses a version older than one already seen', async ({ assert }) => {
    const projectId = 'proj_pull_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })
    const keys = generateKeys()
    loginAs('me@test.com', keys)
    setConfig('seenVersions', { [`${projectId}:production`]: 5 })

    const projectKey = 'project-key'
    const encrypted = encryptSnapshot('OLD=1', projectKey, {
      projectId,
      environment: 'production',
      version: 3,
    })

    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith(`/api/projects/${projectId}/environments/production/key`)) {
        return json(200, { encryptedKey: encryptProjectKeyForUser(projectKey, keys.publicKey) })
      }
      if (url.includes('/api/secrets/latest')) {
        return json(200, { ...encrypted, tag: encrypted.authTag, version: 3, cryptoVersion: 2 })
      }
      return json(404, {})
    })

    prompts.inject([PASSWORD])
    try {
      await silently(() => pullCommand.parseAsync(['-e', 'production'], { from: 'user' }))
    } finally {
      restoreFetch()
    }

    assert.isFalse(fs.existsSync(path.resolve(process.cwd(), '.env')))
    assert.equal(getConfig().seenVersions?.[`${projectId}:production`], 5)
  })

  test('pull creates a local .env when the environment does not exist yet', async ({ assert }) => {
    const projectId = 'proj_pull_2'
    setLocalConfig({ projectId, serverUrl: 'http://test' })
    const keys = generateKeys()
    loginAs('me@test.com', keys)

    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith(`/api/projects/${projectId}/environments/staging/key`)) {
        return json(200, { encryptedKey: encryptProjectKeyForUser('k', keys.publicKey) })
      }
      return json(404, { message: 'No secrets found for this environment' })
    })

    prompts.inject([PASSWORD])
    try {
      await silently(() => pullCommand.parseAsync(['-e', 'staging'], { from: 'user' }))
    } finally {
      restoreFetch()
    }

    assert.include(fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8'), 'staging')
  })
})

test.group('Key pinning', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('share refuses a member whose key changed since it was pinned', async ({ assert }) => {
    const projectId = 'proj_share_1'
    setLocalConfig({ projectId, serverUrl: 'http://test' })
    const keys = generateKeys()
    loginAs('me@test.com', keys)

    const realKeys = generateKeys()
    const substitutedKeys = generateKeys()
    setConfig('knownKeys', {
      user_bob: { email: 'bob@test.com', fingerprint: publicKeyFingerprint(realKeys.publicKey) },
    })

    let shareCalled = false
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/pending')) {
        return json(200, [
          { id: 'user_bob', fullName: 'Bob', email: 'bob@test.com', publicKey: substitutedKeys.publicKey },
        ])
      }
      if (url.endsWith(`/api/keys/${projectId}`)) {
        return json(200, { encryptedKey: encryptProjectKeyForUser('k', keys.publicKey), keyVersion: 1 })
      }
      if (url.endsWith('/share') && init?.method === 'POST') {
        shareCalled = true
        return json(200, {})
      }
      return json(404, {})
    })

    prompts.inject([true, PASSWORD])
    let output = ''
    try {
      output = await silently(() => keysCommand.parseAsync(['share'], { from: 'user' }))
    } finally {
      restoreFetch()
    }

    assert.isFalse(shareCalled)
    assert.include(output, 'has changed')
  })
})

test.group('Project key rotation', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('re-encrypts the whole history and wraps the new key for every member', async ({
    assert,
  }) => {
    const projectId = 'proj_rotate_1'
    setLocalConfig({ projectId, projectName: 'Rotated', serverUrl: 'http://test' })
    const ownerKeys = generateKeys()
    const memberKeys = generateKeys()
    loginAs('owner@test.com', ownerKeys)

    const oldKey = 'old-project-key'
    const legacy = encryptSecret('LEGACY=1', oldKey)
    const current = encryptSnapshot('CURRENT=2', oldKey, {
      projectId,
      environment: 'production',
      version: 2,
    })

    let rotateBody: any = null
    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith(`/api/keys/${projectId}`)) {
        return json(200, {
          encryptedKey: encryptProjectKeyForUser(oldKey, ownerKeys.publicKey),
          keyVersion: 4,
        })
      }
      if (url.endsWith(`/api/keys/${projectId}/snapshots`)) {
        return json(200, {
          keyVersion: 4,
          snapshots: [
            { id: 'snap_1', environment: 'production', version: 1, cryptoVersion: 1, ...legacy, tag: legacy.authTag },
            { id: 'snap_2', environment: 'production', version: 2, cryptoVersion: 2, ...current, tag: current.authTag },
          ],
        })
      }
      if (url.endsWith(`/api/keys/${projectId}/recipients`)) {
        return json(200, [
          { id: 'user_owner', email: 'owner@test.com', fullName: 'Owner', publicKey: ownerKeys.publicKey },
          { id: 'user_member', email: 'member@test.com', fullName: 'Member', publicKey: memberKeys.publicKey },
        ])
      }
      if (url.endsWith(`/api/keys/${projectId}/rotate`) && init?.method === 'POST') {
        rotateBody = JSON.parse(init.body)
        return json(200, { keyVersion: 5, revokedTokens: 2 })
      }
      return json(404, {})
    })

    prompts.inject([true, PASSWORD, true])
    let output = ''
    try {
      output = await silently(() => projectCommand.parseAsync(['rotate-key'], { from: 'user' }))
    } finally {
      restoreFetch()
    }

    assert.isNotNull(rotateBody, 'rotation should be sent')
    assert.equal(rotateBody.expectedKeyVersion, 4)

    const keysByUser = Object.fromEntries(rotateBody.keys.map((k: any) => [k.userId, k.encryptedKey]))
    const newKey = decryptProjectKey(keysByUser.user_owner, ownerKeys.privateKey)
    assert.equal(decryptProjectKey(keysByUser.user_member, memberKeys.privateKey), newKey)
    assert.notEqual(newKey, oldKey)
    assert.lengthOf(Buffer.from(newKey, 'base64url'), 32)

    const decrypted = rotateBody.snapshots.map((s: any, index: number) =>
      decryptSnapshot(
        { ...s, tag: s.authTag, version: index + 1, cryptoVersion: 2 },
        newKey,
        { projectId, environment: 'production' }
      )
    )
    assert.deepEqual(decrypted, ['LEGACY=1', 'CURRENT=2'])
    assert.deepEqual(
      rotateBody.snapshots.map((s: any) => s.id),
      ['snap_1', 'snap_2']
    )

    assert.include(output, '2 token(s) were revoked')
    assert.equal(
      getConfig().knownKeys?.user_member?.fingerprint,
      publicKeyFingerprint(memberKeys.publicKey)
    )
  })
})
