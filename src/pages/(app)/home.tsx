import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUsers } from 'deepspace'
import { callCtfAction } from '../../lib/ctf-actions'
import { ContourPattern, DepthGauge, DepthRing } from '../../components/DepthRing'
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

function SonarScope({ challenges, solvedIds, bloomIds }: {
  challenges: Challenge[]
  solvedIds: Set<string>
  bloomIds: Set<string>
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
    <line className="scope-sweep" x1="300" y1="300" x2="300" y2="20" />
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

export default function HomePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'scope' | 'list'>('scope')
  const [ticker, setTicker] = useState<TickerSolve[]>([])
  const [bloomIds, setBloomIds] = useState<Set<string>>(() => new Set())
  const seenSolveIds = useRef<Set<string> | null>(null)
  const bloomTimers = useRef<number[]>([])
  const { records: solves, status: solvesStatus } = useQuery<Solve>('solves', { orderBy: 'solvedAt', orderDir: 'asc' })
  const { users } = useUsers()
  useEffect(() => {
    void callCtfAction<{ challenges: Challenge[] }>('listChallenges')
      .then((result) => setChallenges(result.challenges))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load challenges.'))
      .finally(() => setLoading(false))
  }, [])
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
      </header>
      <div className="ctf-columns">
        <section aria-labelledby="challenge-heading">
          <div className="challenge-heading-row">
            <h2 id="challenge-heading" className="ctf-label ctf-section-title">CHALLENGE BOARD</h2>
            <div className="scope-toggle" role="group" aria-label="Challenge view">
              <button type="button" aria-pressed={view === 'scope'} onClick={() => setView('scope')}>SCOPE</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>LIST</button>
            </div>
          </div>
          {error && <p role="status">{error}</p>}
          {view === 'scope' ? <div className="scope-panel">
            <SonarScope challenges={challenges} solvedIds={solvedIds} bloomIds={bloomIds} />
            <div className="sonar-ticker" role="log" aria-live="polite" aria-label="Recent contact log">
              {ticker.map((entry) => {
                const name = users.find((user) => user.id === entry.userId)?.name ?? entry.userId.slice(0, 8)
                const title = challenges.find((challenge) => challenge.challengeId === entry.challengeId)?.title ?? entry.challengeId.slice(0, 8)
                return <p key={entry.recordId}>CONTACT LOGGED / {name} / {title} / +{entry.points}</p>
              })}
            </div>
          </div> : <div className="depth-zones">
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
            {loading && <div className="ctf-loading"><DepthRing state="loading" /><span className="ctf-label">SCANNING FOR RELEASED SIGNALS</span></div>}
            {!loading && !challenges.length && !error && <p className="ctf-empty">No released signals.</p>}
          </div>}
        </section>
        <section className="ctf-scoreboard" aria-labelledby="score-heading">
          <ContourPattern />
          <h2 id="score-heading" className="ctf-label ctf-section-title">LIVE SCOREBOARD</h2>
          <div className="ctf-table" role="table" aria-label="Live scoreboard">
            <div className="ctf-row ctf-row-head" role="row"><span>RANK</span><span>CALLSIGN</span><span>SCORE</span></div>
            {scoreboard.map(([userId, points], index) => (
              <div className="ctf-row" role="row" key={userId}><span className="ctf-data">{String(index + 1).padStart(2, '0')}</span><span>{users.find((user) => user.id === userId)?.name ?? userId.slice(0, 8)}</span><span className="ctf-data">{points}</span></div>
            ))}
            {!scoreboard.length && <p className="ctf-empty">No solves logged.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
