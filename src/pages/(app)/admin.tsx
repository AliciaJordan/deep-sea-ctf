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
}

const emptyForm = {
  title: '', category: '', difficulty: '1', points: '100', description: '', flag: '',
  releaseAt: new Date().toISOString().slice(0, 16), published: false,
}

export default function AdminPage() {
  return <AuthGate><AdminPanel /></AuthGate>
}

function AdminPanel() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [form, setForm] = useState(emptyForm)
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
      setForm(emptyForm)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create challenge.')
    } finally {
      setBusy(false)
    }
  }

  async function seedStarters() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await callCtfAction<{ created: number; total: number }>('seedStarterChallenges')
      setNotice(result.created
        ? `Loaded ${result.created} of ${result.total} starter challenges.`
        : 'Starter challenges are already loaded.')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load starter challenges.')
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

  if (denied) return <main className="ctf-shell"><p className="ctf-label" role="alert">403 / OWNER ACCESS ONLY</p></main>

  return <main className="ctf-shell">
    <div className="admin-nav-links"><Link className="ctf-back" to="/home">← BOARD</Link><Link className="ctf-back" to="/scoreboard">SCOREBOARD</Link></div>
    <header className="ctf-heading">
      <p className="ctf-label">FIELD LOG / ADMIN</p>
      <h1>Challenge Registry</h1>
    </header>
    {error && <p role="alert" className="ctf-status">{error}</p>}
    {notice && <p role="status" className="ctf-status">{notice}</p>}
    <form className="admin-form" onSubmit={create}>
      <button className="admin-form-wide" type="button" disabled={busy} onClick={() => void seedStarters()}>
        {busy ? 'LOADING STARTERS' : 'LOAD STARTER CHALLENGES'}
      </button>
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
          <span className="ctf-data">{challenge.points} / {challenge.published ? 'PUBLISHED' : 'DRAFT'} <button type="button" onClick={() => void publish(challenge)}>{challenge.published ? 'UNPUBLISH' : 'PUBLISH'}</button></span>
        </div>)}
        {!challenges.length && <p className="ctf-empty">NO CONTACTS YET</p>}
      </div>
    </section>
  </main>
}
