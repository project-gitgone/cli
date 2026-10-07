import { test } from '@japa/runner'
import { error, success } from '@/ui/messages.js'
import { resetOutput, setOutput, stripAnsi } from '@/ui/output.js'

test.group('Messages', (group) => {
  let lines: string[] = []
  group.each.setup(() => {
    lines = []
    setOutput((text) => lines.push(stripAnsi(text)))
    return () => resetOutput()
  })

  test('a success shows its symbol', ({ assert }) => {
    success('Pushed 3 variables')
    assert.deepEqual(lines, ['✔ Pushed 3 variables\n'])
  })

  test('an error shows its hint on the next line', ({ assert }) => {
    error('Session expired', 'gitgone login')
    assert.deepEqual(lines, ['✖ Session expired\n', '  → gitgone login\n'])
  })
})
