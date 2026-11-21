import type { ActionHandler } from 'deepspace/worker'
import { appFiles } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isOwner } from './admin-challenges'
import { flagMac } from '../lib/flag-mac'
import { parseCommunityChallengeDraft } from '../lib/community-challenges'
import { publicAttachments } from '../lib/community-attachments'

export const createCommunityChallenge: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!userId || userId.startsWith('anon-')) return { success: false, error: 'Sign in to submit a challenge.' }
  if (!env.CTF_FLAG_HMAC_KEY) return { success: false, error: 'Flag verification is not configured.' }

  const parsed = parseCommunityChallengeDraft(params)
  if (!parsed.success) return parsed
  const { title, category, difficulty, description, flag, writeup } = parsed.data
  const created = await tools.create('challenges', {
    title,
    category,
    difficulty,
    points: 0,
    description,
    releaseAt: new Date().toISOString(),
    published: false,
    authorId: userId,
    reviewStatus: 'pending',
    writeup,
  })
  if (!created.success) return created

  const secret = await tools.create('challengeSecrets', {
    challengeId: created.data.recordId,
    flagMac: await flagMac(flag, env.CTF_FLAG_HMAC_KEY),
  })
  if (!secret.success) {
    const cleanup = await tools.remove('challenges', created.data.recordId)
    if (!cleanup.success) {
      console.error(`Could not remove incomplete community challenge ${created.data.recordId}: ${cleanup.error}`)
    }
    return { success: false, error: 'Could not save challenge verification. Please try again.' }
  }

  return { success: true, data: { challengeId: created.data.recordId, reviewStatus: 'pending' } }
}

export const myChallengeSubmissions: ActionHandler<Env> = async ({ userId, tools }) => {
  if (!userId || userId.startsWith('anon-')) return { success: false, error: 'Sign in to continue.' }
  const result = await tools.query<Record<string, unknown>>(
    'challenges',
    { where: { authorId: userId }, orderBy: 'createdAt', orderDir: 'desc', limit: 100 },
  )
  if (!result.success) return result
  const foundAttachments = await tools.query<Record<string, unknown>>(
    'challengeAttachments', { where: { uploadedBy: userId }, limit: 500 },
  )
  if (!foundAttachments.success) return foundAttachments
  const attachmentMap = new Map<string, Array<{ recordId: string; data: Record<string, unknown> }>>()
  for (const attachment of foundAttachments.data.records) {
    const challengeId = attachment.data.challengeId
    if (typeof challengeId !== 'string') continue
    const records = attachmentMap.get(challengeId) ?? []
    records.push(attachment)
    attachmentMap.set(challengeId, records)
  }
  return {
    success: true,
    data: {
      submissions: result.data.records.map(({ recordId, data }) => ({
        challengeId: recordId,
        title: data.title,
        difficulty: data.difficulty,
        reviewStatus: data.reviewStatus,
        attachments: publicAttachments(attachmentMap.get(recordId) ?? []),
      })),
    },
  }
}

export const reviewCommunityChallenge: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId.trim() : ''
  const decision = params.decision
  const points = params.points
  if (!challengeId || (decision !== 'approve' && decision !== 'reject')) {
    return { success: false, error: 'Challenge and review decision are required.' }
  }
  if (decision === 'approve' &&
      (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > 1000)) {
    return { success: false, error: 'Points must be an integer from 0 to 1000.' }
  }

  const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!challenge.success) return challenge
  if (challenge.data.record.data.reviewStatus !== 'pending') {
    return { success: false, error: 'Pending community challenge not found.' }
  }
  if (decision === 'approve') {
    const secret = await tools.query('challengeSecrets', { where: { challengeId }, limit: 2 })
    if (!secret.success) return secret
    if (secret.data.records.length !== 1) {
      return { success: false, error: 'Challenge verification is unavailable; this challenge cannot be approved.' }
    }
  }

  const update = decision === 'approve'
    ? { reviewStatus: 'approved', published: true, points, releaseAt: new Date().toISOString() }
    : { reviewStatus: 'rejected', published: false }
  const result = await tools.update('challenges', challengeId, update)
  if (!result.success) return result
  return { success: true, data: { challengeId, reviewStatus: update.reviewStatus, published: decision === 'approve' } }
}

export const deleteRejectedChallenge: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!isOwner(userId, env)) return { success: false, error: 'Forbidden.' }
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId.trim() : ''
  if (!challengeId) return { success: false, error: 'Challenge is required.' }

  const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
  if (!challenge.success || challenge.data.record.data.reviewStatus !== 'rejected') {
    return { success: false, error: 'Rejected challenge not found.' }
  }

  const attachments = await tools.query<Record<string, unknown>>(
    'challengeAttachments', { where: { challengeId }, limit: 10 },
  )
  if (!attachments.success) return attachments
  const secrets = await tools.query<Record<string, unknown>>(
    'challengeSecrets', { where: { challengeId }, limit: 2 },
  )
  if (!secrets.success) return secrets
  if (secrets.data.records.length > 1) {
    return { success: false, error: 'Challenge verification data is inconsistent.' }
  }

  for (const attachment of attachments.data.records) {
    const key = attachment.data.key
    const uploadedBy = attachment.data.uploadedBy
    if (typeof key !== 'string' || typeof uploadedBy !== 'string') {
      return { success: false, error: 'Challenge attachment details are unavailable.' }
    }
    try {
      await appFiles(env, { scope: 'self', userId: uploadedBy }).delete(key)
    } catch (error) {
      console.error(`Could not delete rejected challenge attachment ${attachment.recordId}:`, error)
      return { success: false, error: 'Could not delete challenge files.' }
    }
    const removed = await tools.remove('challengeAttachments', attachment.recordId)
    if (!removed.success) return removed
  }

  if (secrets.data.records[0]) {
    const removed = await tools.remove('challengeSecrets', secrets.data.records[0].recordId)
    if (!removed.success) return removed
  }
  const removed = await tools.remove('challenges', challengeId)
  if (!removed.success) return removed
  return { success: true, data: { challengeId } }
}
