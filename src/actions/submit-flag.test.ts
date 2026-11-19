import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { tallySolves } from '../lib/solve-scoring'
import { submitFlag } from './submit-flag'

describe('submitFlag scoring', () => {
  it('counts ten parallel correct submissions once and derives firstSolve from time', async () => {
    const userId = 'player-1'
    const challengeId = 'challenge-1'
    const key = 'unit-test-hmac-key'
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode('flag{correct}'))
    const expectedMac = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const storedSolves: Array<{ recordId: string; data: Record<string, unknown> }> = []
    let ownSolveReads = 0
    let releaseOwnReads!: () => void
    const allOwnReads = new Promise<void>((resolve) => { releaseOwnReads = resolve })
    let recordNumber = 0

    const tools = {
      get: async () => ({ success: true, data: { record: {
        recordId: challengeId,
        data: { published: true, releaseAt: '2020-01-01T00:00:00.000Z', points: 100 },
      } } }),
      query: async (collection: string, options: { where?: Record<string, unknown> } = {}) => {
        if (collection === 'submissions') return { success: true, data: { records: [], count: 0 } }
        if (collection === 'challengeSecrets') return { success: true, data: { records: [{
          recordId: 'secret-1', data: { challengeId, flagMac: expectedMac },
        }], count: 1 } }
        if (collection === 'solves' && options.where?.userId === userId) {
          ownSolveReads++
          if (ownSolveReads === 10) releaseOwnReads()
          await allOwnReads
          return { success: true, data: { records: [], count: 0 } }
        }
        return { success: true, data: { records: storedSolves.map((record) => ({ ...record })), count: storedSolves.length } }
      },
      create: async (collection: string, data: Record<string, unknown>) => {
        recordNumber++
        const recordId = `${collection}-${recordNumber}`
        if (collection === 'solves') storedSolves.push({ recordId, data: { ...data, firstSolve: false } })
        return { success: true, data: { recordId } }
      },
    } as unknown as ActionTools

    const results = await Promise.all(Array.from({ length: 10 }, () => submitFlag({
      userId,
      params: { challengeId, flag: '  flag{correct}  ' },
      tools,
      env: { CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'test-token',
    })))

    const counted = tallySolves(storedSolves.map((record) => ({
      ...record,
      data: record.data as { userId: string; challengeId: string; points: number; solvedAt: string; firstSolve: boolean },
    })))
    expect(results.filter((result) => result.success)).toHaveLength(10)
    expect(storedSolves).toHaveLength(10)
    expect(counted.countedSolves).toHaveLength(1)
    expect(counted.totals.get(userId)).toBe(100)
    expect(counted.countedSolves[0].firstSolve).toBe(true)
  })
})
