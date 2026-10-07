import { test } from '@japa/runner'
import { defineGitgoneCommand } from '@/cli/command.js'
import { route } from '@/cli/router.js'
import { resetOutput, setOutput } from '@/ui/output.js'

const calls: string[][] = []
const root = defineGitgoneCommand({
  meta: { name: 'gitgone', description: 'Encrypted secrets for teams' },
  subCommands: {
    pull: defineGitgoneCommand({
      meta: { name: 'pull', description: 'Download secrets', group: 'Secrets' },
      args: { env: { type: 'string', alias: 'e' } },
      run: async ({ args }) => {
        calls.push(['pull', String(args.env)])
        return { environment: args.env }
      },
    }),
    key: defineGitgoneCommand({
      meta: { name: 'key', description: 'Manage keys', group: 'Project' },
      subCommands: {
        share: defineGitgoneCommand({
          meta: { name: 'share', description: 'Share keys' },
          run: async () => {
            calls.push(['key share'])
          },
        }),
      },
    }),
    fail: defineGitgoneCommand({
      meta: { name: 'fail', description: 'Always fails' },
      run: async () => {
        throw new Error('Boom')
      },
    }),
  },
})

test.group('Router', (group) => {
  let output = ''
  group.each.setup(() => {
    output = ''
    calls.length = 0
    setOutput((text) => (output += text))
    return () => resetOutput()
  })

  test('runs a top-level command with its options', async ({ assert }) => {
    assert.equal(await route(['pull', '-e', 'production'], root), 0)
    assert.deepEqual(calls, [['pull', 'production']])
  })

  test('runs a subcommand', async ({ assert }) => {
    assert.equal(await route(['key', 'share'], root), 0)
    assert.deepEqual(calls, [['key share']])
  })

  test('a typo suggests the right command', async ({ assert }) => {
    assert.equal(await route(['pul'], root), 1)
    assert.include(output, 'Unknown command "pul".')
    assert.include(output, 'did you mean gitgone pull?')
  })

  test('a v1 name explains the rename', async ({ assert }) => {
    assert.equal(await route(['keys', 'share'], root), 1)
    assert.include(output, '"gitgone keys share" was renamed.')
    assert.include(output, 'use gitgone key share')
  })

  test('a group without a subcommand shows its help', async ({ assert }) => {
    assert.equal(await route(['key'], root), 0)
    assert.include(output, '  share  Share keys')
  })

  test('--help on a command shows its help without running it', async ({ assert }) => {
    assert.equal(await route(['pull', '--help'], root), 0)
    assert.deepEqual(calls, [])
    assert.include(output, 'gitgone pull [options]')
  })

  test('help and --version', async ({ assert }) => {
    assert.equal(await route(['help'], root), 0)
    assert.include(output, 'SECRETS')
    output = ''
    assert.equal(await route(['--version'], root), 0)
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/)
  })

  test('without a terminal, no argument shows the help', async ({ assert }) => {
    assert.equal(await route([], root), 0)
    assert.include(output, 'USAGE')
  })

  test('an error is reported without a stack trace', async ({ assert }) => {
    assert.equal(await route(['fail'], root), 1)
    assert.include(output, '✖ Boom')
    assert.notInclude(output, 'at ')
  })

  test('--json errors stay JSON', async ({ assert }) => {
    assert.equal(await route(['fail', '--json'], root), 1)
    assert.deepEqual(JSON.parse(output), { error: 'Boom' })
  })
})

test.group('Legacy names', () => {
  test('every v1 name points to an existing command', async ({ assert }) => {
    const { LEGACY_NAMES } = await import('@/cli/legacy.js')
    const { tree } = await import('@/cli/tree.js')
    for (const target of Object.values(LEGACY_NAMES)) {
      let command = tree
      for (const word of target.split(' ').filter((part) => !part.startsWith('-'))) {
        command = command.subCommands?.[word] as typeof tree
        assert.exists(command, `"${target}" does not exist`)
      }
    }
  })
})
