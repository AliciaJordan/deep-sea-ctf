import { ContourPattern } from './DepthRing'

type ScoreboardTableProps = {
  scores: Array<[string, number]>
  users: Array<{ id: string; name?: string | null }>
}

export function ScoreboardTable({ scores, users }: ScoreboardTableProps) {
  return <section className="ctf-scoreboard" aria-labelledby="score-heading">
    <ContourPattern />
    <h2 id="score-heading" className="ctf-label ctf-section-title">LIVE SCOREBOARD</h2>
    <div className="ctf-table" role="table" aria-label="Live scoreboard">
      <div className="ctf-row ctf-row-head" role="row"><span>RANK</span><span>CALLSIGN</span><span>SCORE</span></div>
      {scores.map(([userId, points], index) => (
        <div className="ctf-row" role="row" key={userId}>
          <span className="ctf-data">{String(index + 1).padStart(2, '0')}</span>
          <span>{users.find((user) => user.id === userId)?.name ?? userId.slice(0, 8)}</span>
          <span className="ctf-data">{points}</span>
        </div>
      ))}
      {!scores.length && <p className="ctf-empty">No solves logged.</p>}
    </div>
  </section>
}
