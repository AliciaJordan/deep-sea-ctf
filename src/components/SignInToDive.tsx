import { useEffect, useState, type ReactNode } from 'react'
import { AuthOverlay, useAuth } from 'deepspace'

export default function SignInToDive({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    if (isSignedIn) setShowAuthModal(false)
  }, [isSignedIn])

  if (!isLoaded) {
    return <main className="ctf-shell" aria-busy="true"><p role="status">Checking your dive status...</p></main>
  }

  if (!isSignedIn) {
    return (
      <main className="ctf-shell" data-testid="signed-out-dive">
        <header className="ctf-heading">
          <p className="ctf-label">ACCESS REQUIRED</p>
          <h1>Sign in to dive</h1>
          <p className="ctf-subtitle">Sign in to browse challenges and follow the live scoreboard.</p>
          <button type="button" className="sonar-reactivate" onClick={() => setShowAuthModal(true)}>
            SIGN IN
          </button>
        </header>
        {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
      </main>
    )
  }

  return children
}
