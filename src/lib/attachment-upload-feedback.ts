export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatAttachmentUploadResult(file: Pick<File, 'name' | 'size'>, reason?: unknown): string {
  if (reason === undefined) return `Uploaded: ${file.name} (${formatFileSize(file.size)})`
  const message = reason instanceof Error && reason.message.trim()
    ? reason.message
    : 'Upload failed. Please try again.'
  return `Rejected: ${file.name} - ${message}`
}
