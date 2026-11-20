import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { callCtfAction } from '../../../../lib/ctf-actions'
import { DepthGauge, DepthRing } from '../../../../components/DepthRing'
import { playSoundEffect } from '../../../../lib/sound-effects'

type Challenge = {
  challengeId: string
  title: string
  category: string
  difficulty: number
  points: number
  description: string
  canSubmit?: boolean
  writeup?: string
}
const depths = ['', '10 m', '200 m', '1000 m', '4000 m']

export default function ChallengePage() {
  const { id = '' } = useParams()
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [flag, setFlag] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [pingState, setPingState] = useState<'correct' | 'wrong' | null>(null)
  const [pingKey, setPingKey] = useState(0)
  useEffect(() => {
    void callCtfAction<{ challenge: Challenge }>('getChallenge', { challengeId: id })
      .then(({ challenge }) => setChallenge(challenge))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Unable to load challenge.'))
  }, [id])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      const result = await callCtfAction<{ correct: boolean; alreadySolved?: boolean; writeup?: string }>(
        'submitFlag',
        { challengeId: id, flag },
      )
      playSoundEffect(result.correct ? 'correct' : 'incorrect')
      setPingState(result.correct ? 'correct' : 'wrong')
      setPingKey((key) => key + 1)
      setStatus(result.correct ? (result.alreadySolved ? 'Already recorded.' : 'Correct. Solve recorded.') : 'Incorrect flag.')
      if (result.writeup) setChallenge((current) => current ? { ...current, writeup: result.writeup } : current)
      setFlag('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Submission failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="ctf-shell ctf-detail">
    <DepthGauge />
    <div className="detail-nav"><Link className="ctf-back" to="/home">← BOARD</Link><Link className="ctf-back" to="/library">LIBRARY</Link></div>
    {challenge ? <>
      <p className="ctf-label detail-depth"><DepthRing />{challenge.category} / DEPTH {depths[challenge.difficulty]}</p>
      <h1>{challenge.title}</h1>
      <p className="ctf-description">{challenge.description.split(/(\/(?:challenges|files)\/[a-z0-9._-]+)/g).map((part, index) =>
        /^\/(?:challenges|files)\/[a-z0-9._-]+$/.test(part)
          ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
          : part,
      )}</p>
      <p className="ctf-data">{challenge.points} POINTS</p>
      {challenge.canSubmit === false
        ? <p className="ctf-status">CHALLENGE AUTHORS CANNOT SUBMIT THEIR OWN FLAGS.</p>
        : <form className="ctf-form" onSubmit={submit}>
          <label className="ctf-label" htmlFor="flag">FLAG</label>
          <input id="flag" name="flag" autoComplete="off" value={flag} onChange={(event) => setFlag(event.target.value)} required />
          <button disabled={busy}>{busy ? <><DepthRing state="loading" />CHECKING</> : 'SUBMIT'}</button>
        </form>}
      <p className="ctf-status" aria-live="polite">{status}{pingState && <DepthRing key={pingKey} state={pingState} className="submit-ping" />}</p>
      {challenge.writeup && <section className="solution-writeup" aria-labelledby="solution-heading">
        <h2 id="solution-heading" className="ctf-label">SOLUTION DEBRIEF</h2>
        <p>{challenge.writeup}</p>
      </section>}
    </> : status ? <p>{status}</p> : <div className="ctf-loading"><DepthRing state="loading" /><span className="ctf-label">LOCATING SIGNAL</span></div>}
  </main>
}
