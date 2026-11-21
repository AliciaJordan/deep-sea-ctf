import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppFileError, appFiles, resolveSessionReadAuth } from 'deepspace/worker'
import type { ActionTools, AppFilesClient, AppFilesOptions, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createActionTools } from './action-routes.js'
import type { ResolveAuth } from './action-routes.js'
import {
  canDownloadChallengeAttachments,
  canUploadChallengeAttachments,
  MAX_ATTACHMENT_BYTES,
  MAX_CHALLENGE_ATTACHMENTS,
  validateAttachment,
} from '../lib/community-attachments.js'

const UPLOADS_PER_MINUTE = 5
const MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 32 * 1024

type RouteDependencies = {
  createTools: (env: Env, userId: string, token: string) => ActionTools
  appFiles: (env: Env, options: AppFilesOptions) => AppFilesClient
  resolveReadAuth: (req: Request, env: Env) => Promise<VerifyResult | null>
}

type RouteOverrides = Partial<RouteDependencies>

type Reservation =
  | { success: true; recordId: string; key: string }
  | { success: false; status: ContentfulStatusCode; error: string }

function isReady(value: unknown): boolean {
  return value === true || value === 1
}

function owner(userId: string, env: Env): boolean {
  return Boolean(env.OWNER_USER_ID) && userId === env.OWNER_USER_ID
}

