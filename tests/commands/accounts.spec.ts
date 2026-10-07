import { test } from '@japa/runner'
import { setupEnvironment, mockFetch, spyConsole, answers, invoke } from '@tests/helpers.js'
import crypto from 'node:crypto'
import { loginAction } from '@/flows/login.js'
import { accountCommand } from '@/commands/account.js'
import { getConfig, setConfig } from '@/lib/config.js'
import { unlockPrivateKey } from '@/services/session.js'
import {
  decryptVaultV2,
  deriveAccountKeys,
  encryptVault,
  encryptVaultV2,
  type KdfParams,
} from '@/lib/crypto.js'

const VECTOR = {
  password: 'correct horse battery staple',
  kdf: { algo: 'scrypt', salt: 'CQkJCQkJCQkJCQkJCQkJCQ==', N: 131072, r: 8, p: 1 } as KdfParams,
  authKey: '4A02ptrIjnFzk8itOGJH-2WbitB8IO9VeDgr5-53NII',
  vaultKey: '2d37aad458d37e3fa43daddb37e6402810c819ed9f63798b3b784c9a597cef08',
}

const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const runSilently = async (fn: () => Promise<unknown>) => {
  const consoleSpy = spyConsole()
  try {
    await fn()
  } finally {
    consoleSpy.restore()
  }
}

test.group('Accounts v2 crypto', () => {
  test('derives the shared test vector', ({ assert }) => {
    const keys = deriveAccountKeys(VECTOR.password, VECTOR.kdf)
    assert.equal(keys.authKey, VECTOR.authKey)
    assert.equal(keys.vaultKey.toString('hex'), VECTOR.vaultKey)
  })

  test('refuses weak KDF parameters', ({ assert }) => {
    assert.throws(
      () => deriveAccountKeys(VECTOR.password, { ...VECTOR.kdf, N: 1024 }),
      /unsafe key derivation/
    )
    assert.throws(
      () => deriveAccountKeys(VECTOR.password, { ...VECTOR.kdf, salt: 'c2hvcnQ=' }),
      /unsafe key derivation/
    )
  })
})

test.group('Login', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('v2 account sends the derived authKey, never the password', async ({ assert }) => {
    const vault = encryptVaultV2(PRIVATE_KEY, Buffer.from(VECTOR.vaultKey, 'hex'))
    let loginBody: any = null

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/prelogin')) {
        return json(200, { cryptoVersion: 2, kdf: VECTOR.kdf })
      }
      if (url.endsWith('/api/auth/login')) {
        loginBody = JSON.parse(init.body)
        return json(200, {
          token: { token: 'oat_1' },
          user: {
            email: 'v2@test.com',
            full_name: 'V2',
            cryptoVersion: 2,
            kdfParams: VECTOR.kdf,
            encryptedPrivateKey: vault,
            keySalt: null,
          },
        })
      }
      return json(404, {})
    })

    answers(['v2@test.com', VECTOR.password])
    try {
      await runSilently(loginAction)
    } finally {
      restoreFetch()
    }

    assert.deepEqual(loginBody, { email: 'v2@test.com', authKey: VECTOR.authKey })
    assert.equal(getConfig().authToken, 'oat_1')
    assert.equal(getConfig().cryptoVersion, 2)
    assert.equal(unlockPrivateKey(VECTOR.password), PRIVATE_KEY)
  })

  test('v1 account is upgraded transparently after login', async ({ assert }) => {
    const password = 'old_password'
    const v1Vault = encryptVault(PRIVATE_KEY, password)
    let upgradeBody: any = null

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/prelogin')) {
        return json(200, { cryptoVersion: 1 })
      }
      if (url.endsWith('/api/auth/login')) {
        return json(200, {
          token: { token: 'oat_1' },
          user: {
            email: 'v1@test.com',
            full_name: 'V1',
            cryptoVersion: 1,
            encryptedPrivateKey: v1Vault.encryptedPrivateKey,
            keySalt: v1Vault.salt,
            keyEncryptionAlgo: v1Vault.algo,
          },
        })
      }
      if (url.endsWith('/api/auth/upgrade')) {
        upgradeBody = JSON.parse(init.body)
        return json(200, {
          user: {
            email: 'v1@test.com',
            cryptoVersion: 2,
            kdfParams: upgradeBody.kdf,
            encryptedPrivateKey: upgradeBody.encryptedPrivateKey,
            keySalt: null,
          },
        })
      }
      return json(404, {})
    })

    answers(['v1@test.com', password])
    try {
      await runSilently(loginAction)
    } finally {
      restoreFetch()
    }

    assert.isNotNull(upgradeBody, 'upgrade should be called')
    const { authKey, vaultKey } = deriveAccountKeys(password, upgradeBody.kdf)
    assert.equal(upgradeBody.authKey, authKey)
    assert.equal(decryptVaultV2(upgradeBody.encryptedPrivateKey, vaultKey), PRIVATE_KEY)

    assert.equal(getConfig().cryptoVersion, 2)
    assert.isUndefined(getConfig().keySalt)
    assert.equal(unlockPrivateKey(password), PRIVATE_KEY)
  })

  test('falls back to password login on servers without accounts v2', async ({ assert }) => {
    const password = 'old_password'
    const v1Vault = encryptVault(PRIVATE_KEY, password)
    const calls: string[] = []

    const restoreFetch = mockFetch(async (url) => {
      calls.push(url)
      if (url.endsWith('/api/auth/login')) {
        return json(200, {
          token: { token: 'oat_1' },
          user: {
            email: 'old@test.com',
            full_name: 'Old',
            encryptedPrivateKey: v1Vault.encryptedPrivateKey,
            keySalt: v1Vault.salt,
          },
        })
      }
      return json(404, { message: 'Cannot POST' })
    })

    answers(['old@test.com', password])
    try {
      await runSilently(loginAction)
    } finally {
      restoreFetch()
    }

    assert.equal(getConfig().authToken, 'oat_1')
    assert.isFalse(calls.some((url) => url.endsWith('/api/auth/upgrade')))
    assert.equal(unlockPrivateKey(password), PRIVATE_KEY)
  })
})

