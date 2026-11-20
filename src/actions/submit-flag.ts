import { timingSafeEqualHex } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isOwner } from './admin-challenges'
import { flagMac } from '../lib/flag-mac'

function isPublished(value: unknown): boolean {
  return value === true || value === 1
}

async function reserveAttempt(
  userId: string,
  challengeId: string,
  now: number,
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
): Promise<{ success: true; recordId: string } | { success: false; error: string }> {
  const bucket = Math.floor(now / 60_000)
  const ts = new Date(now).toISOString()

  // uniqueOn is enforced by the RecordRoom on each create. If two requests
  // choose the same free slot, one wins and the other re-reads before retrying.
  for (let attempt = 0; attempt < 5; attempt++) {
    const recent = await tools.query<{ userId: string; challengeId: string; bucket: number; slot: number; ts: string }>(
      'attemptClaims', { where: { userId, challengeId }, orderBy: 'ts', orderDir: 'desc', limit: 500 },
    )
    if (!recent.success) return { success: false, error: 'Could not check the attempt limit.' }

    const stale = recent.data.records.filter(({ data }) => now - Date.parse(data.ts) >= 60_000)
    await Promise.all(stale.map(({ recordId }) => tools.remove('attemptClaims', recordId)))
    const active = recent.data.records.filter(({ data }) => now - Date.parse(data.ts) < 60_000)
    if (active.length >= 5) return { success: false, error: 'Attempt limit reached. Try again in a minute.' }

    const occupied = new Set(active
      .filter(({ data }) => data.bucket === bucket)
      .map(({ data }) => data.slot))
    const slot = [0, 1, 2, 3, 4].find((candidate) => !occupied.has(candidate))
    if (slot === undefined) return { success: false, error: 'Attempt limit reached. Try again in a minute.' }

    const claim = await tools.create('attemptClaims', { userId, challengeId, bucket, slot, ts })
    if (claim.success) return { success: true, recordId: claim.data.recordId }
  }

  return { success: false, error: 'Could not reserve a submission attempt. Please retry.' }
}

export const listChallenges: ActionHandler<Env> = async ({ tools }) => {
  const result = await tools.query<Record<string, unknown>>('challenges', { limit: 500 })
  if (!result.success) return result
  const now = Date.now()
  const records = result.data.records
    .filter(({ data }) => isPublished(data.published) && typeof data.releaseAt === 'string' && Date.parse(data.releaseAt) <= now)
    .map(({ recordId, data }) => ({
      challengeId: recordId,
      title: data.title,
      category: data.category,
      difficulty: data.difficulty,
      points: data.points,
      description: data.description,
      releaseAt: data.releaseAt,
      published: data.published,
    }))
  return { success: true, data: { challenges: records } }
}

export const getChallenge: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId.trim() : ''
  if (!challengeId) return { success: false, error: 'Challenge is required.' }

  const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!challenge.success) return { success: false, error: 'Challenge unavailable.' }
  const data = challenge.data.record.data
  if (!isPublished(data.published) || typeof data.releaseAt !== 'string' || Date.parse(data.releaseAt) > Date.now()) {
    return { success: false, error: 'Challenge unavailable.' }
  }

  let canReadWriteup = isOwner(userId, env) || data.authorId === userId
  if (!canReadWriteup && typeof data.writeup === 'string') {
    const solved = await tools.query('solves', { where: { userId, challengeId }, limit: 1 })
    if (!solved.success) return solved
    canReadWriteup = solved.data.records.length > 0
  }

  return {
    success: true,
    data: {
      challenge: {
        challengeId,
        title: data.title,
        category: data.category,
        difficulty: data.difficulty,
        points: data.points,
        description: data.description,
        canSubmit: data.authorId !== userId,
        ...(canReadWriteup && typeof data.writeup === 'string' ? { writeup: data.writeup } : {}),
      },
    },
  }
}

export const submitFlag: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : ''
  const flag = typeof params.flag === 'string' ? params.flag.trim() : ''
  if (!challengeId || !flag || flag.length > 512) return { success: false, error: 'Challenge and flag are required.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }

  const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!challenge.success) return { success: false, error: 'Challenge unavailable.' }
  const data = challenge.data.record.data
  if (!isPublished(data.published) || typeof data.releaseAt !== 'string' || Date.parse(data.releaseAt) > Date.now()) {
    return { success: false, error: 'Challenge unavailable.' }
  }
  if (data.authorId === userId) return { success: false, error: 'Challenge authors cannot submit their own flags.' }

  const existing = await tools.query('solves', { where: { userId, challengeId }, limit: 1 })
  if (!existing.success) return existing
  if (existing.data.records.length) {
    return {
      success: true,
      data: { correct: true, alreadySolved: true, ...(typeof data.writeup === 'string' ? { writeup: data.writeup } : {}) },
    }
  }

  const secrets = await tools.query<{ challengeId: string; flagMac: string }>(
    'challengeSecrets', { where: { challengeId }, limit: 2 },
  )
  if (!secrets.success || secrets.data.records.length !== 1) {
    return { success: false, error: 'Challenge verification unavailable.' }
  }

  const now = Date.now()
  const reservation = await reserveAttempt(userId, challengeId, now, tools)
  if (!reservation.success) return reservation

  const expected = secrets.data.records[0].data.flagMac
  const actual = await flagMac(flag, env.CTF_FLAG_HMAC_KEY)
  const correct = typeof expected === 'string'
    ? await timingSafeEqualHex(actual, expected)
    : false
  const ts = new Date(now).toISOString()
  if (!correct) {
    const submission = await tools.create('submissions', { userId, challengeId, correct, ts })
    if (!submission.success) return submission
    return { success: true, data: { correct: false } }
  }

  const priorSolves = await tools.query('solves', { where: { challengeId }, orderBy: 'solvedAt', orderDir: 'asc', limit: 1 })
  if (!priorSolves.success) return priorSolves
  const solve = await tools.create('solves', {
    userId,
    challengeId,
    points: Number(data.points) || 0,
    solvedAt: ts,
    firstSolve: priorSolves.data.records.length === 0,
  })
  if (!solve.success) {
    const raced = await tools.query('solves', { where: { userId, challengeId }, limit: 1 })
    if (raced.success && raced.data.records.length) {
      await tools.remove('attemptClaims', reservation.recordId)
      return {
        success: true,
        data: { correct: true, alreadySolved: true, ...(typeof data.writeup === 'string' ? { writeup: data.writeup } : {}) },
      }
    }
    return solve
  }
  const submission = await tools.create('submissions', { userId, challengeId, correct: true, ts })
  if (!submission.success) return submission
  await tools.remove('attemptClaims', reservation.recordId)
  return {
    success: true,
    data: { correct: true, alreadySolved: false, ...(typeof data.writeup === 'string' ? { writeup: data.writeup } : {}) },
  }
}
