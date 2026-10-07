import { test } from '@japa/runner'
import { logoutCommand } from '@/commands/session.js'
import { configCommand } from '@/commands/config.js'
import { unlockVault } from '@/commands/shared.js'
import { generateKeyPair } from '@/lib/crypto.js'
import { getConfig, setConfig } from '@/lib/config.js'
import { buildAccountCredentials } from '@/services/account.js'
import { setSecretStore } from '@/services/keychain.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { answers, invoke, memorySecretStore, setupEnvironment } from '@tests/helpers.js'

const PASSWORD = 'correct horse battery staple'
const ACCOUNT = 'ada@example.com@https://gitgone.example.com'
const ctx = { interactive: true, json: false, yes: false }

function signIn(password = PASSWORD) {
  const { privateKey } = generateKeyPair()
  const credentials = buildAccountCredentials(password, privateKey)
  setConfig('serverUrl', 'https://gitgone.example.com')
  setConfig('authToken', 'oat_1')
  setConfig('userEmail', 'ada@example.com')
  setConfig('cryptoVersion', 2)
  setConfig('kdfParams', credentials.kdf)
  setConfig('encryptedPrivateKey', credentials.encryptedPrivateKey)
  return privateKey
}

test.group('Vault keychain', (group) => {
  let store = memorySecretStore()
  let output = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    store = memorySecretStore()
    setSecretStore(store)
    output = ''
    setOutput((text) => (output += text))
    return () => {
      resetOutput()
      env.cleanup()
    }
  })

  test('the password is asked once, then the vault opens from the keychain', async ({ assert }) => {
    const privateKey = signIn()
    answers([PASSWORD])
    assert.equal(await unlockVault(ctx), privateKey)
    assert.isTrue(store.entries.has(ACCOUNT))
    assert.include(output, 'remembered in the system keychain')
    assert.notInclude(store.entries.get(ACCOUNT)!, PASSWORD)

    answers([])
    assert.equal(await unlockVault(ctx), privateKey)
  })

  test('a remembered key that no longer opens the vault is forgotten', async ({ assert }) => {
    const privateKey = signIn()
    store.entries.set(ACCOUNT, Buffer.alloc(32, 7).toString('base64'))
    answers([PASSWORD])
    assert.equal(await unlockVault(ctx), privateKey)
    assert.notEqual(store.entries.get(ACCOUNT), Buffer.alloc(32, 7).toString('base64'))
  })

  test('a wrong password is not remembered', async ({ assert }) => {
    signIn()
    answers(['wrong password'])
    await assert.rejects(() => unlockVault(ctx), /Could not unlock your vault/)
    assert.equal(store.entries.size, 0)
  })

  test('GITGONE_PASSWORD is never stored', async ({ assert }) => {
    const privateKey = signIn()
    process.env.GITGONE_PASSWORD = PASSWORD
    try {
      assert.equal(await unlockVault({ ...ctx, interactive: false }), privateKey)
      assert.equal(store.entries.size, 0)
    } finally {
      delete process.env.GITGONE_PASSWORD
    }
  })

  test('keychain off keeps asking and stores nothing', async ({ assert }) => {
    signIn()
    await invoke(configCommand.subCommands!.set, ['keychain', 'off'])
    assert.isFalse(getConfig().keychain)
    answers([PASSWORD, PASSWORD])
    await unlockVault(ctx)
    await unlockVault(ctx)
    assert.equal(store.entries.size, 0)
  })

  test('without a usable keychain the password is still enough', async ({ assert }) => {
    const privateKey = signIn()
    setSecretStore({
      get: async () => {
        throw new Error('no secret service')
      },
      set: async () => {
        throw new Error('no secret service')
      },
      delete: async () => {
        throw new Error('no secret service')
      },
    })
    answers([PASSWORD])
    assert.equal(await unlockVault(ctx), privateKey)
    assert.notInclude(output, 'remembered')
  })

  test('logout forgets the remembered key', async ({ assert }) => {
    signIn()
    answers([PASSWORD])
    await unlockVault(ctx)
    await invoke(logoutCommand)
    assert.equal(store.entries.size, 0)
  })
})
