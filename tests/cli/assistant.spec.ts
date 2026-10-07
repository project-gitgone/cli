import { test } from '@japa/runner'
import { runAssistant } from '@/cli/assistant.js'
import { defineGitgoneCommand } from '@/cli/command.js'
import { route } from '@/cli/router.js'
import { getConfig, setConfig, setLocalConfig } from '@/lib/config.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { answers, mockFetch, setupEnvironment, terminal } from '@tests/helpers.js'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const calls: string[] = []
const fake = (name: string) =>
  defineGitgoneCommand({
    meta: { name, description: name },
    run: async ({ rawArgs }) => {
      calls.push([name, ...rawArgs].join(' '))
      if (name === 'login') setConfig('authToken', 'oat_1')
      if (name === 'init') setLocalConfig({ projectId: 'prj_1' })
    },
  })
const root = defineGitgoneCommand({
  meta: { name: 'gitgone', description: 'Encrypted secrets for teams' },
  subCommands: Object.fromEntries(['login', 'init', 'pull', 'push', 'run', 'history', 'status'].map((name) => [name, fake(name)])),
})

test.group('Assistant', (group) => {
  let output = ''
  let restoreFetch = () => {}
  group.each.setup(() => {
    const env = setupEnvironment()
    calls.length = 0
    output = ''
    setOutput((text) => (output += text))
    restoreFetch = mockFetch(async (url) =>
      url.startsWith('https://good.example.com') && url.endsWith('/healthcheck') ? json(200, { initialized: true }) : json(500, {}),
    )
    setConfig('serverUrl', 'https://good.example.com')
    return () => {
      restoreFetch()
      resetOutput()
      env.cleanup()
    }
  })

  test('an unreachable server asks for its URL first', async ({ assert }) => {
    setConfig('serverUrl', 'https://down.example.com')
    answers(['https://good.example.com', 'status'])
    await runAssistant(root, terminal)
    assert.equal(getConfig().serverUrl, 'https://good.example.com')
    assert.deepEqual(calls, ['login', 'init', 'status'])
  })

  test('without a session it starts with login, then init', async ({ assert }) => {
    answers(['pull'])
    await runAssistant(root, terminal)
    assert.deepEqual(calls, ['login', 'init', 'pull'])
  })

  test('once set up it offers the daily actions', async ({ assert }) => {
    setConfig('authToken', 'oat_1')
    setLocalConfig({ projectId: 'prj_1' })
    answers(['run', 'npm start'])
    await runAssistant(root, terminal)
    assert.deepEqual(calls, ['run -- npm start'])
  })

  test('"All commands" shows the help', async ({ assert }) => {
    setConfig('authToken', 'oat_1')
    setLocalConfig({ projectId: 'prj_1' })
    answers(['help'])
    await runAssistant(root, terminal)
    assert.include(output, 'USAGE')
  })

  test('the router starts the assistant only in a terminal', async ({ assert }) => {
    setConfig('authToken', 'oat_1')
    setLocalConfig({ projectId: 'prj_1' })
    answers(['history'])
    assert.equal(await route([], root, { environment: terminal, assistant: runAssistant }), 0)
    assert.deepEqual(calls, ['history'])
  })
})
