import { test } from '@japa/runner'
import crypto from 'node:crypto'
import fs from 'fs'
import { pullCommand, pushCommand } from '@/commands/secrets.js'
import { setConfig, setLocalConfig } from '@/lib/config.js'
import { encryptProjectKeyForUser, encryptSnapshot, encryptVault } from '@/lib/crypto.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { answers, invoke, mockFetch, setupEnvironment } from '@tests/helpers.js'

const PASSWORD = 'secure_password'
const projectId = 'proj_changes'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function serverWith(content: string) {
  const keys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const vault = encryptVault(keys.privateKey, PASSWORD)
  setConfig('encryptedPrivateKey', vault.encryptedPrivateKey)
  setConfig('keySalt', vault.salt)
  setLocalConfig({ projectId, serverUrl: 'http://test' })

  const projectKey = crypto.randomBytes(32).toString('hex')
  const encrypted = encryptSnapshot(content, projectKey, { projectId, environment: 'production', version: 4 })
  const pushes: unknown[] = []
  const restore = mockFetch(async (url, init: any) => {
    if (url.endsWith(`/api/projects/${projectId}/environments`))
      return json(200, [{ id: 'env_1', name: 'production', protected: true }])
    if (url.endsWith(`/api/projects/${projectId}/environments/production/key`))
      return json(200, { encryptedKey: encryptProjectKeyForUser(projectKey, keys.publicKey) })
    if (url.includes('/api/secrets/latest')) return json(200, { ...encrypted, tag: encrypted.authTag, version: 4, cryptoVersion: 2 })
    if (url.includes('/api/secrets/history')) return json(200, [{ id: 'snap_4', version: 4 }])
    if (url.endsWith('/api/secrets') && init?.method === 'POST') {
      pushes.push(JSON.parse(init.body))
      return json(201, { id: 'snap_5', version: 5 })
    }
    return json(404, {})
  })
  return { pushes, restore }
}

test.group('Secrets changes', (group) => {
  let output = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    output = ''
    setOutput((text) => (output += text))
    return () => {
      resetOutput()
      env.cleanup()
    }
  })

  test('push without changes sends nothing and asks nothing', async ({ assert }) => {
    fs.writeFileSync('.env', 'A=1\nB=2')
    const server = serverWith('A=1\nB=2')
    answers([PASSWORD])
    try {
      const result = await invoke(pushCommand, ['-e', 'production'])
      assert.deepEqual(result, { pushed: false, environment: 'production', changes: { added: [], changed: [], removed: [] } })
      assert.lengthOf(server.pushes, 0)
      assert.include(output, 'Nothing to push')
    } finally {
      server.restore()
    }
  })

  test('push shows the changed names, never the values', async ({ assert }) => {
    fs.writeFileSync('.env', 'A=1\nB=changed-secret-value\nNEW=new-secret-value')
    const server = serverWith('A=1\nB=2\nOLD=old-secret-value')
    answers([PASSWORD, true])
    try {
      const result = await invoke(pushCommand, ['-e', 'production'])
      assert.deepEqual((result as { changes: unknown }).changes, { added: ['NEW'], changed: ['B'], removed: ['OLD'] })
      assert.include(output, '+ NEW')
      assert.include(output, '~ B')
      assert.include(output, '- OLD')
      for (const value of ['changed-secret-value', 'new-secret-value', 'old-secret-value']) {
        assert.notInclude(output, value)
        assert.notInclude(JSON.stringify(result), value)
      }
      assert.lengthOf(server.pushes, 1)
    } finally {
      server.restore()
    }
  })

  test('push --json in CI needs --yes to send changes', async ({ assert }) => {
    fs.writeFileSync('.env', 'A=2')
    const server = serverWith('A=1')
    process.env.GITGONE_PASSWORD = PASSWORD
    try {
      await assert.rejects(() => invoke(pushCommand, ['-e', 'production', '--json']), /Cannot ask/)
      assert.lengthOf(server.pushes, 0)
      await invoke(pushCommand, ['-e', 'production', '--json', '--yes'])
      assert.lengthOf(server.pushes, 1)
      assert.deepEqual(JSON.parse(output), {
        pushed: true,
        environment: 'production',
        version: 5,
        changes: { added: [], changed: ['A'], removed: [] },
      })
    } finally {
      delete process.env.GITGONE_PASSWORD
      server.restore()
    }
  })

  test('pull over a different .env asks before overwriting', async ({ assert }) => {
    fs.writeFileSync('.env', 'LOCAL_ONLY=1')
    const server = serverWith('A=1')
    answers([PASSWORD, false])
    try {
      await invoke(pullCommand, ['-e', 'production'])
      assert.equal(fs.readFileSync('.env', 'utf-8'), 'LOCAL_ONLY=1')
      assert.include(output, '- LOCAL_ONLY')
      assert.include(output, '+ A')
    } finally {
      server.restore()
    }
  })
})
