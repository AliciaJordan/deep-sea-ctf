import { describe, expect, it } from 'vitest'
import { formatAttachmentUploadResult } from './attachment-upload-feedback'
import { validateAttachment } from './community-attachments'

describe('attachment upload feedback', () => {
  it('shows the server rejection reason next to the file name', () => {
    const file = { name: 'clue.png', size: 2048 }
    expect(formatAttachmentUploadResult(file, new Error('File contents do not match an allowed file type.')))
      .toBe('Rejected: clue.png - File contents do not match an allowed file type.')
  })

  it('uses the attachment validator reason for an unsupported file before submission', async () => {
    const file = { name: 'clue.exe', size: 2048 } as File
    const validation = await validateAttachment(file)
    expect(validation).toMatchObject({
      success: false,
      error: 'Allowed file types: png, jpg, wav, txt, csv, and log.',
    })
    if (!validation.success) {
      expect(formatAttachmentUploadResult(file, new Error(validation.error)))
        .toBe('Rejected: clue.exe - Allowed file types: png, jpg, wav, txt, csv, and log.')
    }
  })

  it('uses a generic reason when the error has no readable message', () => {
    expect(formatAttachmentUploadResult({ name: 'clue.png', size: 0 }, {}))
      .toBe('Rejected: clue.png - Upload failed. Please try again.')
  })
})