test.group('Activate', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('generates keys locally and only sends derived material', async ({ assert }) => {
    const password = 'my new password'
    let activateBody: any = null

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/activate')) {
        activateBody = JSON.parse(init.body)
        return json(200, {
          token: { token: 'oat_1' },
          user: {
            email: activateBody.email,
            full_name: 'Invitee',
            cryptoVersion: 2,
            kdfParams: activateBody.kdf,
            publicKey: activateBody.publicKey,
            encryptedPrivateKey: activateBody.encryptedPrivateKey,
          },
        })
      }
      return json(404, {})
    })

    answers(['invitee@test.com', ' code123 ', password, password])
    try {
      await runSilently(() => invoke(accountCommand.subCommands!.activate))
    } finally {
      restoreFetch()
    }

    assert.isNotNull(activateBody)
    assert.equal(activateBody.code, 'code123')
    assert.notInclude(JSON.stringify(activateBody), password)

    const { authKey, vaultKey } = deriveAccountKeys(password, activateBody.kdf)
    assert.equal(activateBody.authKey, authKey)

    const privateKey = decryptVaultV2(activateBody.encryptedPrivateKey, vaultKey)
    const derivedPublicKey = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' })
    assert.equal(derivedPublicKey, activateBody.publicKey)
    assert.equal(getConfig().authToken, 'oat_1')
  })
})

test.group('Passwd', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('re-encrypts the vault and proves the current password', async ({ assert }) => {
    setConfig('cryptoVersion', 2)
    setConfig('kdfParams', VECTOR.kdf)
    setConfig(
      'encryptedPrivateKey',
      encryptVaultV2(PRIVATE_KEY, Buffer.from(VECTOR.vaultKey, 'hex'))
    )

    const newPassword = 'another long password'
    let passwordBody: any = null

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/password')) {
        passwordBody = JSON.parse(init.body)
        return json(200, {
          user: {
            email: 'me@test.com',
            cryptoVersion: 2,
            kdfParams: passwordBody.kdf,
            encryptedPrivateKey: passwordBody.encryptedPrivateKey,
          },
        })
      }
      return json(404, {})
    })

    answers([VECTOR.password, newPassword, newPassword])
    try {
      await runSilently(() => invoke(accountCommand.subCommands!.password))
    } finally {
      restoreFetch()
    }

    assert.isNotNull(passwordBody)
    assert.equal(passwordBody.currentAuthKey, VECTOR.authKey)
    assert.notEqual(passwordBody.kdf.salt, VECTOR.kdf.salt)
    assert.equal(unlockPrivateKey(newPassword), PRIVATE_KEY)
    assert.throws(() => unlockPrivateKey(VECTOR.password), /Could not unlock/)
  })
})
