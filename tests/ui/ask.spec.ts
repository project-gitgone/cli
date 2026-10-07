import { test } from '@japa/runner'
import { ask, CancelledError, scriptedAsker, setAsker } from '@/ui/ask.js'

test.group('Scripted asker', (group) => {
  group.each.teardown(() => setAsker(scriptedAsker([])))

  test('answers are consumed in order', async ({ assert }) => {
    setAsker(scriptedAsker(['alice@example.com', true, 'prod']))
    assert.equal(await ask.text({ message: 'Email' }), 'alice@example.com')
    assert.isTrue(await ask.confirm({ message: 'Sure?' }))
    assert.equal(
      await ask.select({ message: 'Env', options: [{ label: 'Production', value: 'prod' }] }),
      'prod',
    )
  })

  test('running out of answers names the question', async ({ assert }) => {
    setAsker(scriptedAsker([]))
    await assert.rejects(() => ask.text({ message: 'Email' }), 'No scripted answer left for "Email"')
  })

  test('validation applies to scripted answers', async ({ assert }) => {
    setAsker(scriptedAsker(['short']))
    await assert.rejects(
      () => ask.password({ message: 'Password', validate: (value) => (value.length < 8 ? 'At least 8 characters' : undefined) }),
      'At least 8 characters',
    )
  })

  test('a cancelled answer raises a CancelledError', async ({ assert }) => {
    setAsker(scriptedAsker([CancelledError]))
    await assert.rejects(() => ask.confirm({ message: 'Sure?' }), CancelledError)
  })
})
