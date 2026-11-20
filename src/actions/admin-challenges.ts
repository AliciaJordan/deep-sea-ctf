import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { flagMac } from '../lib/flag-mac'

export function isOwner(userId: string, env: Env): boolean {
  return Boolean(env.OWNER_USER_ID) && userId === env.OWNER_USER_ID
}

const starterChallenges = [
  {
    challengeId: 'starter-message-in-a-bottle',
    title: 'Message in a Bottle',
    category: 'CRYPTO',
    difficulty: 1,
    points: 50,
    description: 'Recover the sealed note from /challenges/bottle.txt.',
    flag: 'ocean{silent-current-af20d4}',
  },
  {
    challengeId: 'starter-radio-operators-log',
    title: "Radio Operator's Log",
    category: 'CRYPTO',
    difficulty: 2,
    points: 150,
    description: 'Inspect the transmission in /challenges/log.txt.',
    flag: 'ocean{distant-buoy-7b0c11}',
  },
  {
    challengeId: 'starter-harbor-office',
    title: 'Harbor Office',
    category: 'WEB',
    difficulty: 1,
    points: 100,
    description: "Read the harbor-office page source at /challenges/harbor.html.",
    flag: 'ocean{brass-window-d61382}',
  },
] as const

export const isOwnerAction: ActionHandler<Env> = async ({ userId, env }) => ({
  success: true,
  data: isOwner(userId, env),
})

export const seedStarterChallenges: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }

  let created = 0
  const releaseAt = '2020-01-01T00:00:00.000Z'
  for (const { challengeId, flag, ...challengeData } of starterChallenges) {
    const existing = await tools.get<Record<string, unknown>>('challenges', challengeId)
    if (!existing.success) {
      const challenge = await tools.create(
        'challenges',
        { ...challengeData, releaseAt, published: true },
        challengeId,
      )
      if (challenge.success) {
        created++
      } else {
        const raced = await tools.get<Record<string, unknown>>('challenges', challengeId)
        if (!raced.success) return challenge
      }
    }

    const secrets = await tools.query<{ challengeId: string; flagMac: string }>(
      'challengeSecrets', { where: { challengeId }, limit: 2 },
    )
    if (!secrets.success) return secrets
    if (secrets.data.records.length > 1) {
      return { success: false, error: `Starter challenge verification is ambiguous for ${challengeId}.` }
    }
    if (secrets.data.records.length === 1) continue

    const secret = await tools.create('challengeSecrets', {
      challengeId,
      flagMac: await flagMac(flag, env.CTF_FLAG_HMAC_KEY),
    })
    if (!secret.success) {
      const racedSecret = await tools.query<{ challengeId: string; flagMac: string }>(
        'challengeSecrets', { where: { challengeId }, limit: 2 },
      )
      if (!racedSecret.success || racedSecret.data.records.length !== 1) {
        return { success: false, error: `Could not save verification for starter challenge ${challengeId}.` }
      }
    }
  }

  return { success: true, data: { created, total: starterChallenges.length } }
}

export const createChallenge: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }
  const title = typeof params.title === 'string' ? params.title.trim() : ''
  const category = typeof params.category === 'string' ? params.category.trim() : ''
  const description = typeof params.description === 'string' ? params.description.trim() : ''
  const flag = typeof params.flag === 'string' ? params.flag.trim() : ''
  const releaseAt = typeof params.releaseAt === 'string' ? params.releaseAt : ''
  const difficulty = params.difficulty
  const points = params.points
  const published = params.published
  const releaseTime = Date.parse(releaseAt)
  if (
    !title || title.length > 120 || !category || category.length > 80 ||
    !description || description.length > 4000 || !flag || flag.length > 512 ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(releaseAt) || !Number.isFinite(releaseTime) ||
    !Number.isInteger(difficulty) || (difficulty as number) < 1 || (difficulty as number) > 4 ||
    !Number.isInteger(points) || (points as number) < 0 || (points as number) > 1000 ||
    typeof published !== 'boolean'
  ) return { success: false, error: 'Invalid challenge fields.' }

  const challenge = await tools.create('challenges', {
    title, category, difficulty, points, description, releaseAt, published,
  })
  if (!challenge.success) return challenge
  const secret = await tools.create('challengeSecrets', {
    challengeId: challenge.data.recordId,
    flagMac: await flagMac(flag, env.CTF_FLAG_HMAC_KEY),
  })
  if (!secret.success) {
    await tools.remove('challenges', challenge.data.recordId)
    return { success: false, error: 'Could not save challenge verification.' }
  }
  return { success: true, data: { challengeId: challenge.data.recordId } }
}

export const adminListChallenges: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  const result = await tools.query<Record<string, unknown>>('challenges', { limit: 500 })
  if (!result.success) return result
  return {
    success: true,
    data: {
      challenges: result.data.records.map(({ recordId, data }) => ({
        challengeId: recordId,
        title: data.title,
        category: data.category,
        difficulty: data.difficulty,
        points: data.points,
        description: data.description,
        releaseAt: data.releaseAt,
        published: data.published,
        authorId: data.authorId,
        reviewStatus: data.reviewStatus,
        writeup: data.writeup,
      })),
    },
  }
}

export const setPublished: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId.trim() : ''
  if (!challengeId || typeof params.published !== 'boolean') {
    return { success: false, error: 'Challenge and publish state are required.' }
  }
  const existing = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!existing.success) return { success: false, error: 'Challenge not found.' }
  if (params.published && existing.data.record.data.reviewStatus !== undefined &&
      existing.data.record.data.reviewStatus !== 'approved') {
    return { success: false, error: 'Challenge must be approved before publishing.' }
  }
  const updated = await tools.update('challenges', challengeId, { published: params.published })
  if (!updated.success) return updated
  return { success: true, data: { challengeId, published: params.published } }
}
