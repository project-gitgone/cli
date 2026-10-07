import { test } from '@japa/runner'
import type { TimelineEvent } from '@/api/types.js'
import { collectTimeline, versionChanges } from '@/services/timeline.js'
import { mockFetch, setupEnvironment } from '@tests/helpers.js'
import { setLocalConfig } from '@/lib/config.js'

const author = { type: 'user' as const, label: 'alice@acme.com' }
const version = (id: string, environment: string, number: number): Extract<TimelineEvent, { type: 'version' }> => ({
  type: 'version',
  id,
  environment,
  version: number,
  keyVersion: 1,
  rollbackOf: null,
  author,
  createdAt: '2026-10-07T10:00:00.000Z',
})

test.group('Timeline service', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    setLocalConfig({ projectId: 'proj_1', serverUrl: 'http://test' })
    return () => env.cleanup()
  })

  test('changes are computed against the previous kept version', async ({ assert }) => {
    const contents: Record<string, Record<string, string>> = {
      p1: { A: '1', B: '1' },
      p2: { A: '2', C: '1' },
    }
    const changes = await versionChanges([version('p2', 'production', 2), version('p1', 'production', 1)], {
      history: async () => [
        { id: 'p2', version: 2, createdAt: '' },
        { id: 'p1', version: 1, createdAt: '' },
      ],
      read: async (_environment, id) => contents[id],
    })
    assert.deepEqual(changes.get('p2'), { added: ['C'], changed: ['A'], removed: ['B'] })
    assert.deepEqual(changes.get('p1'), { added: ['A', 'B'], changed: [], removed: [] })
  })

  test('a purged previous version is unknown, an unreadable one inaccessible', async ({ assert }) => {
    const changes = await versionChanges([version('p5', 'production', 5), version('s2', 'staging', 2)], {
      history: async (environment) =>
        environment === 'production' ? [{ id: 'p5', version: 5, createdAt: '' }] : [{ id: 's1', version: 1, createdAt: '' }],
      read: async () => {
        throw new Error('no key')
      },
    })
    assert.equal(changes.get('p5'), 'unknown')
    assert.equal(changes.get('s2'), 'inaccessible')
  })

  test('pages are fetched until enough versions are collected', async ({ assert }) => {
    const urls: string[] = []
    const restore = mockFetch(async (url) => {
      urls.push(url)
      const before = new URL(url).searchParams.get('before')
      const body = before
        ? { environments: ['development', 'production'], events: [version('d1', 'development', 1)], nextBefore: null }
        : {
            environments: ['development', 'production'],
            events: [version('p2', 'production', 2), version('d2', 'development', 2)],
            nextBefore: '2026-10-07T09:00:00.000Z',
          }
      return { ok: true, status: 200, json: async () => body }
    })
    const all = await collectTimeline('proj_1', 3)
    assert.lengthOf(urls, 2)
    assert.deepEqual(all.events.map((event) => (event as any).id), ['p2', 'd2', 'd1'])
    const production = await collectTimeline('proj_1', 1, 'production')
    assert.deepEqual(production.environments, ['production'])
    assert.deepEqual(production.events.map((event) => (event as any).id), ['p2'])
    restore()
  })
})
