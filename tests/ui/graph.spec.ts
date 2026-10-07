import { test } from '@japa/runner'
import type { TimelineEvent } from '@/api/types.js'
import { relativeTime, renderGraph, type VersionChanges } from '@/ui/graph.js'

const now = Date.parse('2026-10-07T12:00:00Z')
const author = { type: 'user' as const, label: 'alice@acme.com' }
const version = (id: string, environment: string, number: number, minutesAgo: number, rollbackOf: number | null = null): TimelineEvent => ({
  type: 'version',
  id,
  environment,
  version: number,
  keyVersion: 1,
  rollbackOf,
  author,
  createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
})

const events: TimelineEvent[] = [
  version('p3', 'production', 3, 5, 1),
  { type: 'rotation', environment: null, keyVersion: 2, author, createdAt: new Date(now - 30 * 60_000).toISOString() },
  version('d2', 'development', 2, 60),
  version('p1', 'production', 1, 120),
  version('d1', 'development', 1, 180),
]

test.group('History graph', () => {
  test('one column per environment, a dot per version and lanes in between', ({ assert }) => {
    const lines = renderGraph(['development', 'production'], events, new Map(), now)
    assert.deepEqual(
      lines.map((line) => line.slice(0, 3)),
      ['  ●', '──┼', '● │', '│ ●', '●  ']
    )
    assert.include(lines[0], 'production v3  current')
    assert.include(lines[0], '↺ rollback to v1')
    assert.include(lines[0], 'alice@acme.com · 5 minutes ago')
    assert.include(lines[1], 'key rotated (v2)')
    assert.include(lines[2], 'development v2  current')
    assert.notInclude(lines[3], 'current')
  })

  test('changed keys appear under their version, never values', ({ assert }) => {
    const changes = new Map<string, VersionChanges>([
      ['p3', { added: ['STRIPE_KEY'], changed: ['DATABASE_URL'], removed: ['OLD_TOKEN'] }],
      ['d2', 'inaccessible'],
      ['p1', 'unknown'],
    ])
    const lines = renderGraph(['development', 'production'], events, changes, now)
    assert.include(lines[1], '+ STRIPE_KEY  ~ DATABASE_URL  - OLD_TOKEN')
    assert.include(lines[4], 'content not accessible')
    assert.lengthOf(lines, 7)
  })

  test('relative dates read like git', ({ assert }) => {
    assert.equal(relativeTime(new Date(now - 30_000).toISOString(), now), 'just now')
    assert.equal(relativeTime(new Date(now - 2 * 3_600_000).toISOString(), now), '2 hours ago')
    assert.equal(relativeTime(new Date(now - 86_400_000).toISOString(), now), '1 day ago')
  })
})
