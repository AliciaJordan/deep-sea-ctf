import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { seedStarterChallenges } from './admin-challenges'

const starterIds = [
  'starter-message-in-a-bottle',
  'starter-radio-operators-log',
  'starter-harbor-office',
]

describe('starter challenge flags', () => {
  it('updates existing verifier hashes from the private runtime secret', async () => {
    const flags = Object.fromEntries(starterIds.map((id) => [id, `ocean{${'x'.repeat(24)}}`]))
    const update = vi.fn().mockResolvedValue({ success: true, data: {} })
    const tools = {
      get: vi.fn().mockResolvedValue({
        success: true,
        data: { record: { recordId: 'challenge', data: {} } },
      }),
      query: vi.fn().mockImplementation(async (_collection: string, options: { where: { challengeId: string } }) => ({
        success: true,
        data: {
          records: [{
            recordId: `secret-${options.where.challengeId}`,
            data: { challengeId: options.where.challengeId, flagMac: 'outdated-verifier' },
          }],
        },
      })),
      update,
    } as unknown as Parameters<typeof seedStarterChallenges>[0]['tools']

    const result = await seedStarterChallenges({
      userId: 'owner',
      params: {},
      tools,
      env: {
        OWNER_USER_ID: 'owner',
        CTF_FLAG_HMAC_KEY: 'test-key',
        CTF_STARTER_FLAGS_B64: btoa(JSON.stringify(flags)),
      } as Env,
      callerJwt: 'owner-token',
    })

    expect(result).toMatchObject({ success: true })
    expect(JSON.stringify(result)).toContain('"rotated":3')
    expect(update).toHaveBeenCalledTimes(starterIds.length)
    expect(JSON.stringify(update.mock.calls)).not.toContain('ocean{')
  })

  it('requires the private runtime secret instead of falling back to source flags', async () => {
    const get = vi.fn()
    const tools = { get } as unknown as Parameters<typeof seedStarterChallenges>[0]['tools']
    const result = await seedStarterChallenges({
      userId: 'owner',
      params: {},
      tools,
      env: { OWNER_USER_ID: 'owner', CTF_FLAG_HMAC_KEY: 'test-key' } as Env,
      callerJwt: 'owner-token',
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Starter challenge flags are not configured.',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
