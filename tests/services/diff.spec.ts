import { test } from '@japa/runner'
import { countChanges, diffVariables } from '@/services/diff.js'

test.group('Variable diff', () => {
  test('lists added, changed and removed names, sorted', ({ assert }) => {
    const changes = diffVariables({ B: '1', A: '1', GONE: 'x' }, { A: '2', B: '1', NEW: 'y', ALSO: 'z' })
    assert.deepEqual(changes, { added: ['ALSO', 'NEW'], changed: ['A'], removed: ['GONE'] })
    assert.equal(countChanges(changes), 4)
  })

  test('identical content has no change', ({ assert }) => {
    assert.equal(countChanges(diffVariables({ A: '1' }, { A: '1' })), 0)
  })

  test('only names are returned, never values', ({ assert }) => {
    const changes = diffVariables({}, { TOKEN: 'secret-value' })
    assert.notInclude(JSON.stringify(changes), 'secret-value')
  })
})
