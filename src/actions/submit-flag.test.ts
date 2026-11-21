import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { flagMac } from '../lib/flag-mac'
import { getChallenge, listChallenges, submitFlag } from './submit-flag'

function randomFlag(): string {
  return ['ocean', '{', crypto.randomUUID().replaceAll('-', ''), '}'].join('')
}

const challenge = {
  title: 'Lost Signal',
  category: 'FORENSICS',
  difficulty: 2,
  points: 200,
  description: 'Inspect the recovered transmission.',
  releaseAt: new Date().toISOString(),
  published: true,
  writeup: 'Decode the payload to recover the signal.',
}

function toolsWithSolveCount(solveCount: number, authorId?: string, published = true) {
  return {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: {
        record: {
          recordId: 'challenge-1',
          data: { ...challenge, published, ...(authorId ? { authorId } : {}) },
        },
      },
    }),
    query: vi.fn().mockImplementation(async (collection: string) => ({
      success: true,
      data: {
        records: collection === 'solves'
          ? Array.from({ length: solveCount }, (_, index) => ({ recordId: `solve-${index}`, data: {} }))
          : [{ recordId: 'challenge-1', data: { ...challenge, published } }],
      },
    })),
  } as unknown as Parameters<typeof getChallenge>[0]['tools']
}

describe('community challenge solution visibility', () => {
  it('does not return a write-up to an unsolved player', async () => {
    const tools = toolsWithSolveCount(0)
    const result = await getChallenge({
      userId: 'player-1',
      params: { challengeId: 'challenge-1' },
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'player-token',
    })

    expect(result.success).toBe(true)
    expect(JSON.stringify(result)).not.toContain('"writeup"')
  })

  it('returns a write-up after the player has solved the challenge', async () => {
    const tools = toolsWithSolveCount(1)
    const result = await getChallenge({
      userId: 'player-1',
      params: { challengeId: 'challenge-1' },
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'player-token',
    })

    expect(result.success).toBe(true)
    expect(JSON.stringify(result)).toContain(challenge.writeup)
  })

  it('never includes a write-up in the public challenge listing', async () => {
    const tools = toolsWithSolveCount(0)
    const result = await listChallenges({
      userId: 'player-1',
      params: {},
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'player-token',
    })

    expect(result.success).toBe(true)
    expect(JSON.stringify(result)).not.toContain('"writeup"')
  })

  it('keeps submissions under review out of the public listing', async () => {
    const tools = toolsWithSolveCount(0, undefined, false)
    const result = await listChallenges({
      userId: 'player-1',
      params: {},
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'player-token',
    })

    expect(result).toMatchObject({ success: true, data: { challenges: [] } })
  })

  it('prevents a challenge author from scoring their own flag', async () => {
    const tools = toolsWithSolveCount(0, 'player-1')
    const result = await submitFlag({
      userId: 'player-1',
      params: { challengeId: 'challenge-1', flag: randomFlag() },
      tools,
      env: { OWNER_USER_ID: 'owner-1', CTF_FLAG_HMAC_KEY: 'test-key' } as Env,
      callerJwt: 'player-token',
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Challenge authors cannot submit their own flags.',
    })
    expect(tools.query).not.toHaveBeenCalled()
  })
})

describe('flag submission idempotency', () => {
  it('creates only one submission row for repeated correct flags', async () => {
    const flag = randomFlag()
    const key = crypto.randomUUID()
    const cryptoKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(flag))
    const flagMac = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const solves: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const submissions: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const claims: Array<{ recordId: string; data: Record<string, unknown> }> = []
    let nextId = 0
    const tools = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { record: { recordId: 'challenge-1', data: { ...challenge } } },
      }),
      query: vi.fn().mockImplementation(async (collection: string, options?: { where?: Record<string, unknown> }) => {
        const records = collection === 'challengeSecrets'
          ? [{ recordId: 'secret-1', data: { challengeId: 'challenge-1', flagMac } }]
          : collection === 'solves'
            ? solves.filter(({ data }) =>
                !options?.where || Object.entries(options.where).every(([field, value]) => data[field] === value),
              )
            : claims
        return { success: true, data: { records, count: records.length } }
      }),
      create: vi.fn().mockImplementation(async (collection: string, data: Record<string, unknown>) => {
        const record = { recordId: `${collection}-${++nextId}`, data }
        if (collection === 'solves') solves.push(record)
        if (collection === 'submissions') submissions.push(record)
        if (collection === 'attemptClaims') claims.push(record)
        return { success: true, data: { recordId: record.recordId } }
      }),
      remove: vi.fn().mockImplementation(async (_collection: string, recordId: string) => {
        const index = claims.findIndex((claim) => claim.recordId === recordId)
        if (index >= 0) claims.splice(index, 1)
        return { success: true, data: { recordId } }
      }),
    } as unknown as Parameters<typeof submitFlag>[0]['tools']

    const args = {
      userId: 'player-1',
      params: { challengeId: 'challenge-1', flag },
      tools,
      env: { OWNER_USER_ID: 'owner-1', CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'player-token',
    }

    const first = await submitFlag(args)
    const repeated = await submitFlag(args)

    expect(first).toMatchObject({ success: true, data: { correct: true, alreadySolved: false } })
    expect(repeated).toMatchObject({ success: true, data: { correct: true, alreadySolved: true } })
    expect(submissions).toHaveLength(1)
  })
})

describe('flag attempt feedback', () => {
  it('reports remaining attempts and the lockout end after five wrong flags', async () => {
    const key = crypto.randomUUID()
    const flag = await flagMac(randomFlag(), key)
    const claims: Array<{ recordId: string; data: { userId: string; challengeId: string; bucket: number; slot: number; ts: string } }> = []
    let nextId = 0
    const tools = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { record: { recordId: 'challenge-1', data: { ...challenge } } },
      }),
      query: vi.fn().mockImplementation(async (collection: string) => {
        const records = collection === 'challengeSecrets'
          ? [{ recordId: 'secret-1', data: { challengeId: 'challenge-1', flagMac: flag } }]
          : collection === 'attemptClaims' ? claims : []
        return { success: true, data: { records, count: records.length } }
      }),
      create: vi.fn().mockImplementation(async (collection: string, data: Record<string, unknown>) => {
        const record = { recordId: `${collection}-${++nextId}`, data }
        if (collection === 'attemptClaims') claims.push(record as typeof claims[number])
        return { success: true, data: { recordId: record.recordId } }
      }),
      remove: vi.fn().mockResolvedValue({ success: true, data: { recordId: 'claim' } }),
    } as unknown as Parameters<typeof submitFlag>[0]['tools']
    const args = {
      userId: 'player-1',
      params: { challengeId: 'challenge-1', flag: 'ocean{incorrect}' },
      tools,
      env: { OWNER_USER_ID: 'owner-1', CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'player-token',
    }

    let fifthAttempt: Awaited<ReturnType<typeof submitFlag>> | undefined
    for (let remaining = 4; remaining >= 0; remaining--) {
      fifthAttempt = await submitFlag(args)
      expect(fifthAttempt).toMatchObject({
        success: true,
        data: { correct: false, attemptsRemaining: remaining },
      })
    }
    expect(fifthAttempt).toMatchObject({
      success: true,
      data: { correct: false, attemptsRemaining: 0, retryAt: expect.any(String) },
    })

    const blocked = await submitFlag(args)
    expect(blocked).toMatchObject({
      success: false,
      error: expect.stringContaining('Try again after'),
    })
  })
})
