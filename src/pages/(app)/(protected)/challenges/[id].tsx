import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { callCtfAction } from '../../../../lib/ctf-actions'
import type { PublicChallengeAttachment } from '../../../../lib/community-attachments'
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
  attachments: PublicChallengeAttachment[]
}
type LoadState = 'loading' | 'ready' | 'empty' | 'error'
const depths = ['', '10 m', '200 m', '1000 m', '4000 m']

export default function ChallengePage() {
  const { id = '' } = useParams()
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [flag, setFlag] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [pingState, setPingState] = useState<'correct' | 'wrong' | null>(null)
  const [pingKey, setPingKey] = useState(0)
  useEffect(() => {
    let active = true
    setChallenge(null)
    setLoadState('loading')
    setLoadError('')
    setStatus('')
    void callCtfAction<{ challenge: Challenge }>('getChallenge', { challengeId: id })
      .then(({ challenge }) => {
        if (!active) return
        setChallenge(challenge)
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Unable to load challenge.'
        if (message === 'Challenge unavailable.') {
          setLoadState('empty')
          return
        }
        setLoadError(message)
        setLoadState('error')
      })
    return () => { active = false }
  }, [id])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      const result = await callCtfAction<{
        correct: boolean
        alreadySolved?: boolean
        writeup?: string
        attemptsRemaining?: number
        retryAt?: string
      }>(
        'submitFlag',
        { challengeId: id, flag },
      )
      playSoundEffect(result.correct ? 'correct' : 'incorrect')
      setPingState(result.correct ? 'correct' : 'wrong')
      setPingKey((key) => key + 1)
      if (result.correct) {
        setStatus(result.alreadySolved ? 'Already recorded.' : 'Correct. Solve recorded.')
      } else if (result.attemptsRemaining === 0 && result.retryAt) {
        setStatus(`Incorrect flag. No attempts left; try again after ${result.retryAt} (UTC).`)
      } else if (typeof result.attemptsRemaining === 'number') {
        setStatus(`Incorrect flag. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining.`)
      } else {
        setStatus('Incorrect flag.')
      }
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
    {loadState === 'ready' && challenge ? <>
      <p className="ctf-label detail-depth"><DepthRing />{challenge.category} / DEPTH {depths[challenge.difficulty]}</p>
      <h1>{challenge.title}</h1>
      <p className="ctf-description">{challenge.description.split(/(\/(?:challenges|files)\/[a-z0-9._-]+)/g).map((part, index) =>
        /^\/(?:challenges|files)\/[a-z0-9._-]+$/.test(part)
          ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
          : part,
      )}</p>
      {challenge.attachments.length > 0 && <section aria-labelledby="challenge-files-heading">
        <h2 id="challenge-files-heading" className="ctf-label">CHALLENGE FILES</h2>
        <ul>{challenge.attachments.map((attachment) => <li key={attachment.attachmentId}>
          <a
            href={`/api/challenges/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment.attachmentId)}`}
            download
          >
            {attachment.name} ({attachment.size.toLocaleString()} bytes)
          </a>
        </li>)}</ul>
        <p>Files are submitted by other players. Open them in a VM or sandbox.</p>
      </section>}
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
    </> : loadState === 'loading' ? <div className="ctf-loading" role="status"><DepthRing state="loading" /><span className="ctf-label">LOCATING SIGNAL</span></div>
      : loadState === 'empty' ? <p className="ctf-empty" role="status">No released challenge matches this signal.</p>
        : <p className="ctf-status" role="alert">{loadError}</p>}
  </main>
}
