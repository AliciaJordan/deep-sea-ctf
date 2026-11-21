import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { flagMac } from '../lib/flag-mac'
import { updateChallengeFlag } from './admin-challenges'

const challengeId = 'challenge-1'
const flag = 'ocean{silent-current-af20d4}'
const key = 'test-hmac-key'

function toolsMock() {
  return {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: { record: { recordId: challengeId, data: { title: 'Message in a Bottle' } } },
    }),
    query: vi.fn().mockResolvedValue({
      success: true,
      data: { records: [{ recordId: 'secret-1', data: { challengeId, flagMac: 'old-mac' } }] },
    }),
    update: vi.fn().mockResolvedValue({ success: true, data: { recordId: 'secret-1' } }),
  } as unknown as Parameters<typeof updateChallengeFlag>[0]['tools']
}

describe('admin challenge flag updates', () => {
  it('updates only the stored HMAC for an existing challenge', async () => {
    const tools = toolsMock()
    const result = await updateChallengeFlag({
      userId: 'owner-1',
      params: { challengeId, flag },
      tools,
      env: { OWNER_USER_ID: 'owner-1', CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'owner-token',
    })

    expect(result).toMatchObject({ success: true, data: { challengeId } })
    expect(tools.update).toHaveBeenCalledWith('challengeSecrets', 'secret-1', {
      flagMac: await flagMac(flag, key),
    })
  })

  it('rejects non-owners before reading or updating challenge data', async () => {
    const tools = toolsMock()
    const result = await updateChallengeFlag({
      userId: 'player-1',
      params: { challengeId, flag },
      tools,
      env: { OWNER_USER_ID: 'owner-1', CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'player-token',
    })

    expect(result).toMatchObject({ success: false, error: 'Forbidden.' })
    expect(tools.get).not.toHaveBeenCalled()
    expect(tools.query).not.toHaveBeenCalled()
    expect(tools.update).not.toHaveBeenCalled()
  })
})
