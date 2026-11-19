import { timingSafeEqualHex } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

async function flagMac(flag: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(flag))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const listChallenges: ActionHandler<Env> = async ({ tools }) => {
  const result = await tools.query<Record<string, unknown>>('challenges', { limit: 500 })
  if (!result.success) return result
  const now = Date.now()
  const records = result.data.records
    .filter(({ data }) => data.published === true && typeof data.releaseAt === 'string' && Date.parse(data.releaseAt) <= now)
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

export const seedSampleChallenges: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) return { success: false, error: 'Forbidden.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }
  const flags = Array.isArray(params.flags) ? params.flags : []
  if (flags.length !== 2 || flags.some((flag) => typeof flag !== 'string' || !flag)) {
    return { success: false, error: 'Two sample flags are required.' }
  }
  const samples = [
    { title: 'Cold Start', category: 'SONAR', difficulty: 1, points: 100, description: 'A weak return repeats at the edge of the scan. Inspect the signal and recover the flag.' },
    { title: 'Black Box', category: 'FORENSICS', difficulty: 2, points: 200, description: 'A sealed recorder surfaced from the trench. Examine its contents and recover the flag.' },
  ]
  const seeded: string[] = []
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]
    const challenge = await tools.create('challenges', {
      ...sample, releaseAt: new Date().toISOString(), published: true,
    })
    if (!challenge.success) return challenge
    const secret = await tools.create('challengeSecrets', {
      challengeId: challenge.data.recordId,
      flagMac: await flagMac(flags[index] as string, env.CTF_FLAG_HMAC_KEY),
    })
    if (!secret.success) {
      await tools.remove('challenges', challenge.data.recordId)
      return secret
    }
    seeded.push(challenge.data.recordId)
  }
  return { success: true, data: { challengeIds: seeded } }
}

export const submitFlag: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : ''
  const flag = typeof params.flag === 'string' ? params.flag.trim() : ''
  if (!challengeId || !flag || flag.length > 512) return { success: false, error: 'Challenge and flag are required.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }

  const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!challenge.success) return { success: false, error: 'Challenge unavailable.' }
  const data = challenge.data.record.data
  if (data.published !== true || typeof data.releaseAt !== 'string' || Date.parse(data.releaseAt) > Date.now()) {
    return { success: false, error: 'Challenge unavailable.' }
  }

  const now = Date.now()
  const recent = await tools.query<{ userId: string; challengeId: string; correct: boolean; ts: string }>(
    'submissions', { where: { userId, challengeId }, orderBy: 'ts', orderDir: 'desc', limit: 500 },
  )
  if (!recent.success) return recent
  const wrongCount = recent.data.records.filter(({ data: row }) =>
    row.correct === false && now - Date.parse(row.ts) < 60_000,
  ).length
  if (wrongCount >= 5) return { success: false, error: 'Attempt limit reached. Try again in a minute.' }

  const secrets = await tools.query<{ challengeId: string; flagMac: string }>(
    'challengeSecrets', { where: { challengeId }, limit: 2 },
  )
  if (!secrets.success || secrets.data.records.length !== 1) {
    return { success: false, error: 'Challenge verification unavailable.' }
  }
  const expected = secrets.data.records[0].data.flagMac
  const actual = await flagMac(flag, env.CTF_FLAG_HMAC_KEY)
  const correct = typeof expected === 'string' && timingSafeEqualHex(actual, expected)
  const ts = new Date(now).toISOString()
  const submission = await tools.create('submissions', { userId, challengeId, correct, ts })
  if (!submission.success) return submission
  if (!correct) return { success: true, data: { correct: false } }

  const existing = await tools.query('solves', { where: { userId, challengeId }, limit: 1 })
  if (!existing.success) return existing
  if (existing.data.records.length) return { success: true, data: { correct: true, alreadySolved: true } }

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
    if (raced.success && raced.data.records.length) return { success: true, data: { correct: true, alreadySolved: true } }
    return solve
  }
  return { success: true, data: { correct: true, alreadySolved: false } }
}
