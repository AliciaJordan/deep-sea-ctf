import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { callCtfAction } from '../../../lib/ctf-actions'
import { DepthGauge } from '../../../components/DepthRing'

type Submission = {
  challengeId: string
  title: string
  difficulty: number
  reviewStatus: 'pending' | 'approved' | 'rejected'
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
    try {
      await callCtfAction('createCommunityChallenge', {
        ...form,
        difficulty: Number(form.difficulty),
      })
      setForm(emptyForm)
      setNotice('CHALLENGE RECEIVED / UNDER REVIEW')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit challenge.')
    } finally {
      setBusy(false)
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
      <label>Category<input required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
      <label>Depth<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="admin-form-wide">Challenge description<textarea required maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label>Flag<input required type="password" autoComplete="new-password" maxLength={512} value={form.flag} onChange={(event) => setForm({ ...form, flag: event.target.value })} /><small>Use the format ocean{`{...}`} with no spaces.</small></label>
      <label className="admin-form-wide">Solution write-up<textarea required maxLength={8000} value={form.writeup} onChange={(event) => setForm({ ...form, writeup: event.target.value })} /><small>Only you and the reviewer can see this before approval. Players see it after solving.</small></label>
      <button type="submit" disabled={busy}>{busy ? 'SUBMITTING' : 'SUBMIT FOR REVIEW'}</button>
    </form>
    <section className="community-submissions" aria-labelledby="submissions-heading">
      <h2 id="submissions-heading" className="ctf-label ctf-section-title">YOUR SUBMISSIONS</h2>
      <div className="ctf-table">
        {submissions.map((submission) => <div className="ctf-row" key={submission.challengeId}>
          <span>{submission.difficulty}</span>
          <span>{submission.title}<small>{reviewLabel[submission.reviewStatus] ?? 'UNDER REVIEW'}</small></span>
          <span>{submission.reviewStatus === 'approved' && <Link to={`/challenges/${encodeURIComponent(submission.challengeId)}`}>OPEN</Link>}</span>
        </div>)}
        {!submissions.length && <p className="ctf-empty">NO COMMUNITY SUBMISSIONS YET</p>}
      </div>
    </section>
  </main>
}