async function readBoundedBody(request: Request, limit: number): Promise<ArrayBuffer | null> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) return null
  if (!request.body) return new ArrayBuffer(0)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new ArrayBuffer(total)
  const view = new Uint8Array(body)
  let offset = 0
  for (const chunk of chunks) {
    view.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function reserveUploadRate(
  userId: string,
  tools: ActionTools,
  now: number,
): Promise<Reservation | { success: true }> {
  const bucket = Math.floor(now / 60_000)
  const ts = new Date(now).toISOString()

  for (let attempt = 0; attempt < UPLOADS_PER_MINUTE; attempt++) {
    const query = await tools.query<{ userId: string; bucket: number; slot: number; ts: string }>(
      'attachmentUploadClaims',
      { where: { userId }, orderBy: 'ts', orderDir: 'desc', limit: 500 },
    )
    if (!query.success) return { success: false, status: 500, error: 'Could not check the upload limit.' }

    const stale = query.data.records.filter(({ data }) => {
      const timestamp = Date.parse(data.ts)
      return !Number.isFinite(timestamp) || now - timestamp >= 60_000
    })
    for (const claim of stale) {
      const removed = await tools.remove('attachmentUploadClaims', claim.recordId)
      if (!removed.success) return { success: false, status: 500, error: 'Could not update the upload limit.' }
    }
    const active = query.data.records.filter(({ data }) => {
      const timestamp = Date.parse(data.ts)
      return Number.isFinite(timestamp) && now - timestamp < 60_000
    })
    if (active.length >= UPLOADS_PER_MINUTE) {
      return { success: false, status: 429, error: 'Upload limit reached. Try again in a minute.' }
    }

    const occupied = new Set(active
      .filter(({ data }) => data.bucket === bucket)
      .map(({ data }) => data.slot))
    const slot = Array.from({ length: UPLOADS_PER_MINUTE }, (_, index) => index)
      .find((candidate) => !occupied.has(candidate))
    if (slot === undefined) {
      return { success: false, status: 429, error: 'Upload limit reached. Try again in a minute.' }
    }

    const created = await tools.create('attachmentUploadClaims', { userId, bucket, slot, ts })
    if (created.success) return { success: true }
    const reread = await tools.query<{ bucket: number; slot: number }>(
      'attachmentUploadClaims', { where: { userId, bucket, slot }, limit: 1 },
    )
    if (!reread.success) return { success: false, status: 500, error: 'Could not check the upload limit.' }
    if (reread.data.records.length) continue
    return { success: false, status: 500, error: 'Could not reserve an upload attempt.' }
  }

  return { success: false, status: 429, error: 'Upload limit reached. Try again in a minute.' }
}

async function reserveAttachmentSlot(
  challengeId: string,
  userId: string,
  name: string,
  contentType: string,
  size: number,
  extension: string,
  tools: ActionTools,
): Promise<Reservation> {
  for (let attempt = 0; attempt < MAX_CHALLENGE_ATTACHMENTS; attempt++) {
    const query = await tools.query<{ slot: number }>(
      'challengeAttachments', { where: { challengeId }, limit: MAX_CHALLENGE_ATTACHMENTS + 1 },
    )
    if (!query.success) return { success: false, status: 500, error: 'Could not check challenge attachments.' }
    if (query.data.records.length >= MAX_CHALLENGE_ATTACHMENTS) {
      return { success: false, status: 409, error: 'A challenge can have at most 3 attachments.' }
    }
    const occupied = new Set(query.data.records.map(({ data }) => data.slot))
    const slot = Array.from({ length: MAX_CHALLENGE_ATTACHMENTS }, (_, index) => index)
      .find((candidate) => !occupied.has(candidate))
    if (slot === undefined) {
      return { success: false, status: 409, error: 'A challenge can have at most 3 attachments.' }
    }

    const relativeKey = `community-challenges/${crypto.randomUUID()}.${extension}`
    const created = await tools.create('challengeAttachments', {
      challengeId,
      uploadedBy: userId,
      slot,
      key: relativeKey,
      originalName: name,
      contentType,
      size,
      ready: false,
    })
    if (created.success) return { success: true, recordId: created.data.recordId, key: relativeKey }

    const reread = await tools.query<{ slot: number }>(
      'challengeAttachments', { where: { challengeId, slot }, limit: 1 },
    )
    if (!reread.success) return { success: false, status: 500, error: 'Could not check challenge attachments.' }
    if (reread.data.records.length) continue
    return { success: false, status: 500, error: 'Could not reserve an attachment slot.' }
  }
  return { success: false, status: 409, error: 'A challenge can have at most 3 attachments.' }
}

async function cleanupReservation(
  tools: ActionTools,
  files: AppFilesClient,
  recordId: string,
  key?: string,
): Promise<void> {
  const removed = await tools.remove('challengeAttachments', recordId)
  if (!removed.success) console.error(`Could not remove attachment reservation ${recordId}: ${removed.error}`)
  if (!key) return
  try {
    await files.delete(key)
  } catch (error) {
    console.error(`Could not remove stored challenge attachment ${recordId}:`, error)
  }
}

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^A-Za-z0-9._ -]/g, '_').trim()
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export function registerCommunityAttachmentRoutes(
  app: Hono<AppContext>,
  resolveAuth: ResolveAuth,
  overrides: RouteOverrides = {},
): void {
  const dependencies: RouteDependencies = {
    createTools: overrides.createTools ?? createActionTools,
    appFiles: overrides.appFiles ?? appFiles,
    resolveReadAuth: overrides.resolveReadAuth ?? resolveSessionReadAuth,
  }

  app.post('/api/challenges/:challengeId/attachments', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth?.userId || auth.userId.startsWith('anon-')) {
      return c.json({ success: false, error: 'Sign in to upload attachments.' }, 401)
    }
    const bearer = c.req.header('Authorization') ?? ''
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''
    if (!token) return c.json({ success: false, error: 'Sign in to upload attachments.' }, 401)

    const challengeId = c.req.param('challengeId')
    const tools = dependencies.createTools(c.env, auth.userId, token)
    const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
    if (!challenge.success) return c.json({ success: false, error: 'Challenge not found.' }, 404)
    const challengeData = challenge.data.record.data
    if (!canUploadChallengeAttachments(auth.userId, challengeData, c.env.OWNER_USER_ID)) {
      return c.json({ success: false, error: 'Only the challenge submitter or owner can upload files.' }, 403)
    }

    const body = await readBoundedBody(c.req.raw, MAX_MULTIPART_BYTES)
    if (!body) return c.json({ success: false, error: 'Each attachment must be 2 MB or smaller.' }, 413)

    let form: FormData
    try {
      form = await new Request(c.req.url, {
        method: 'POST',
        headers: c.req.raw.headers,
        body,
      }).formData()
    } catch {
      return c.json({ success: false, error: 'Invalid multipart upload.' }, 400)
    }
    const uploads = form.getAll('file')
    if (uploads.length !== 1 || typeof uploads[0] === 'string') {
      return c.json({ success: false, error: 'Upload exactly one file at a time.' }, 400)
    }
    const validation = await validateAttachment(uploads[0])
    if (!validation.success) {
      return c.json({ success: false, error: validation.error }, validation.status)
    }

    const rate = await reserveUploadRate(auth.userId, tools, Date.now())
    if (!rate.success) return c.json({ success: false, error: rate.error }, rate.status)
    const reserved = await reserveAttachmentSlot(
      challengeId,
      auth.userId,
      validation.data.name,
      validation.data.contentType,
      validation.data.size,
      validation.data.extension,
      tools,
    )
    if (!reserved.success) return c.json({ success: false, error: reserved.error }, reserved.status)

    const files = dependencies.appFiles(c.env, { scope: 'self', userId: auth.userId })
    let storedKey: string
    try {
      const uploadBytes = new ArrayBuffer(validation.data.bytes.byteLength)
      new Uint8Array(uploadBytes).set(validation.data.bytes)
      const stored = await files.upload(
        new Blob([uploadBytes], { type: validation.data.contentType }),
        { key: reserved.key, name: validation.data.name },
      )
      storedKey = stored.key
    } catch (error) {
      await cleanupReservation(tools, files, reserved.recordId)
      if (error instanceof AppFileError) {
        const status = error.status === 409 ? 409 : error.status === 413 ? 413 : 502
        return c.json({ success: false, error: error.message }, status)
      }
      console.error(`Could not store challenge attachment ${reserved.recordId}:`, error)
      return c.json({ success: false, error: 'File storage request failed.' }, 502)
    }

    const updated = await tools.update('challengeAttachments', reserved.recordId, {
      key: storedKey,
      ready: true,
    })
    if (!updated.success) {
      await cleanupReservation(tools, files, reserved.recordId, storedKey)
      return c.json({ success: false, error: 'Could not save attachment details.' }, 500)
    }

    return c.json({
      success: true,
      data: {
        attachment: {
          attachmentId: reserved.recordId,
          name: validation.data.name,
          size: validation.data.size,
        },
      },
    })
  })

  app.get('/api/challenges/:challengeId/attachments/:attachmentId', async (c) => {
    const auth = (await resolveAuth(c.req.raw, c.env)) ??
      (await dependencies.resolveReadAuth(c.req.raw, c.env))
    if (!auth?.userId || auth.userId.startsWith('anon-')) {
      return c.json({ error: 'Sign in required.' }, 401)
    }

    const challengeId = c.req.param('challengeId')
    const attachmentId = c.req.param('attachmentId')
    const bearer = c.req.header('Authorization') ?? ''
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''
    const tools = dependencies.createTools(c.env, auth.userId, token)
    const challenge = await tools.get<Record<string, unknown>>('challenges', challengeId)
    if (!challenge.success) return c.notFound()
    const attachment = await tools.get<Record<string, unknown>>('challengeAttachments', attachmentId)
    if (!attachment.success || attachment.data.record.data.challengeId !== challengeId ||
        !isReady(attachment.data.record.data.ready)) return c.notFound()
    if (!canDownloadChallengeAttachments(auth.userId, challenge.data.record.data, c.env.OWNER_USER_ID)) {
      return c.notFound()
    }

    const data = attachment.data.record.data
    if (typeof data.key !== 'string' || typeof data.uploadedBy !== 'string' ||
        typeof data.originalName !== 'string' || typeof data.contentType !== 'string') {
      return c.json({ error: 'Attachment details are unavailable.' }, 500)
    }

    try {
      const files = dependencies.appFiles(c.env, { scope: 'self', userId: data.uploadedBy })
      const response = await files.download(data.key)
      if (!response.ok) return c.notFound()
      const headers = new Headers(response.headers)
      headers.set('Content-Type', data.contentType)
      headers.set('Content-Disposition', contentDisposition(data.originalName))
      headers.set('Content-Security-Policy', 'sandbox')
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Cache-Control', 'private, no-store')
      return new Response(response.body, { status: 200, headers })
    } catch (error) {
      if (error instanceof AppFileError && error.status === 404) return c.notFound()
      console.error(`Could not download challenge attachment ${attachmentId}:`, error)
      return c.json({ error: 'File download failed.' }, 502)
    }
  })
}
