import { test } from '@japa/runner'
import { ApiError } from '@/api/client.js'
import { MissingArgumentError, renderError, reportError, suggestCommand } from '@/cli/errors.js'
import { CancelledError, NonInteractiveError } from '@/ui/ask.js'
import { resetOutput, setOutput } from '@/ui/output.js'

test.group('Error rendering', () => {
  test('an expired session points to login', ({ assert }) => {
    assert.deepEqual(renderError(new ApiError('Unauthorized. Please login again.', 401)), {
      message: 'Session expired.',
      hint: 'gitgone login',
      exitCode: 1,
    })
  })

  test('an unreachable server points to the configured URL', ({ assert }) => {
    const error = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    assert.deepEqual(renderError(error), {
      message: 'Cannot reach the server.',
      hint: 'check the URL with gitgone config get serverUrl',
      exitCode: 1,
    })
  })

  test('a forbidden action keeps the server message', ({ assert }) => {
    assert.equal(renderError(new ApiError('You cannot manage this project', 403)).message, 'You cannot manage this project')
  })

  test('a missing argument names the option', ({ assert }) => {
    assert.deepEqual(renderError(new MissingArgumentError('email')), {
      message: 'Missing email.',
      hint: 'pass --email',
      exitCode: 1,
    })
  })

  test('a question without a terminal explains how to answer it', ({ assert }) => {
    const rendered = renderError(new NonInteractiveError('Sure?'))
    assert.equal(rendered.message, 'Cannot ask "Sure?" without an interactive terminal.')
  })

  test('a cancellation exits with 130', ({ assert }) => {
    assert.deepEqual(renderError(new CancelledError()), { message: 'Cancelled.', exitCode: 130 })
  })

  test('--json errors are a JSON object', ({ assert }) => {
    const lines: string[] = []
    setOutput((text) => lines.push(text))
    try {
      const code = reportError(new ApiError('nope', 401), { json: true })
      assert.equal(code, 1)
      assert.deepEqual(JSON.parse(lines.join('')), { error: 'Session expired.', hint: 'gitgone login' })
    } finally {
      resetOutput()
    }
  })
})

test.group('Command suggestions', () => {
  const known = ['pull', 'push', 'init', 'login', 'logout', 'status', 'env']

  test('a typo suggests the closest command', ({ assert }) => {
    assert.equal(suggestCommand('pul', known), 'pull')
    assert.equal(suggestCommand('statsu', known), 'status')
  })

  test('nothing close gives no suggestion', ({ assert }) => {
    assert.isNull(suggestCommand('deploy', known))
  })
})
