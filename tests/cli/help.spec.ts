import { test } from '@japa/runner'
import { defineGitgoneCommand } from '@/cli/command.js'
import { renderCommandHelp, renderHelp } from '@/cli/help.js'

const pull = defineGitgoneCommand({
  meta: { name: 'pull', description: 'Download secrets', group: 'Secrets', examples: ['gitgone pull -e production'] },
  args: { env: { type: 'string', alias: 'e', description: 'Environment', valueHint: 'name' } },
  run: async () => undefined,
})
const login = defineGitgoneCommand({
  meta: { name: 'login', description: 'Sign in', group: 'Getting started' },
  run: async () => undefined,
})
const team = defineGitgoneCommand({
  meta: { name: 'team', description: 'Manage teams', group: 'Access' },
  subCommands: {
    add: defineGitgoneCommand({
      meta: { name: 'add', description: 'Add a member' },
      args: { email: { type: 'positional', required: false, description: 'Member email' } },
      run: async () => undefined,
    }),
  },
})
const root = defineGitgoneCommand({
  meta: { name: 'gitgone', description: 'Encrypted secrets for teams' },
  subCommands: { pull, login, team },
})

test.group('Help', () => {
  test('commands are grouped in a fixed order and aligned', ({ assert }) => {
    const lines = renderHelp(root, '26.10.7').split('\n')
    assert.equal(lines[3], ' ███▀      ▀███     GitGone CLI v26.10.7')
    assert.include(lines[4], 'Encrypted secrets for teams')
    const start = lines.indexOf('GETTING STARTED')
    const secrets = lines.indexOf('SECRETS')
    const access = lines.indexOf('ACCESS')
    assert.isTrue(start > 0 && start < secrets && secrets < access)
    assert.equal(lines[start + 1], '  login  Sign in')
    assert.equal(lines[secrets + 1], '  pull   Download secrets')
  })

  test('the global options are listed', ({ assert }) => {
    const help = renderHelp(root, '26.10.7')
    for (const option of ['--json', '-y, --yes', '--server <url>', '--no-color']) assert.include(help, option)
  })

  test('a command shows its options and examples', ({ assert }) => {
    const help = renderCommandHelp(['pull'], pull)
    assert.include(help, 'gitgone pull [options]')
    assert.include(help, '-e, --env <name>')
    assert.include(help, '$ gitgone pull -e production')
  })

  test('a group lists its subcommands and arguments', ({ assert }) => {
    assert.include(renderCommandHelp(['team'], team), '  add  Add a member')
    assert.include(renderCommandHelp(['team', 'add'], team.subCommands!.add), 'gitgone team add [email] [options]')
  })
})
