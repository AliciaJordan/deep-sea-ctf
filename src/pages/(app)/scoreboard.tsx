import { useMemo } from 'react'
import { useQuery, useUsers } from 'deepspace'
import { ScoreboardTable } from '../../components/ScoreboardTable'
import { tallySolves } from '../../lib/solve-scoring'

type Solve = { userId: string; challengeId: string; points: number; solvedAt: string }

export default function ScoreboardPage() {
  const { records: solves } = useQuery<Solve>('solves', { orderBy: 'solvedAt', orderDir: 'asc' })
  const { users } = useUsers()
  const scores = useMemo(() => [...tallySolves(solves).totals].sort((a, b) => b[1] - a[1]), [solves])
  return <main className="ctf-shell scoreboard-page"><h1>Scoreboard</h1><ScoreboardTable scores={scores} users={users} /></main>
}
