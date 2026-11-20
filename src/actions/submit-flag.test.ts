import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { getChallenge, listChallenges, submitFlag } from './submit-flag'

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
      params: { challengeId: 'challenge-1', flag: ['ocean', '{', 'x'.repeat(8), '}'].join('') },
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
