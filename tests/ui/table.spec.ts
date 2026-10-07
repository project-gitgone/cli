import { test } from '@japa/runner'
import { table } from '@/ui/table.js'
import { setColor } from '@/ui/theme.js'

test.group('Table', (group) => {
  group.each.setup(() => setColor(false))

  test('aligns columns under their headers', ({ assert }) => {
    const output = table([
      { name: 'production', protected: 'yes' },
      { name: 'dev', protected: 'no' },
    ])
    assert.deepEqual(output.split('\n'), ['NAME        PROTECTED', 'production  yes', 'dev         no'])
  })

  test('truncates the widest column to fit the terminal', ({ assert }) => {
    const output = table([{ email: 'a'.repeat(80), role: 'owner' }], undefined, 40)
    for (const line of output.split('\n')) assert.isAtMost(line.length, 40)
    assert.include(output, '…')
  })

  test('uses the given column labels and order', ({ assert }) => {
    const output = table([{ a: 1, b: 2 }], [
      { key: 'b', label: 'Second' },
      { key: 'a', label: 'First' },
    ])
    assert.equal(output.split('\n')[0], 'SECOND  FIRST')
  })

  test('an empty list gives a short message', ({ assert }) => {
    assert.equal(table([]), 'Nothing to show.')
  })
})
