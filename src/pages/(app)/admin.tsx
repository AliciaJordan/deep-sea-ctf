import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthGate } from 'deepspace'
import { callCtfAction } from '../../lib/ctf-actions'

type Challenge = {
  challengeId: string
  title: string
  category: string
  difficulty: number
  points: number
  description: string
  releaseAt: string
  published: boolean
  authorId?: string
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  writeup?: string
}

function createEmptyForm() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    title: '',
    category: '',
    difficulty: '1',
    points: '100',
    description: '',
    flag: '',
    releaseAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
    published: false,
  }
}

export default function AdminPage() {
  return <AuthGate><AdminPanel /></AuthGate>
}

function AdminPanel() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [form, setForm] = useState(createEmptyForm)
  const [reviewPoints, setReviewPoints] = useState<Record<string, string>>({})
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    try {
      const result = await callCtfAction<{ challenges: Challenge[] }>('adminListChallenges')
      setChallenges(result.challenges)
      setDenied(false)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to load challenges.'
      setDenied(message === 'Forbidden.' || message === 'Unauthorized')
      setError(message)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await callCtfAction('createChallenge', {
        ...form,
        difficulty: Number(form.difficulty),
        points: Number(form.points),
        releaseAt: new Date(form.releaseAt).toISOString(),
      })
      setForm(createEmptyForm())
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create challenge.')
    } finally {
      setBusy(false)
    }
  }

  async function publish(challenge: Challenge) {
    setError('')
    try {
      await callCtfAction('setPublished', { challengeId: challenge.challengeId, published: !challenge.published })
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update challenge.')
    }
  }

  async function review(challenge: Challenge, decision: 'approve' | 'reject') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await callCtfAction('reviewCommunityChallenge', {
        challengeId: challenge.challengeId,
        decision,
        points: Number(reviewPoints[challenge.challengeId] ?? challenge.difficulty * 100),
      })
      setNotice(decision === 'approve' ? `${challenge.title} APPROVED AND PUBLISHED.` : `${challenge.title} REJECTED.`)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to review challenge.')
    } finally {
      setBusy(false)
    }
  }

  if (denied) return <main className="ctf-shell"><p className="ctf-label" role="alert">403 / OWNER ACCESS ONLY</p></main>

  return <main className="ctf-shell">
    <div className="admin-nav-links"><Link className="ctf-back" to="/home">← BOARD</Link><Link className="ctf-back" to="/scoreboard">SCOREBOARD</Link></div>
    <header className="ctf-heading">
      <p className="ctf-label">FIELD LOG / ADMIN</p>
      <h1>Challenge Registry</h1>
    </header>
    {error && <p role="alert" className="ctf-status">{error}</p>}
    {notice && <p role="status" className="ctf-status">{notice}</p>}
    <section className="community-review" aria-labelledby="review-heading">
      <h2 id="review-heading" className="ctf-label ctf-section-title">COMMUNITY CHALLENGES / UNDER REVIEW</h2>
      {challenges.filter((challenge) => challenge.reviewStatus === 'pending').map((challenge) => <article className="review-card" key={challenge.challengeId}>
        <div className="review-card-heading">
          <div>
            <h3>{challenge.title}</h3>
            <p>{challenge.category} / DEPTH {challenge.difficulty} / SUBMITTED BY {challenge.authorId?.slice(0, 8)}</p>
          </div>
          <label>Points<input
            type="number"
            min={0}
            max={1000}
            value={reviewPoints[challenge.challengeId] ?? challenge.difficulty * 100}
            onChange={(event) => setReviewPoints({ ...reviewPoints, [challenge.challengeId]: event.target.value })}
          /></label>
        </div>
        <p className="review-description">{challenge.description}</p>
        <details>
          <summary>READ SUBMITTED SOLUTION</summary>
          <pre>{challenge.writeup || 'No solution write-up was provided.'}</pre>
        </details>
        <div className="review-actions">
          <button type="button" disabled={busy} onClick={() => void review(challenge, 'approve')}>APPROVE &amp; PUBLISH</button>
          <button type="button" disabled={busy} onClick={() => void review(challenge, 'reject')}>REJECT</button>
        </div>
      </article>)}
      {!challenges.some((challenge) => challenge.reviewStatus === 'pending') && <p className="ctf-empty">NO CHALLENGES AWAITING REVIEW</p>}
    </section>
    <form className="admin-form" onSubmit={create}>
      <label>Title<input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Category<input required maxLength={80} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
      <label>Depth<select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Points<input required type="number" min={0} max={1000} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
      <label className="admin-form-wide">Description<textarea required maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label>Flag (write only)<input required type="password" autoComplete="new-password" maxLength={512} value={form.flag} onChange={(e) => setForm({ ...form, flag: e.target.value })} /></label>
      <label>Release time<input required type="datetime-local" value={form.releaseAt} onChange={(e) => setForm({ ...form, releaseAt: e.target.value })} /></label>
      <label className="admin-check"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Published</label>
      <button type="submit" disabled={busy}>{busy ? 'SAVING' : 'CREATE CHALLENGE'}</button>
    </form>
    <section aria-label="All challenges">
      <h2 className="ctf-label ctf-section-title">ALL CONTACTS</h2>
      <div className="ctf-table">
        <div className="ctf-row ctf-row-head"><span>DEPTH</span><span>CHALLENGE</span><span>POINTS / STATE</span></div>
        {challenges.map((challenge) => <div className="ctf-row" key={challenge.challengeId}>
          <span>{challenge.difficulty}</span><span>{challenge.title}<small>{challenge.category}</small></span>
          <span className="ctf-data">
            {challenge.points} / {challenge.reviewStatus?.toUpperCase() ?? (challenge.published ? 'PUBLISHED' : 'DRAFT')}
            {challenge.reviewStatus !== 'pending' && challenge.reviewStatus !== 'rejected' &&
              <button type="button" onClick={() => void publish(challenge)}>{challenge.published ? 'UNPUBLISH' : 'PUBLISH'}</button>}
          </span>
        </div>)}
        {!challenges.length && <p className="ctf-empty">NO CONTACTS YET</p>}
      </div>
    </section>
  </main>
}
