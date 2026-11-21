import { getAuthToken } from 'deepspace'
import type { PublicChallengeAttachment } from './community-attachments'

export async function callCtfAction<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in to continue.')
  const response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const result = await response.json() as { success: boolean; data?: T; error?: string }
  if (!response.ok || !result.success || result.data === undefined) throw new Error(result.error ?? 'Request failed.')
  return result.data
}

export async function uploadChallengeAttachment(
  challengeId: string,
  file: File,
): Promise<PublicChallengeAttachment> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in to continue.')

  const body = new FormData()
  body.append('file', file, file.name)
  const response = await fetch(
    `/api/challenges/${encodeURIComponent(challengeId)}/attachments`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
  )
  const result = await response.json() as {
    success: boolean
    data?: { attachment: PublicChallengeAttachment }
    error?: string
  }
  if (!response.ok || !result.success || !result.data?.attachment) {
    throw new Error(result.error ?? 'Attachment upload failed.')
  }
  return result.data.attachment
}
