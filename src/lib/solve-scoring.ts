export type SolveRecord = {
  recordId: string
  data: { userId: string; challengeId: string; points: number; solvedAt: string; firstSolve?: boolean }
}

export function tallySolves<T extends SolveRecord>(records: T[]) {
  const ordered = [...records].sort((left, right) => {
    const difference = Date.parse(left.data.solvedAt) - Date.parse(right.data.solvedAt)
    return Number.isFinite(difference) ? difference : 0
  })
  const earliestPerUserChallenge = new Map<string, T>()
  for (const solve of ordered) {
    const key = `${solve.data.userId}\u0000${solve.data.challengeId}`
    if (!earliestPerUserChallenge.has(key)) earliestPerUserChallenge.set(key, solve)
  }

  const earliestPerChallenge = new Map<string, T>()
  for (const solve of earliestPerUserChallenge.values()) {
    if (!earliestPerChallenge.has(solve.data.challengeId)) earliestPerChallenge.set(solve.data.challengeId, solve)
  }

  const countedSolves = [...earliestPerUserChallenge.values()].map((solve) => ({
    ...solve,
    firstSolve: earliestPerChallenge.get(solve.data.challengeId)?.recordId === solve.recordId,
  }))
  const totals = new Map<string, number>()
  for (const solve of countedSolves) {
    totals.set(solve.data.userId, (totals.get(solve.data.userId) ?? 0) + solve.data.points)
  }
  return { countedSolves, totals }
}
