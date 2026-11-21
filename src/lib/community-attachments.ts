export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
export const MAX_CHALLENGE_ATTACHMENTS = 3

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  wav: 'audio/wav',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  log: 'text/plain; charset=utf-8',
}

export type AttachmentFileData = {
  name: string
  extension: string
  contentType: string
  size: number
  bytes: Uint8Array
}

export type AttachmentValidation =
  | { success: true; data: AttachmentFileData }
  | { success: false; status: 400 | 413 | 415; error: string }

export type PublicChallengeAttachment = {
  attachmentId: string
  name: string
  size: number
}

export function isPublished(value: unknown): boolean {
  return value === true || value === 1
}

export function canUploadChallengeAttachments(
  userId: string,
  challenge: Record<string, unknown>,
  ownerUserId: string,
): boolean {
  if (Boolean(ownerUserId) && userId === ownerUserId) return true
  return userId === challenge.authorId &&
    challenge.reviewStatus === 'pending' &&
    !isPublished(challenge.published)
}

export function canDownloadChallengeAttachments(
  userId: string,
  challenge: Record<string, unknown>,
  ownerUserId: string,
): boolean {
  const released = typeof challenge.releaseAt === 'string' &&
    Date.parse(challenge.releaseAt) <= Date.now()
  return (isPublished(challenge.published) && released) ||
    (Boolean(ownerUserId) && userId === ownerUserId) ||
    userId === challenge.authorId
}

export function publicAttachments(
  records: Array<{ recordId: string; data: Record<string, unknown> }>,
): PublicChallengeAttachment[] {
  const attachments: PublicChallengeAttachment[] = []
  for (const { recordId, data } of records) {
    if ((data.ready === true || data.ready === 1) &&
        typeof data.originalName === 'string' &&
        typeof data.size === 'number') {
      attachments.push({ attachmentId: recordId, name: data.originalName, size: data.size })
    }
  }
  return attachments
}

function safeFileName(name: string): string | null {
  const basename = name.replace(/\\/g, '/').split('/').pop() ?? ''
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned && cleaned.length <= 128 && cleaned !== '.' && cleaned !== '..'
    ? cleaned
    : null
}

function isHtmlDocument(text: string): boolean {
  return /^(?:<!doctype\s+html\b|<html\b|<(?:head|body|script|svg|iframe|object|embed)\b)/i
    .test(text.replace(/^\uFEFF/, '').trimStart())
}

export async function validateAttachment(file: File): Promise<AttachmentValidation> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { success: false, status: 413, error: 'Each attachment must be 2 MB or smaller.' }
  }

  const name = safeFileName(file.name)
  if (!name) return { success: false, status: 415, error: 'Allowed file types: png, jpg, wav, txt, csv, and log.' }
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const contentType = MIME_TYPES[extension]
  if (!contentType) {
    return { success: false, status: 415, error: 'Allowed file types: png, jpg, wav, txt, csv, and log.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let valid = false
  if (extension === 'png') {
    valid = bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  } else if (extension === 'jpg') {
    valid = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  } else if (extension === 'wav') {
    valid = bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE'
  } else {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      valid = !bytes.includes(0) && !isHtmlDocument(text)
    } catch {
      valid = false
    }
  }

  if (!valid) {
    return { success: false, status: 415, error: 'File contents do not match an allowed file type.' }
  }

  return { success: true, data: { name, extension, contentType, size: file.size, bytes } }
}
