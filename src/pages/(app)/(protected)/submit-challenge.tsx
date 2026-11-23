import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CHALLENGE_CATEGORIES } from '../../../constants'
import { callCtfAction, uploadChallengeAttachment } from '../../../lib/ctf-actions'
import { formatAttachmentUploadResult, formatFileSize } from '../../../lib/attachment-upload-feedback'
import { MAX_CHALLENGE_ATTACHMENTS, validateAttachment, type PublicChallengeAttachment } from '../../../lib/community-attachments'
import { DepthGauge } from '../../../components/DepthRing'

type Submission = {
  challengeId: string
  title: string
  difficulty: number
  reviewStatus: 'pending' | 'approved' | 'rejected'
  attachments: PublicChallengeAttachment[]
}

const emptyForm = {
  title: '',
  category: '',
  difficulty: '1',
  description: '',
  flag: '',
  writeup: '',
}

const reviewLabel: Record<Submission['reviewStatus'], string> = {
  pending: 'UNDER REVIEW',
  approved: 'PUBLISHED',
  rejected: 'NOT APPROVED',
}

export default function SubmitChallengePage() {
  const [form, setForm] = useState(emptyForm)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, File[]>>({})
  const [uploadResults, setUploadResults] = useState<Record<string, string[]>>({})
  const [formUploadResults, setFormUploadResults] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const listFileInput = useRef<HTMLInputElement>(null)
  const activeSubmission = useRef<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const result = await callCtfAction<{ submissions: Submission[] }>('myChallengeSubmissions')
      setSubmissions(result.submissions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load your submissions.')
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    setFormUploadResults([])
    try {
      const files = selectedFiles
      const validationResults: string[] = []
      for (const file of files) {
        try {
          const validation = await validateAttachment(file)
          if (!validation.success) {
            validationResults.push(formatAttachmentUploadResult(file, new Error(validation.error)))
          }
        } catch (reason) {
          validationResults.push(formatAttachmentUploadResult(file, reason))
        }
      }
      if (validationResults.length) {
        setFormUploadResults(validationResults)
        return
      }

      const { challengeId } = await callCtfAction<{ challengeId: string }>('createCommunityChallenge', {
        ...form,
        difficulty: Number(form.difficulty),
      })
      setForm(emptyForm)
      setSelectedFiles([])
      setNotice('CHALLENGE RECEIVED / UNDER REVIEW')
      const results: string[] = []
      for (const file of files) {
        try {
          await uploadChallengeAttachment(challengeId, file)
          results.push(formatAttachmentUploadResult(file))
        } catch (reason) {
          results.push(formatAttachmentUploadResult(file, reason))
        }
        setFormUploadResults([...results])
      }
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit challenge.')
    } finally {
      setBusy(false)
    }
  }

  async function addAttachments(submission: Submission, files: File[]) {
    if (!files.length) return
    const remaining = MAX_CHALLENGE_ATTACHMENTS - submission.attachments.length
    if (files.length > remaining) {
      setError(`This challenge has room for ${remaining} more file${remaining === 1 ? '' : 's'}.`)
      return
    }
    setBusy(true)
    setUploadResults((current) => ({ ...current, [submission.challengeId]: [] }))
    const results: string[] = []
    try {
      for (const file of files) {
        try {
          await uploadChallengeAttachment(submission.challengeId, file)
          results.push(formatAttachmentUploadResult(file))
        } catch (reason) {
          results.push(formatAttachmentUploadResult(file, reason))
        }
        setUploadResults((current) => ({ ...current, [submission.challengeId]: [...results] }))
      }
      setSubmissionFiles((current) => ({ ...current, [submission.challengeId]: [] }))
      await reload()
    } finally {
      setBusy(false)
    }
  }

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>, submissionId?: string) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (submissionId) {
      const submission = submissions.find((item) => item.challengeId === submissionId)
      if (!submission) return
      const remaining = MAX_CHALLENGE_ATTACHMENTS - submission.attachments.length
      setSubmissionFiles((current) => ({
        ...current,
        [submissionId]: files.slice(0, Math.max(0, remaining)),
      }))
    } else {
      setSelectedFiles(files.slice(0, MAX_CHALLENGE_ATTACHMENTS))
      setFormUploadResults([])
    }
  }

  return <main className="ctf-shell community-submit">
    <DepthGauge />
    <div className="admin-nav-links"><Link className="ctf-back" to="/library">← LIBRARY</Link></div>
    <header className="ctf-heading">
      <p className="ctf-label">FIELD LOG / COMMUNITY SUBMISSION</p>
      <h1>Create a Challenge</h1>
      <p className="ctf-subtitle">Sign in is required. Your challenge stays private while it is under review.</p>
    </header>
    {error && <p role="alert" className="ctf-status">{error}</p>}
    {notice && <p role="status" className="ctf-status">{notice}</p>}
    <form className="admin-form community-form" onSubmit={submit}>
      <label>Title<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
        <option value="" disabled>Select a category</option>
        {CHALLENGE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select></label>
      <label>Depth<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="admin-form-wide">Challenge description<textarea required maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label>Flag<input required type="password" autoComplete="new-password" maxLength={512} value={form.flag} onChange={(event) => setForm({ ...form, flag: event.target.value })} /><small>Use the required flag format with no spaces.</small></label>
      <label className="admin-form-wide">Solution write-up<textarea required maxLength={8000} value={form.writeup} onChange={(event) => setForm({ ...form, writeup: event.target.value })} /><small>Only you and the reviewer can see this before approval. Players see it after solving.</small></label>
      <div className="admin-form-wide attachment-picker">
        <span>Challenge files</span>
        <input ref={fileInput} className="visually-hidden-file" type="file"
        multiple
        accept=".png,.jpg,.wav,.txt,.csv,.log"
        disabled={busy}
        onChange={(event) => chooseFiles(event)}
        />
        <button type="button" className="attachment-add-button" disabled={busy || selectedFiles.length >= MAX_CHALLENGE_ATTACHMENTS} onClick={() => fileInput.current?.click()}>Add files</button>
        <small>Up to 3 files, 2 MB each. PNG, JPG, WAV, TXT, CSV, or LOG.</small>
        <ul className="attachment-file-list">{selectedFiles.map((file, index) => <li key={`${file.name}-${index}`}>{file.name} ({formatFileSize(file.size)})</li>)}</ul>
        <ul className="attachment-results" aria-live="polite">{formUploadResults.map((result, index) => <li key={`${index}-${result}`}>{result}</li>)}</ul>
      </div>
      <button type="submit" disabled={busy}>{busy ? 'SUBMITTING' : 'SUBMIT FOR REVIEW'}</button>
    </form>
    <section className="community-submissions" aria-labelledby="submissions-heading">
      <h2 id="submissions-heading" className="ctf-label ctf-section-title">YOUR SUBMISSIONS</h2>
      <div className="ctf-table">
        {submissions.map((submission) => <div className="ctf-row" key={submission.challengeId}>
          <span>{submission.difficulty}</span>
          <span>{submission.title}<small>{reviewLabel[submission.reviewStatus] ?? 'UNDER REVIEW'}</small></span>
          <span>
            {submission.reviewStatus === 'approved' && <Link to={`/challenges/${encodeURIComponent(submission.challengeId)}`}>OPEN</Link>}
            {submission.reviewStatus === 'pending' && <>
              <button type="button" className="attachment-add-button" disabled={busy || submission.attachments.length >= MAX_CHALLENGE_ATTACHMENTS} onClick={() => { activeSubmission.current = submission.challengeId; listFileInput.current?.click() }}>Add files</button>
              <input ref={listFileInput} className="visually-hidden-file" type="file" multiple accept=".png,.jpg,.wav,.txt,.csv,.log" disabled={busy} onChange={(event) => chooseFiles(event, activeSubmission.current ?? undefined)} />
              {(submissionFiles[submission.challengeId] ?? []).length > 0 && <>
                <ul className="attachment-file-list">{(submissionFiles[submission.challengeId] ?? []).map((file, index) => <li key={`${file.name}-${index}`}>{file.name} ({formatFileSize(file.size)})</li>)}</ul>
                <button type="button" disabled={busy} onClick={() => void addAttachments(submission, submissionFiles[submission.challengeId] ?? [])}>Upload selected</button>
              </>}
              <ul className="attachment-results" aria-live="polite">{(uploadResults[submission.challengeId] ?? []).map((result, index) => <li key={`${index}-${result}`}>{result}</li>)}</ul>
            </>}
            <small>{submission.attachments.length}/{MAX_CHALLENGE_ATTACHMENTS} FILES</small>
          </span>
        </div>)}
        {!submissions.length && <p className="ctf-empty">NO COMMUNITY SUBMISSIONS YET</p>}
      </div>
    </section>
  </main>
}
