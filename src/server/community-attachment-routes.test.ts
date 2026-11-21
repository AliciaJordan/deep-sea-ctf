import { Hono } from 'hono'
import type { ActionTools, AppFilesClient, VerifyResult } from 'deepspace/worker'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker'
import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from '../lib/community-attachments'
import { registerCommunityAttachmentRoutes } from './community-attachment-routes'

const env = { OWNER_USER_ID: 'owner' } as Env

function makeRoute(options: {
  userId: string | null
  challenge?: Record<string, unknown>
  attachment?: Record<string, unknown>
  queryRecords?: Record<string, Array<{ recordId: string; data: Record<string, unknown> }>>
  download?: () => Promise<Response>
}): {
  app: Hono<AppContext>
  download: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  createTools: ReturnType<typeof vi.fn>
} {
  const download = vi.fn(options.download ?? (async () => new Response('file bytes')))
  const upload = vi.fn(async (_file: Blob, uploadOptions?: { key?: string }) => ({
    key: `apps/app/users/u/${uploadOptions?.key ?? 'random-file'}`,
    relativeKey: uploadOptions?.key ?? 'random-file',
    path: '/api/files/file',
  }))
  const tools = {
    get: vi.fn(async (collection: string, recordId: string) => {
      if (collection === 'challenges' && options.challenge) {
        return { success: true, data: { record: { recordId, data: options.challenge } } }
      }
      if (collection === 'challengeAttachments' && options.attachment) {
        return { success: true, data: { record: { recordId, data: options.attachment } } }
      }
      return { success: false, error: 'Not found.' }
    }),
    query: vi.fn(async (collection: string) => {
      const records = options.queryRecords?.[collection] ?? []
      return { success: true, data: { records, count: records.length } }
    }),
    create: vi.fn(async () => ({ success: true, data: { recordId: 'created' } })),
    update: vi.fn(async () => ({ success: true, data: { recordId: 'updated' } })),
    remove: vi.fn(async () => ({ success: true, data: { recordId: 'removed' } })),
  } as unknown as ActionTools
  const createTools = vi.fn(() => tools)
  const app = new Hono<AppContext>()
  registerCommunityAttachmentRoutes(app, async (request) => {
    if (!options.userId || request.headers.get('Authorization') !== 'Bearer test-token') return null
    return { userId: options.userId } as VerifyResult
  }, {
    createTools,
    appFiles: () => ({
      upload,
      download,
      list: vi.fn(),
      delete: vi.fn(async () => ({ existed: true })),
    }) as unknown as AppFilesClient,
    resolveReadAuth: async () => null,
  })
  return { app, download, upload, createTools }
}

describe('community attachment validation', () => {
  it('rejects disallowed file extensions', async () => {
    const result = await validateAttachment(new File(['binary'], 'program.exe'))
    expect(result).toMatchObject({ success: false, status: 415 })
  })

  it('rejects HTML content renamed to an allowed extension', async () => {
    const result = await validateAttachment(new File(['<!doctype html><html>'], 'notes.txt'))
    expect(result).toMatchObject({ success: false, status: 415 })
  })

  it('rejects files larger than 2 MB', async () => {
    const result = await validateAttachment(new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'large.txt'))
    expect(result).toMatchObject({ success: false, status: 413 })
  })
})

