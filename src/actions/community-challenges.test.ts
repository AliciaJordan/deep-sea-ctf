import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { createCommunityChallenge, deleteRejectedChallenge } from './community-challenges'

function randomFlag(): string {
  return ['ocean', '{', crypto.randomUUID().replaceAll('-', ''), '}'].join('')
}

const params = {
  title: 'Lost Signal',
  category: 'FORENSICS',
  difficulty: 2,
  description: 'Inspect the recovered transmission.',
  flag: randomFlag(),
  writeup: 'Decode the payload to recover the signal.',
}

describe('community challenge submission', () => {
  it('stores a pending challenge and only a keyed flag verifier', async () => {
    const records: Array<{ collection: string; data: Record<string, unknown> }> = []
    const tools = {
      create: vi.fn(async (collection: string, data: Record<string, unknown>) => {
        records.push({ collection, data })
        return { success: true as const, data: { recordId: collection === 'challenges' ? 'community-1' : 'secret-1' } }
      }),
    } as unknown as Parameters<typeof createCommunityChallenge>[0]['tools']

    const result = await createCommunityChallenge({
      userId: 'player-1',
      params,
      tools,
      env: { CTF_FLAG_HMAC_KEY: 'test-key' } as Env,
      callerJwt: 'player-token',
    })

    expect(result).toMatchObject({ success: true, data: { reviewStatus: 'pending' } })
    expect(records[0]).toMatchObject({
      collection: 'challenges',
      data: { authorId: 'player-1', published: false, reviewStatus: 'pending', points: 0 },
    })
    expect(JSON.stringify(records)).not.toContain(params.flag)
    expect(records[1].collection).toBe('challengeSecrets')
    expect(records[1].data).toHaveProperty('flagMac')
  })

  it('rejects anonymous challenge submissions before writing records', async () => {
    const create = vi.fn()
    const tools = { create } as unknown as Parameters<typeof createCommunityChallenge>[0]['tools']
    const result = await createCommunityChallenge({
      userId: 'anon-visitor',
      params,
      tools,
      env: { CTF_FLAG_HMAC_KEY: 'test-key' } as Env,
      callerJwt: 'visitor-token',
    })

    expect(result).toMatchObject({ success: false, error: 'Sign in to submit a challenge.' })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('rejected community challenge deletion', () => {
  it('lets the owner delete the challenge and its flag verifier', async () => {
    const tools = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { record: { recordId: 'community-1', data: { reviewStatus: 'rejected' } } },
      }),
      query: vi.fn().mockImplementation(async (collection: string) => ({
        success: true,
        data: {
          records: collection === 'challengeSecrets'
            ? [{ recordId: 'secret-1', data: { challengeId: 'community-1' } }]
            : [],
        },
      })),
      remove: vi.fn().mockResolvedValue({ success: true, data: { recordId: 'removed' } }),
    } as unknown as Parameters<typeof deleteRejectedChallenge>[0]['tools']

    const result = await deleteRejectedChallenge({
      userId: 'owner-1',
      params: { challengeId: 'community-1' },
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'owner-token',
    })

    expect(result).toMatchObject({ success: true, data: { challengeId: 'community-1' } })
    expect(tools.remove).toHaveBeenNthCalledWith(1, 'challengeSecrets', 'secret-1')
    expect(tools.remove).toHaveBeenNthCalledWith(2, 'challenges', 'community-1')
  })

  it('refuses to delete a challenge that was not rejected', async () => {
    const tools = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { record: { recordId: 'community-1', data: { reviewStatus: 'approved' } } },
      }),
      remove: vi.fn(),
    } as unknown as Parameters<typeof deleteRejectedChallenge>[0]['tools']

    const result = await deleteRejectedChallenge({
      userId: 'owner-1',
      params: { challengeId: 'community-1' },
      tools,
      env: { OWNER_USER_ID: 'owner-1' } as Env,
      callerJwt: 'owner-token',
    })

    expect(result).toMatchObject({ success: false, error: 'Rejected challenge not found.' })
    expect(tools.remove).not.toHaveBeenCalled()
  })
})
