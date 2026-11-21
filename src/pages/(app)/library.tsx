import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SignInToDive from '../../components/SignInToDive'
import { callCtfAction } from '../../lib/ctf-actions'
import { DepthGauge, DepthRing } from '../../components/DepthRing'

type Challenge = {
  challengeId: string
  title: string
  category: string
  difficulty: number
  points: number
  description: string
}

const depths = ['', '10 m', '200 m', '1000 m', '4000 m']

export default function LibraryPage() {
  return <SignInToDive><ChallengeLibrary /></SignInToDive>
}

function ChallengeLibrary() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void callCtfAction<{ challenges: Challenge[] }>('listChallenges')
      .then(({ challenges: published }) => setChallenges(published))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load challenges.'))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(
    () => [...new Set(challenges.map((challenge) => challenge.category))].sort(),
    [challenges],
  )
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return challenges.filter((challenge) => {
      if (category && challenge.category !== category) return false
      if (difficulty && challenge.difficulty !== Number(difficulty)) return false
      if (!search) return true
      return [challenge.title, challenge.category, challenge.description]
        .some((value) => value.toLocaleLowerCase().includes(search))
    })
  }, [category, challenges, difficulty, query])

  return <main className="ctf-shell community-library">
    <DepthGauge />
    <header className="ctf-heading">
      <p className="ctf-label">FIELD LOG / COMMUNITY</p>
      <h1>Challenge Library</h1>
      <p className="ctf-subtitle">Search the released signals, then submit a solution from the challenge page.</p>
    </header>
    <div className="library-toolbar">
      <label>
        <span className="ctf-label">SEARCH</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title, category, or description"
          aria-label="Search challenges"
        />
      </label>
      <label>
        <span className="ctf-label">CATEGORY</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span className="ctf-label">DEPTH</span>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Filter by depth">
          <option value="">All depths</option>
          {depths.slice(1).map((value, index) => <option key={value} value={index + 1}>{value}</option>)}
        </select>
      </label>
      <Link className="library-create-link" to="/submit-challenge">CREATE A CHALLENGE</Link>
    </div>
    {loading ? <div className="ctf-loading" role="status"><DepthRing state="loading" /><span className="ctf-label">SCANNING RELEASED CHALLENGES</span></div>
      : error ? <p className="ctf-status" role="alert">{error}</p>
      : filtered.length ? <section className="library-results" aria-label="Challenge search results">
        <p className="ctf-label">{filtered.length} SIGNAL{filtered.length === 1 ? '' : 'S'} FOUND</p>
        {filtered.map((challenge) => <Link
          className="library-card"
          key={challenge.challengeId}
          to={`/challenges/${encodeURIComponent(challenge.challengeId)}`}
        >
          <div className="library-card-meta">
            <span>{challenge.category} / DEPTH {depths[challenge.difficulty] ?? 'UNKNOWN'}</span>
            <span>{challenge.points} POINTS</span>
          </div>
          <h2>{challenge.title}</h2>
          <p>{challenge.description}</p>
        </Link>)}
      </section> : <p className="ctf-empty" role="status">{challenges.length ? 'NO SIGNALS MATCH YOUR SEARCH' : 'NO RELEASED CHALLENGES YET'}</p>}
  </main>
}