describe('community attachment routes', () => {
  it('rejects uploads from a non-owner who did not submit the challenge', async () => {
    const { app } = makeRoute({
      userId: 'outsider',
      challenge: { authorId: 'submitter', published: false },
    })
    const form = new FormData()
    form.append('file', new File(['notes'], 'notes.txt'))

    const response = await app.request('/api/challenges/challenge-1/attachments', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: form,
    }, env)

    expect(response.status).toBe(403)
  })

  it('rejects a fourth attachment for one challenge', async () => {
    const { app, upload } = makeRoute({
      userId: 'submitter',
      challenge: { authorId: 'submitter', reviewStatus: 'pending', published: false },
      queryRecords: {
        challengeAttachments: [0, 1, 2].map((slot) => ({
          recordId: `attachment-${slot}`,
          data: { challengeId: 'challenge-1', slot, ready: true },
        })),
      },
    })
    const form = new FormData()
    form.append('file', new File(['notes'], 'notes.txt'))

    const response = await app.request('/api/challenges/challenge-1/attachments', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: form,
    }, env)

    expect(response.status).toBe(409)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rate-limits uploads per user', async () => {
    const now = Date.now()
    const claims = Array.from({ length: 5 }, (_, slot) => ({
      recordId: `claim-${slot}`,
      data: { userId: 'submitter', bucket: 0, slot, ts: new Date(now - 10_000).toISOString() },
    }))
    const { app, upload } = makeRoute({
      userId: 'submitter',
      challenge: { authorId: 'submitter', reviewStatus: 'pending', published: false },
      queryRecords: { attachmentUploadClaims: claims },
    })
    const form = new FormData()
    form.append('file', new File(['notes'], 'notes.txt'))

    const response = await app.request('/api/challenges/challenge-1/attachments', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: form,
    }, env)

    expect(response.status).toBe(429)
    expect(upload).not.toHaveBeenCalled()
  })

  it('stores accepted files under a random R2 key', async () => {
    const { app, upload } = makeRoute({
      userId: 'submitter',
      challenge: { authorId: 'submitter', reviewStatus: 'pending', published: false },
    })
    const form = new FormData()
    form.append('file', new File(['plain text'], 'notes.txt'))

    const response = await app.request('/api/challenges/challenge-1/attachments', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: form,
    }, env)

    expect(response.status).toBe(200)
    expect(upload).toHaveBeenCalledWith(expect.any(Blob), {
      key: expect.stringMatching(/^community-challenges\/[0-9a-f-]+\.txt$/),
      name: 'notes.txt',
    })
  })

  it('does not download an unpublished attachment for another signed-in player', async () => {
    const { app, download } = makeRoute({
      userId: 'player',
      challenge: { authorId: 'submitter', published: false },
      attachment: {
        challengeId: 'challenge-1', uploadedBy: 'submitter', key: 'private-file',
        originalName: 'notes.txt', contentType: 'text/plain', ready: true,
      },
    })

    const response = await app.request(
      '/api/challenges/challenge-1/attachments/attachment-1',
      { headers: { Authorization: 'Bearer test-token' } },
      env,
    )

    expect(response.status).toBe(404)
    expect(download).not.toHaveBeenCalled()
  })

  it('rejects signed-out attachment downloads', async () => {
    const { app, createTools } = makeRoute({
      userId: null,
      challenge: { published: true },
    })

    const response = await app.request('/api/challenges/challenge-1/attachments/attachment-1', {}, env)

    expect(response.status).toBe(401)
    expect(createTools).not.toHaveBeenCalled()
  })

  it('serves published files as safe downloads', async () => {
    const { app } = makeRoute({
      userId: 'player',
      challenge: { published: true, releaseAt: new Date().toISOString() },
      attachment: {
        challengeId: 'challenge-1', uploadedBy: 'submitter', key: 'private-file',
        originalName: 'signal<script>.txt', contentType: 'text/plain; charset=utf-8', ready: true,
      },
    })

    const response = await app.request(
      '/api/challenges/challenge-1/attachments/attachment-1',
      { headers: { Authorization: 'Bearer test-token' } },
      env,
    )

    expect(response.status).toBe(200)
    const disposition = response.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment;')
    expect(disposition).toContain('filename="signal_script_.txt"')
    expect(disposition).toContain("filename*=UTF-8''signal%3Cscript%3E.txt")
    expect(disposition).not.toContain('<script>')
    expect(response.headers.get('content-security-policy')).toBe('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
