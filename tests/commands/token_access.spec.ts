import { test } from '@japa/runner'
import crypto from 'node:crypto'
import fs from 'fs'
import { route } from '@/cli/router.js'
import { tree } from '@/cli/tree.js'
import { pullCommand, runCommand } from '@/commands/secrets.js'
import { deriveTokenKeys, encryptSnapshot, encryptWithTokenV2, generateTokenSecret } from '@/lib/crypto.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { invoke, mockFetch, setupEnvironment, spyExit } from '@tests/helpers.js'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function tokenServer(content: string) {
  const secret = generateTokenSecret()
  const projectKey = crypto.randomBytes(32).toString('base64url')
  const snapshot = encryptSnapshot(content, projectKey, { projectId: 'prj_ci', environment: 'production', version: 7 })
  const requests: { url: string; authorization?: string }[] = []
  const restore = mockFetch(async (url, init: any) => {
    requests.push({ url, authorization: init?.headers?.Authorization })
    if (url === 'https://gitgone.example.com/api/secrets/token') {
      return json(200, {
        cryptoVersion: 2,
        encryptedProjectKey: encryptWithTokenV2(projectKey, secret),
        secrets: { ...snapshot, authTag: snapshot.authTag, cryptoVersion: 2, version: 7, environment: 'production', projectId: 'prj_ci' },
      })
    }
    return json(404, {})
  })
  return { token: `v2.ptok_ci.${secret}`, secret, requests, restore }
}

test.group('Token access', (group) => {
  let output = ''
  group.each.setup(() => {
    const env = setupEnvironment()
    output = ''
    setOutput((text) => (output += text))
    process.env.GITGONE_SERVER_URL = 'https://gitgone.example.com'
    return () => {
      delete process.env.GITGONE_TOKEN
      delete process.env.GITGONE_SERVER_URL
      resetOutput()
      env.cleanup()
    }
  })

  test('pull with GITGONE_TOKEN needs no session, no linked folder and no password', async ({ assert }) => {
    const server = tokenServer('API_URL=https://api.example.com\nSTRIPE_KEY=sk_live_1')
    process.env.GITGONE_TOKEN = server.token
    try {
      const result = await invoke(pullCommand, ['--json'])
      assert.deepInclude(result as object, { environment: 'production', version: 7 })
      assert.equal(fs.readFileSync('.env', 'utf-8'), 'API_URL=https://api.example.com\nSTRIPE_KEY=sk_live_1')
    } finally {
      server.restore()
    }
  })

  test('the token secret never leaves the machine', async ({ assert }) => {
    const server = tokenServer('A=1')
    process.env.GITGONE_TOKEN = server.token
    try {
      await invoke(pullCommand, ['--json'])
    } finally {
      server.restore()
    }
    assert.lengthOf(server.requests, 1)
    assert.equal(server.requests[0].authorization, `Bearer v2.ptok_ci.${deriveTokenKeys(server.secret).authVerifier}`)
    assert.notInclude(JSON.stringify(server.requests), server.secret)
    assert.notInclude(output, 'sk_live')
  })

  test('a token reads only its own environment', async ({ assert }) => {
    const server = tokenServer('A=1')
    process.env.GITGONE_TOKEN = server.token
    try {
      await assert.rejects(() => invoke(pullCommand, ['-e', 'staging', '--json']), 'This token reads "production", not "staging".')
    } finally {
      server.restore()
    }
  })

  test('a malformed token is refused before any request', async ({ assert }) => {
    const server = tokenServer('A=1')
    process.env.GITGONE_TOKEN = 'not-a-token'
    try {
      await assert.rejects(() => invoke(pullCommand, ['--json']), /Invalid GITGONE_TOKEN/)
      assert.lengthOf(server.requests, 0)
    } finally {
      server.restore()
    }
  })

  test('a refused token gets its own message', async ({ assert }) => {
    process.env.GITGONE_TOKEN = 'v2.ptok_old.c2VjcmV0'
    const restore = mockFetch(async () => json(401, { message: 'Token not found' }))
    try {
      const code = await route(['pull', '--json'], tree)
      assert.equal(code, 1)
      assert.deepEqual(JSON.parse(output), {
        error: 'GITGONE_TOKEN was refused: it may be revoked, expired or mistyped.',
        hint: 'gitgone token create',
      })
    } finally {
      restore()
    }
  })

  test('run injects the secrets of the token', async ({ assert }) => {
    const server = tokenServer('CI_SECRET=from-token')
    process.env.GITGONE_TOKEN = server.token
    const exit = spyExit()
    try {
      await invoke(runCommand, ['--', 'true'])
      assert.equal(await exit.exited, 0)
      assert.equal(process.env.CI_SECRET, 'from-token')
    } finally {
      exit.restore()
      server.restore()
      delete process.env.CI_SECRET
    }
  })
})
