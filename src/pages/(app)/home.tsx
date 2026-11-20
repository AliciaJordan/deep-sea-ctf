/* home pattern: data-forward — the live challenge board and solve activity are the primary surface */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUsers } from 'deepspace'
import { callCtfAction } from '../../lib/ctf-actions'
import { DepthGauge, DepthRing } from '../../components/DepthRing'
import { ScoreboardTable } from '../../components/ScoreboardTable'
import { tallySolves } from '../../lib/solve-scoring'

type Challenge = { challengeId: string; title: string; category: string; difficulty: number; points: number; description: string }
type Solve = { userId: string; challengeId: string; points: number; solvedAt: string }
type TickerSolve = { recordId: string; userId: string; challengeId: string; points: number; solvedAt: string }
const depths = ['', '10 m', '200 m', '1000 m', '4000 m']
const depthMeters = [0, 10, 200, 1000, 4000]
const zones = [1, 2, 3, 4]

function stableAngle(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296 * 360
}

function SonarScope({ challenges, solvedIds, bloomIds, scanCycle }: {
  challenges: Challenge[]
  solvedIds: Set<string>
  bloomIds: Set<string>
  scanCycle: number
}) {
  const ringRadii = [0, 58, 124, 190, 256]
  return <svg className="sonar-scope" viewBox="0 0 600 600" role="group" aria-label="Sonar scope of released challenges">
    <g className="scope-rings">
      {zones.map((difficulty) => <g key={difficulty}>
        <circle cx="300" cy="300" r={ringRadii[difficulty]} />
        <text x="300" y={292 - ringRadii[difficulty]}>{depths[difficulty].toUpperCase()}</text>
      </g>)}
    </g>
    <g className="scope-crosshair" aria-hidden="true">
      <path d="M20 300H580M300 20V580" />
      <circle cx="300" cy="300" r="3" />
    </g>
    <line key={scanCycle} className="scope-sweep" x1="300" y1="300" x2="300" y2="20" />
    {challenges.map((challenge) => {
      const angle = stableAngle(challenge.challengeId)
      const radius = ringRadii[challenge.difficulty] ?? ringRadii[1]
      const radians = angle * Math.PI / 180
      const x = 300 + Math.sin(radians) * radius
      const y = 300 - Math.cos(radians) * radius
      const size = Math.max(5, Math.min(10, Math.sqrt(Math.max(1, challenge.points)) / 2))
      const solved = solvedIds.has(challenge.challengeId)
      const tooltipX = Math.min(394, Math.max(8, x + 12))
      const tooltipY = Math.min(552, Math.max(12, y - 20))
      const animationStyle = { '--sweep-delay': `${(angle / 360 * 8).toFixed(2)}s` } as CSSProperties
      return <g key={challenge.challengeId}>
        {bloomIds.has(challenge.challengeId) && <circle className="scope-bloom" cx={x} cy={y} r={size + 4} />}
        <Link
          className={`scope-blip ${solved ? 'scope-blip--solved' : 'scope-blip--unsolved'}`}
          to={`/challenges/${encodeURIComponent(challenge.challengeId)}`}
          aria-label={`${challenge.title}, ${challenge.points} points, ${depths[challenge.difficulty]}, ${solved ? 'solved' : 'unsolved'}`}
          style={animationStyle}
        >
          <title>{`${challenge.title} / ${challenge.points} POINTS`}</title>
          <circle className="scope-dot" cx={x} cy={y} r={size} />
          <circle className="scope-hit" cx={x} cy={y} r="15" />
        </Link>
        <g className="scope-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true">
          <rect width="190" height="39" />
          <text x="8" y="15" textLength="172" lengthAdjust="spacingAndGlyphs">{challenge.title}</text>
          <text x="8" y="31">{challenge.points} POINTS</text>
        </g>
      </g>
    })}
  </svg>
}

