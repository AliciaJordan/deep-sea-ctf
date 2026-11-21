import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { canCreate, canRead, canUpdate } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../worker'
import { adminListChallenges, createChallenge, setPublished } from '../src/actions/admin-challenges'
import { listChallenges, submitFlag } from '../src/actions/submit-flag'
import { challengesSchema, challengeSecretsSchema, solvesSchema, submissionsSchema } from '../src/schemas/ctf-schema'
import { usersSchema } from '../src/schemas/users-schema'
import { tallySolves } from '../src/lib/solve-scoring'

const playerId = 'player-one'
const ownerId = 'app-owner'

function row(data: Record<string, unknown>, createdBy = ownerId) {
  return { data, createdBy, recordId: 'test-row' }
}

function randomFlag(): string {
  return ['flag', '{', crypto.randomUUID(), '}'].join('')
}

test.describe('API tests', () => {
  test('rejects unlisted integration endpoints for signed-in non-owners', async ({ users, request }) => {
    const availableAccounts = loadAllTestAccounts().length
    test.skip(availableAccounts === 0, 'Create a DeepSpace test account to run authenticated API tests.')

    const testUsers = await users(availableAccounts)
    let nonOwnerHeaders: Record<string, string> | null = null
    for (const user of testUsers) {
      await user.page.goto('/home')
      await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

      const token = await user.page.evaluate(async () => {
        const response = await fetch('/api/auth/token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!response.ok) return null
        const body = await response.json() as { token?: string }
        return body.token ?? null
      })
      expect(token).toBeTruthy()
      const headers = { Authorization: `Bearer ${token}` }
      const ownerCheck = await request.post('/api/actions/isOwner', { headers, data: {} })
      expect(ownerCheck.ok()).toBe(true)
      const ownerResult = await ownerCheck.json() as { success: boolean; data: boolean }
      expect(ownerResult.success).toBe(true)
      if (!ownerResult.data) {
        nonOwnerHeaders = headers
        break
      }
    }
    if (!nonOwnerHeaders) {
      test.skip(true, 'The available test accounts do not include a non-owner.')
      return
    }

    const response = await request.post('/api/integrations/unlisted/test-endpoint', {
      headers: nonOwnerHeaders,
      data: {},
    })
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Integration endpoint is not allowed' })
  })

  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })

  test('10 parallel correct submissions count one solve and award points once', async () => {
    const key = 'test-hmac-key'
    const correctFlag = randomFlag()
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(correctFlag))
    const expectedMac = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const challengeId = 'challenge-one'
    const storedSolves: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const storedSubmissions: Array<{ recordId: string; data: Record<string, unknown> }> = []
    let ownSolveReads = 0
    let releaseOwnReads!: () => void
    const allOwnReads = new Promise<void>((resolve) => { releaseOwnReads = resolve })
    let recordNumber = 0
    const tools = {
      get: async () => ({ success: true, data: { record: {
        recordId: challengeId,
        data: { published: 1, releaseAt: '2020-01-01T00:00:00.000Z', points: 100 },
      } } }),
      query: async (collection: string, options: { where?: Record<string, unknown> } = {}) => {
        if (collection === 'challengeSecrets') return { success: true, data: { records: [{
          recordId: 'secret-one', data: { challengeId, flagMac: expectedMac },
        }], count: 1 } }
        if (collection === 'solves' && options.where?.userId === playerId) {
          if (ownSolveReads < 10) {
            ownSolveReads++
            if (ownSolveReads === 10) releaseOwnReads()
            await allOwnReads
            return { success: true, data: { records: [], count: 0 } }
          }
          const own = storedSolves.filter(({ data }) => data.userId === playerId)
          return { success: true, data: { records: own, count: own.length } }
        }
        return { success: true, data: { records: storedSolves.map((record) => ({ ...record })), count: storedSolves.length } }
      },
      create: async (collection: string, data: Record<string, unknown>) => {
        recordNumber++
        const recordId = `${collection}-${recordNumber}`
        if (collection === 'solves') {
          if (storedSolves.some((solve) => solve.data.userId === data.userId && solve.data.challengeId === data.challengeId)) {
            return { success: false, error: 'Duplicate solve.' }
          }
          storedSolves.push({ recordId, data: { ...data, firstSolve: false } })
        }
        if (collection === 'submissions') storedSubmissions.push({ recordId, data: { ...data } })
        return { success: true, data: { recordId } }
      },
      remove: async (_collection: string, recordId: string) => ({ success: true, data: { recordId } }),
    } as unknown as ActionTools

    const results = await Promise.all(Array.from({ length: 10 }, () => submitFlag({
      userId: playerId,
      params: { challengeId, flag: `  ${correctFlag}  ` },
      tools,
      env: { CTF_FLAG_HMAC_KEY: key } as Env,
      callerJwt: 'test-token',
    })))
    expect(results.filter((result) => result.success && result.data?.correct === true)).toHaveLength(10)
    const counted = tallySolves(storedSolves.map((solve) => ({
      ...solve,
      data: solve.data as { userId: string; challengeId: string; points: number; solvedAt: string; firstSolve: boolean },
    })))
    expect(results.every((result) => result.success)).toBe(true)
    expect(counted.countedSolves).toHaveLength(1)
    expect(counted.totals.get(playerId)).toBe(100)
    expect(storedSubmissions).toHaveLength(1)
  })

  test('player collection reads and writes are restricted; owner retains admin challenge access', () => {
    const unpublished = row({ published: false, releaseAt: '2020-01-01T00:00:00.000Z' })
    const unreleased = row({ published: true, releaseAt: '2999-01-01T00:00:00.000Z' })
    const secret = row({ challengeId: 'challenge-one', flagMac: 'mac' })
    const otherSubmission = row({ userId: 'player-two', challengeId: 'challenge-one' })
    const ownSubmission = row({ userId: playerId, challengeId: 'challenge-one' })
    const solve = row({ userId: playerId, challengeId: 'challenge-one', points: 100 })

    expect(canRead(challengesSchema, 'player', unpublished, playerId)).toBe(false)
    expect(canRead(challengesSchema, 'player', unreleased, playerId)).toBe(false)
    expect(canRead(challengesSchema, 'admin', unpublished, ownerId)).toBe(true)
    expect(canRead(challengeSecretsSchema, 'player', secret, playerId)).toBe(false)
    expect(canRead(challengeSecretsSchema, 'admin', secret, ownerId)).toBe(false)
    expect(canRead(submissionsSchema, 'player', otherSubmission, playerId)).toBe(false)
    expect(canRead(submissionsSchema, 'player', ownSubmission, playerId)).toBe(true)
    expect(canCreate(submissionsSchema, 'player')).toBe(false)
    expect(canCreate(solvesSchema, 'player')).toBe(false)
    expect(canCreate(solvesSchema, 'admin')).toBe(false)
    expect(canUpdate(solvesSchema, 'player', solve, playerId)).toBe(false)
  })

  test('admin challenge actions deny non-owners and keep flags and MACs private', async () => {
    const key = 'test-hmac-key'
    const flag = randomFlag()
    const challengeRecords: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const secretRecords: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const submissionRecords: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const solveRecords: Array<{ recordId: string; data: Record<string, unknown> }> = []
    let nextId = 0
    const tools = {
      create: async (collection: string, data: Record<string, unknown>) => {
        const record = { recordId: `created-${++nextId}`, data: { ...data } }
        if (collection === 'challenges') challengeRecords.push(record)
        if (collection === 'challengeSecrets') secretRecords.push(record)
        if (collection === 'submissions') submissionRecords.push(record)
        if (collection === 'solves') solveRecords.push(record)
        return { success: true, data: { recordId: record.recordId } }
      },
      get: async (collection: string, recordId: string) => {
        const record = (collection === 'challenges' ? challengeRecords : secretRecords).find((item) => item.recordId === recordId)
        return record ? { success: true, data: { record } } : { success: false, error: 'Not found' }
      },
      query: async (collection: string, options: { where?: Record<string, unknown> } = {}) => {
        const records = collection === 'challenges' ? challengeRecords
          : collection === 'challengeSecrets' ? secretRecords
            : collection === 'submissions' ? submissionRecords : solveRecords
        return { success: true, data: { records: records.filter(({ data }) =>
          !options.where || Object.entries(options.where).every(([field, value]) => data[field] === value),
        ), count: records.length } }
      },
      update: async (_collection: string, recordId: string, data: Record<string, unknown>) => {
        const record = challengeRecords.find((item) => item.recordId === recordId)
        if (!record) return { success: false, error: 'Not found' }
        Object.assign(record.data, data)
        return { success: true, data: { recordId } }
      },
      remove: async (_collection: string, recordId: string) => {
        const index = challengeRecords.findIndex((record) => record.recordId === recordId)
        if (index >= 0) challengeRecords.splice(index, 1)
        return { success: true, data: { recordId } }
      },
    } as unknown as ActionTools
    const env = { OWNER_USER_ID: ownerId, CTF_FLAG_HMAC_KEY: key } as Env
    const params = {
      title: 'Owner signal', category: 'SONAR', difficulty: 1, points: 125,
      description: 'A test return.', flag, releaseAt: new Date(Date.now() - 1000).toISOString(), published: false,
    }
    for (const action of [createChallenge, adminListChallenges, setPublished]) {
      const result = await action({ userId: playerId, params, tools, env, callerJwt: 'player-token' })
      expect(result.success).toBe(false)
      expect(JSON.stringify(result)).not.toContain(flag)
    }

    const created = await createChallenge({ userId: ownerId, params, tools, env, callerJwt: 'owner-token' })
    expect(created.success).toBe(true)
    const challengeId = (created as { data: { challengeId: string } }).data.challengeId
    const mac = secretRecords[0].data.flagMac as string
    const adminList = await adminListChallenges({ userId: ownerId, params: {}, tools, env, callerJwt: 'owner-token' })
    expect((adminList as { data: { challenges: unknown[] } }).data.challenges).toHaveLength(1)
    const hidden = await listChallenges({ userId: playerId, params: {}, tools, env, callerJwt: 'player-token' })
    expect((hidden as { data: { challenges: unknown[] } }).data.challenges).toHaveLength(0)
    const publishResult = await setPublished({
      userId: ownerId, params: { challengeId, published: true }, tools, env, callerJwt: 'owner-token',
    })
    expect(publishResult.success).toBe(true)
    const visible = await listChallenges({ userId: playerId, params: {}, tools, env, callerJwt: 'player-token' })
    expect((visible as { data: { challenges: unknown[] } }).data.challenges).toHaveLength(1)
    const correct = await submitFlag({ userId: playerId, params: { challengeId, flag }, tools, env, callerJwt: 'player-token' })
    const wrong = await submitFlag({ userId: playerId, params: { challengeId, flag: randomFlag() }, tools, env, callerJwt: 'player-token' })
    expect(correct.success).toBe(true)
    expect(wrong).toMatchObject({ success: true, data: { correct: true, alreadySolved: true } })
    expect(JSON.stringify([created, adminList, hidden, publishResult, visible, correct, wrong])).not.toContain(flag)
    expect(JSON.stringify([created, adminList, hidden, publishResult, visible, correct, wrong])).not.toContain(mac)
  })

  test('published number-backed challenges appear on the board', async () => {
    const records = [
      row({ published: 1, releaseAt: '2020-01-01T00:00:00.000Z', title: 'Released' }),
      row({ published: 0, releaseAt: '2020-01-01T00:00:00.000Z', title: 'Draft' }),
      row({ published: true, releaseAt: '2999-01-01T00:00:00.000Z', title: 'Future' }),
    ]
    const tools = {
      query: async () => ({ success: true, data: { records, count: records.length } }),
    } as unknown as ActionTools

    const result = await listChallenges({
      userId: playerId, params: {}, tools, env: {} as Env, callerJwt: 'player-token',
    })
    expect(result.success && result.data?.challenges.map((challenge) => challenge.title)).toEqual(['Released'])
  })

  test('parallel wrong submissions cannot reserve more than five attempts in one minute', async () => {
    const challengeId = 'rate-limited-challenge'
    const claimRows: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const claimKeys = new Set<string>()
    const submissionRows: Array<{ recordId: string; data: Record<string, unknown> }> = []
    let nextId = 0
    const tools = {
      get: async () => ({ success: true, data: { record: {
        recordId: challengeId,
        data: { published: 1, releaseAt: '2020-01-01T00:00:00.000Z', points: 100 },
      } } }),
      query: async (collection: string) => {
        const records = collection === 'challengeSecrets'
          ? [{ recordId: 'secret-one', data: { challengeId, flagMac: '00'.repeat(32) } }]
          : collection === 'attemptClaims' ? claimRows : []
        return { success: true, data: { records: [...records], count: records.length } }
      },
      create: async (collection: string, data: Record<string, unknown>) => {
        if (collection === 'attemptClaims') {
          const key = [data.userId, data.challengeId, data.bucket, data.slot].join(':')
          if (claimKeys.has(key)) return { success: false, error: 'Duplicate attempt slot.' }
          claimKeys.add(key)
          const record = { recordId: `claim-${++nextId}`, data: { ...data } }
          claimRows.push(record)
          return { success: true, data: { recordId: record.recordId } }
        }
        const record = { recordId: `submission-${++nextId}`, data: { ...data } }
        submissionRows.push(record)
        return { success: true, data: { recordId: record.recordId } }
      },
      remove: async (_collection: string, recordId: string) => ({ success: true, data: { recordId } }),
    } as unknown as ActionTools

    const results = await Promise.all(Array.from({ length: 10 }, () => submitFlag({
      userId: playerId,
      params: { challengeId, flag: randomFlag() },
      tools,
      env: { CTF_FLAG_HMAC_KEY: 'test-hmac-key' } as Env,
      callerJwt: 'player-token',
    })))

    expect(claimRows).toHaveLength(5)
    expect(submissionRows).toHaveLength(5)
    expect(results.filter((result) => result.success && result.data?.correct === false)).toHaveLength(5)
    expect(results.filter((result) => !result.success)).toHaveLength(5)
  })

  test('player cannot promote their own users record or write role-like fields', () => {
    const ownUser = row({ role: 'player', isAdmin: false, admin: false, permissions: 'player' }, playerId)
    expect(canUpdate(usersSchema, 'player', ownUser, playerId)).toBe(false)
    expect(usersSchema.columns.some((column) => ['isAdmin', 'admin', 'permissions'].includes(column.name))).toBe(false)
  })
})
