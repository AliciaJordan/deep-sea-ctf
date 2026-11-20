import { test, expect } from '@playwright/test'
import { canCreate, canRead, canUpdate } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../worker'
import { adminListChallenges, createChallenge, seedStarterChallenges, setPublished } from '../src/actions/admin-challenges'
import { listChallenges, submitFlag } from '../src/actions/submit-flag'
import { challengesSchema, challengeSecretsSchema, solvesSchema, submissionsSchema } from '../src/schemas/ctf-schema'
import { usersSchema } from '../src/schemas/users-schema'
import { tallySolves } from '../src/lib/solve-scoring'

const playerId = 'player-one'
const ownerId = 'app-owner'

function row(data: Record<string, unknown>, createdBy = ownerId) {
  return { data, createdBy, recordId: 'test-row' }
}

test.describe('API tests', () => {
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
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode('flag{correct}'))
    const expectedMac = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const challengeId = 'challenge-one'
    const storedSolves: Array<{ recordId: string; data: Record<string, unknown> }> = []
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
        if (collection === 'submissions') return { success: true, data: { records: [], count: 0 } }
        if (collection === 'challengeSecrets') return { success: true, data: { records: [{
          recordId: 'secret-one', data: { challengeId, flagMac: expectedMac },
        }], count: 1 } }
        if (collection === 'solves' && options.where?.userId === playerId) {
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
      remove: async (_collection: string, recordId: string) => ({ success: true, data: { recordId } }),
    } as unknown as ActionTools

    const results = await Promise.all(Array.from({ length: 10 }, () => submitFlag({
      userId: playerId,
      params: { challengeId, flag: '  flag{correct}  ' },
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
    const flag = 'flag{owner-created}'
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
    const wrong = await submitFlag({ userId: playerId, params: { challengeId, flag: 'flag{wrong}' }, tools, env, callerJwt: 'player-token' })
    expect(correct.success).toBe(true)
    expect(wrong.success).toBe(true)
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

  test('owner can load starter challenges once and submit the private log flag', async () => {
    const key = 'test-hmac-key'
    const challenges: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const secrets: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const solves: Array<{ recordId: string; data: Record<string, unknown> }> = []
    const otherRecords = new Map<string, Array<{ recordId: string; data: Record<string, unknown> }>>()
    let nextId = 0
    const rows = (collection: string) => collection === 'challenges' ? challenges
      : collection === 'challengeSecrets' ? secrets
        : collection === 'solves' ? solves
          : otherRecords.get(collection) ?? []
    const tools = {
      create: async (collection: string, data: Record<string, unknown>, recordId?: string) => {
        const collectionRows = rows(collection)
        if (recordId && collectionRows.some((record) => record.recordId === recordId)) {
          return { success: false, error: 'Duplicate record ID.' }
        }
        const record = { recordId: recordId ?? `record-${++nextId}`, data: { ...data } }
        if (collection === 'challengeSecrets' && secrets.some((item) => item.data.challengeId === data.challengeId)) {
          return { success: false, error: 'Duplicate challenge secret.' }
        }
        if (collection === 'solves' && solves.some((item) =>
          item.data.userId === data.userId && item.data.challengeId === data.challengeId,
        )) return { success: false, error: 'Duplicate solve.' }
        if (!otherRecords.has(collection) && !['challenges', 'challengeSecrets', 'solves'].includes(collection)) {
          otherRecords.set(collection, [])
        }
        collectionRows.push(record)
        return { success: true, data: { recordId: record.recordId } }
      },
      get: async (collection: string, recordId: string) => {
        const record = rows(collection).find((item) => item.recordId === recordId)
        return record ? { success: true, data: { record } } : { success: false, error: 'Not found' }
      },
      query: async (collection: string, options: { where?: Record<string, unknown> } = {}) => {
        const records = rows(collection).filter(({ data }) =>
          !options.where || Object.entries(options.where).every(([field, value]) => data[field] === value),
        )
        return { success: true, data: { records: [...records], count: records.length } }
      },
      remove: async (collection: string, recordId: string) => {
        const collectionRows = rows(collection)
        const index = collectionRows.findIndex((record) => record.recordId === recordId)
        if (index >= 0) collectionRows.splice(index, 1)
        return { success: true, data: { recordId } }
      },
    } as unknown as ActionTools
    const env = { OWNER_USER_ID: ownerId, CTF_FLAG_HMAC_KEY: key } as Env
    const denied = await seedStarterChallenges({ userId: playerId, params: {}, tools, env, callerJwt: 'player-token' })
    expect(denied.success).toBe(false)
    expect(challenges).toHaveLength(0)

    const seeded = await seedStarterChallenges({ userId: ownerId, params: {}, tools, env, callerJwt: 'owner-token' })
    const seededAgain = await seedStarterChallenges({ userId: ownerId, params: {}, tools, env, callerJwt: 'owner-token' })
    expect(seeded).toEqual({ success: true, data: { created: 3, total: 3 } })
    expect(seededAgain).toEqual({ success: true, data: { created: 0, total: 3 } })
    expect(challenges).toHaveLength(3)
    expect(secrets).toHaveLength(3)

    const visible = await listChallenges({ userId: playerId, params: {}, tools, env, callerJwt: 'player-token' })
    expect(visible.success && visible.data?.challenges).toHaveLength(3)
    const logChallenge = challenges.find(({ recordId }) => recordId === 'starter-radio-operators-log')
    expect(logChallenge).toBeDefined()
    const solved = await submitFlag({
      userId: playerId,
      params: { challengeId: 'starter-radio-operators-log', flag: 'ocean{distant-buoy-7b0c11}' },
      tools,
      env,
      callerJwt: 'player-token',
    })
    expect(solved).toEqual({ success: true, data: { correct: true, alreadySolved: false } })
    expect(solves).toHaveLength(1)
    expect(JSON.stringify([seeded, seededAgain, visible, challenges, secrets, solved]))
      .not.toContain('ocean{distant-buoy-7b0c11}')
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
      params: { challengeId, flag: 'flag{wrong}' },
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
