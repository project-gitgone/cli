import { test } from '@japa/runner'
import { defineGitgoneCommand, execute, requireArg } from '@/cli/command.js'
import { resolveContext } from '@/cli/context.js'
import { MissingArgumentError } from '@/cli/errors.js'
import { ask, NonInteractiveError } from '@/ui/ask.js'
import { success } from '@/ui/messages.js'
import { resetOutput, setOutput } from '@/ui/output.js'
import { answers } from '@tests/helpers.js'

const tty = { stdin: { isTTY: true }, stdout: { isTTY: true } }

test.group('Context', () => {
  test('a terminal without CI is interactive', ({ assert }) => {
    assert.isTrue(resolveContext({}, {}, tty).interactive)
  })

  test('CI, --json or a pipe are not interactive', ({ assert }) => {
    assert.isFalse(resolveContext({}, { CI: 'true' }, tty).interactive)
    assert.isFalse(resolveContext({ json: true }, {}, tty).interactive)
    assert.isFalse(resolveContext({}, {}, { stdin: { isTTY: true }, stdout: { isTTY: false } }).interactive)
  })
})

test.group('Command execution', (group) => {
  let lines: string[] = []
  group.each.setup(() => {
    lines = []
    setOutput((text) => lines.push(text))
    return () => resetOutput()
  })

  const greet = defineGitgoneCommand({
    meta: { name: 'greet', description: 'Say hello' },
    args: { name: { type: 'positional', required: false, description: 'Who' } },
    run: async ({ args }) => {
      success(`Hello ${args.name}`)
      return { greeted: args.name }
    },
  })

  test('without --json the command prints its own messages', async ({ assert }) => {
    const result = await execute(greet, ['Ada'])
    assert.deepEqual(result, { greeted: 'Ada' })
    assert.deepEqual(lines, ['✔ Hello Ada\n'])
  })

  test('--json prints only the returned data', async ({ assert }) => {
    await execute(greet, ['Ada', '--json'])
    assert.deepEqual(lines, [`${JSON.stringify({ greeted: 'Ada' }, null, 2)}\n`])
  })

  test('--no-color and --yes are understood', async ({ assert }) => {
    const seen = defineGitgoneCommand({
      meta: { name: 'seen', description: 'Context' },
      run: async ({ ctx }) => ctx,
    })
    const ctx = (await execute(seen, ['-y', '--no-color'])) as { yes: boolean }
    assert.isTrue(ctx.yes)
  })

  test('--server targets another server for this run only', async ({ assert }) => {
    const server = defineGitgoneCommand({
      meta: { name: 'server', description: 'Server' },
      run: async () => process.env.GITGONE_SERVER_URL,
    })
    assert.equal(await execute(server, ['--server', 'https://other.example.com']), 'https://other.example.com')
    assert.isUndefined(process.env.GITGONE_SERVER_URL)
  })
})

test.group('Missing arguments', (group) => {
  group.each.setup(() => {
    setOutput(() => {})
    return () => resetOutput()
  })

  test('an interactive run asks for the missing value', async ({ assert }) => {
    const restore = answers(['alice@example.com'])
    try {
      const value = await requireArg({ interactive: true, json: false, yes: false }, undefined, {
        name: 'email',
        ask: () => ask.text({ message: 'Email' }),
      })
      assert.equal(value, 'alice@example.com')
    } finally {
      restore()
    }
  })

  test('a non-interactive run fails and names the option', async ({ assert }) => {
    await assert.rejects(
      () => requireArg({ interactive: false, json: false, yes: false }, undefined, { name: 'email', ask: async () => 'x' }),
      MissingArgumentError,
    )
  })

  test('questions are refused when the run is not interactive', async ({ assert }) => {
    const ask_ = defineGitgoneCommand({
      meta: { name: 'ask', description: 'Ask' },
      run: async () => ask.text({ message: 'Email' }),
    })
    await assert.rejects(() => execute(ask_, ['--json']), NonInteractiveError)
  })

  test('--yes accepts confirmations without asking', async ({ assert }) => {
    const confirmCommand = defineGitgoneCommand({
      meta: { name: 'confirm', description: 'Confirm' },
      run: async () => ask.confirm({ message: 'Sure?' }),
    })
    assert.isTrue(await execute(confirmCommand, ['--yes', '--json']))
  })
})