function SignalState({ state, detail }: { state: 'loading' | 'empty' | 'error'; detail?: string }) {
  const copy = {
    loading: ['SCANNING FOR CONTACTS', 'Reading the released challenge field.'],
    empty: ['NO CONTACTS YET', 'New signals appear here when challenges are released.'],
    error: ['SIGNAL UNAVAILABLE', detail || 'The board could not be reached. Try again shortly.'],
  } as const
  return (
    <div className={`signal-state signal-state--${state}`} role={state === 'error' ? 'alert' : 'status'}>
      <DepthRing state={state === 'loading' ? 'loading' : undefined} />
      <div>
        <p className="ctf-label signal-state-title">{copy[state][0]}</p>
        <p className="signal-state-copy">{copy[state][1]}</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [rescanning, setRescanning] = useState(false)
  const [scanCycle, setScanCycle] = useState(0)
  const [scanMessage, setScanMessage] = useState('')
  const [view, setView] = useState<'scope' | 'list'>('scope')
  const [ticker, setTicker] = useState<TickerSolve[]>([])
  const [bloomIds, setBloomIds] = useState<Set<string>>(() => new Set())
  const knownChallengeIds = useRef(new Set<string>())
  const seenSolveIds = useRef<Set<string> | null>(null)
  const bloomTimers = useRef<number[]>([])
  const { records: solves, status: solvesStatus } = useQuery<Solve>('solves', { orderBy: 'solvedAt', orderDir: 'asc' })
  const { users } = useUsers()
  const loadChallenges = useCallback(async (reactivate = false) => {
    if (reactivate) {
      setRescanning(true)
      setScanMessage('')
    }
    setError('')
    try {
      const result = await callCtfAction<{ challenges: Challenge[] }>('listChallenges')
      const newCount = result.challenges.filter(({ challengeId }) => !knownChallengeIds.current.has(challengeId)).length
      knownChallengeIds.current = new Set(result.challenges.map(({ challengeId }) => challengeId))
      setChallenges(result.challenges)
      if (reactivate) {
        setScanCycle((cycle) => cycle + 1)
        setScanMessage(newCount
          ? `SCAN COMPLETE / ${newCount} NEW SIGNAL${newCount === 1 ? '' : 'S'} DETECTED`
          : 'SCAN COMPLETE / NO NEW SIGNALS')
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load challenges.')
    } finally {
      setLoading(false)
      if (reactivate) setRescanning(false)
    }
  }, [])
  useEffect(() => { void loadChallenges() }, [loadChallenges])
  const scoring = useMemo(() => tallySolves(solves), [solves])
  const scoreboard = useMemo(() => [...scoring.totals].sort((a, b) => b[1] - a[1]), [scoring])
  const solvedIds = useMemo(() => new Set(scoring.countedSolves.map((solve) => solve.data.challengeId)), [scoring])

  useEffect(() => () => bloomTimers.current.forEach((timer) => window.clearTimeout(timer)), [])
  useEffect(() => {
    if (solvesStatus !== 'ready') return
    const current = new Set(scoring.countedSolves.map((solve) => solve.recordId))
    if (!seenSolveIds.current) {
      seenSolveIds.current = current
      return
    }
    const fresh = scoring.countedSolves.filter((solve) => !seenSolveIds.current?.has(solve.recordId))
    seenSolveIds.current = current
    if (!fresh.length) return
    setTicker((items) => [...fresh.map((solve) => ({
      recordId: solve.recordId,
      userId: solve.data.userId,
      challengeId: solve.data.challengeId,
      points: solve.data.points,
      solvedAt: solve.data.solvedAt,
    })), ...items].slice(0, 8))
    setBloomIds((currentIds) => new Set([...currentIds, ...fresh.map((solve) => solve.data.challengeId)]))
    for (const solve of fresh) {
      const timer = window.setTimeout(() => {
        setBloomIds((currentIds) => {
          const next = new Set(currentIds)
          next.delete(solve.data.challengeId)
          return next
        })
      }, 1000)
      bloomTimers.current.push(timer)
    }
  }, [scoring, solvesStatus])

  return (
    <div className="ctf-shell">
      <DepthGauge />
      <header className="ctf-heading">
        <p className="ctf-label">FIELD LOG / 01 — OPERATIONS</p>
        <h1>Deep Sea CTF</h1>
        <p className="ctf-subtitle">Recover the signal. Record each solve.</p>
        <div className="ctf-readout" aria-label="Live operation summary">
          <div className="ctf-readout-cell"><strong>{challenges.length}</strong><span>RELEASED CONTACTS</span></div>
          <div className="ctf-readout-cell"><strong>{scoring.countedSolves.length}</strong><span>SOLVES RECORDED</span></div>
          <div className="ctf-readout-cell"><strong>{scoreboard.length}</strong><span>OPERATORS SCORING</span></div>
        </div>
      </header>
      <div className="ctf-columns">
        <section aria-labelledby="challenge-heading">
          <div className="challenge-heading-row">
            <h2 id="challenge-heading" className="ctf-label ctf-section-title">CHALLENGE BOARD</h2>
            <div className="challenge-heading-actions">
              {scanMessage && <span className="sonar-scan-status" role="status" aria-live="polite">{scanMessage}</span>}
              <button
                type="button"
                className="sonar-reactivate"
                disabled={loading || rescanning}
                aria-busy={rescanning}
                onClick={() => { void loadChallenges(true) }}
              >
                {rescanning ? 'SCANNING...' : 'REACTIVATE SONAR'}
              </button>
              <div className="scope-toggle" role="group" aria-label="Challenge view">
                <button type="button" aria-pressed={view === 'scope'} onClick={() => setView('scope')}>SCOPE</button>
                <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>LIST</button>
              </div>
            </div>
          </div>
          {error && challenges.length > 0 && <p role="alert" className="sonar-scan-error">{error}</p>}
          {view === 'scope' ? <div className="scope-panel">
            <div className="scope-panel-head">
              <span className="ctf-label">RANGE / 000—4000 M</span>
              <div className="scope-legend" aria-label="Contact status legend">
                <span><i className="scope-legend-dot scope-legend-dot--open" />OPEN</span>
                <span><i className="scope-legend-dot scope-legend-dot--solved" />LOGGED</span>
              </div>
            </div>
            <SonarScope challenges={challenges} solvedIds={solvedIds} bloomIds={bloomIds} scanCycle={scanCycle} />
            {loading && <SignalState state="loading" />}
            {!loading && !challenges.length && <SignalState state={error ? 'error' : 'empty'} detail={error} />}
            {!!challenges.length && <div className="sonar-ticker" role="log" aria-live="polite" aria-label="Recent contact log">
              {!ticker.length && <p>LIVE FEED / WAITING FOR FIRST SOLVE</p>}
              {ticker.map((entry) => {
                const name = users.find((user) => user.id === entry.userId)?.name ?? entry.userId.slice(0, 8)
                const title = challenges.find((challenge) => challenge.challengeId === entry.challengeId)?.title ?? entry.challengeId.slice(0, 8)
                return <p key={entry.recordId}>CONTACT LOGGED / {name} / {title} / +{entry.points}</p>
              })}
            </div>}
          </div> : loading ? <SignalState state="loading" /> : !challenges.length ? <SignalState state={error ? 'error' : 'empty'} detail={error} /> : <div className="depth-zones">
            {zones.map((difficulty) => {
              const zoneChallenges = challenges.filter((challenge) => challenge.difficulty === difficulty)
              return <section className={`depth-zone depth-zone-${difficulty}`} key={difficulty} aria-labelledby={`depth-${difficulty}`}>
                <h3 className="depth-zone-heading" id={`depth-${difficulty}`}><span className="depth-watermark" aria-hidden="true">{depthMeters[difficulty]}</span><DepthRing /><span>{depths[difficulty]}</span><small>DEPTH BAND {String(difficulty).padStart(2, '0')}</small></h3>
                <div className="ctf-table" role="table" aria-label={`${depths[difficulty]} challenges`}>
                  <div className="ctf-row ctf-row-head" role="row"><span>STATE</span><span>CHALLENGE / CATEGORY</span><span>POINTS</span></div>
                  {zoneChallenges.map((challenge) => {
                    const solved = solvedIds.has(challenge.challengeId)
                    return <Link className={`ctf-row ${solved ? 'ctf-solved' : ''}`} role="row" key={challenge.challengeId} to={`/challenges/${encodeURIComponent(challenge.challengeId)}`}>
                      <span className={`solve-state ${solved ? 'is-solved' : ''}`}>{solved ? <span className="contact-stamp">CONTACT LOGGED</span> : <span className="dim-dot" aria-label="Unsolved" />}</span>
                      <span><strong>{challenge.title}</strong><small>{challenge.category}</small></span>
                      <span className="ctf-data">{challenge.points}</span>
                    </Link>
                  })}
                  {!zoneChallenges.length && <p className="ctf-empty">No signal logged at this depth.</p>}
                </div>
              </section>
            })}
          </div>}
        </section>
        <ScoreboardTable scores={scoreboard} users={users} />
      </div>
    </div>
  )
}
