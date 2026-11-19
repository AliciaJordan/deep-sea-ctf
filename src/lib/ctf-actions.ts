import { getAuthToken } from 'deepspace'

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
