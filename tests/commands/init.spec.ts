import { test } from '@japa/runner'
import { setupEnvironment, mockFetch } from '../helpers.js'
import prompts from 'prompts'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { initCommand } from '../../src/commands/init.js'
import { setConfig, getLocalConfig } from '../../src/lib/config.js'

test.group('Init Command', (group) => {
  group.each.setup(() => {
    const env = setupEnvironment()
    return () => env.cleanup()
  })

  test('create a new project successfully', async ({ assert }) => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    setConfig('authToken', 'test-token')
    setConfig('publicKey', publicKey)

    const restoreFetch = mockFetch(async (url, init: any) => {
      if (url.endsWith('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            teams: [{ id: 'team_1', name: 'Test Team' }],
            user: { publicKey: publicKey }
          })
        }
      }
      if (url.endsWith('/projects') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'proj_1', name: 'test-project' })
        }
      }
      if (url.includes('/keys/') && url.endsWith('/setup') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({})
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject(['create', 'team_1', 'test-project'])

    await initCommand.parseAsync([], { from: 'user' })

    const configPath = path.resolve(process.cwd(), '.gitgone')
    assert.isTrue(fs.existsSync(configPath), '.gitgone file should be created')
    
    const localConfig = getLocalConfig()
    assert.equal(localConfig?.projectId, 'proj_1')


    
    restoreFetch()
  })

  test('link an existing project successfully', async ({ assert }) => {
    setConfig('authToken', 'test-token')
    
    const restoreFetch = mockFetch(async (url) => {
      if (url.endsWith('/api/projects')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: 'proj_1', name: 'Project 1', team: { name: 'Team A' } },
            { id: 'proj_2', name: 'Project 2', team: { name: 'Team B' } },
          ])
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    })

    prompts.inject(['link', 'proj_2'])

    await initCommand.parseAsync([], { from: 'user' })

    const configPath = path.resolve(process.cwd(), '.gitgone')
    assert.isTrue(fs.existsSync(configPath), '.gitgone file should be created')
    
    const localConfig = getLocalConfig()
    assert.equal(localConfig?.projectId, 'proj_2')

    restoreFetch()
  })
})
