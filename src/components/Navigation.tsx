import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { APP_NAME } from '../constants'
import { callCtfAction } from '../lib/ctf-actions'
import { setSoundEffectsEnabled } from '../lib/sound-effects'

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [isOwner, setIsOwner] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    let current = true
    if (!isLoaded || !isSignedIn) {
      setIsOwner(false)
      return () => { current = false }
    }
    void callCtfAction<boolean>('isOwner')
      .then((owner) => { if (current) setIsOwner(owner) })
      .catch(() => { if (current) setIsOwner(false) })
    return () => { current = false }
  }, [isLoaded, isSignedIn])

  const link = (to: string, label: string) => {
    const active = location.pathname === to || (to === '/home' && location.pathname.startsWith('/challenges/'))
    return <Link key={to} className={`topbar-link${active ? ' is-active' : ''}`} to={to} aria-current={active ? 'page' : undefined}>{label}</Link>
  }

  return <>
    <nav className="app-topbar" data-testid="app-navigation" aria-label="Main navigation">
      <div className="app-topbar-inner">
        <Link className="topbar-brand" to="/home">{APP_NAME}</Link>
        <div className="topbar-links">
          {link('/home', 'BOARD')}
          {link('/scoreboard', 'SCOREBOARD')}
          {isOwner && link('/admin', 'ADMIN')}
        </div>
        <div className="topbar-account">
          <button
            className="topbar-action"
            type="button"
            aria-label={`Turn sound effects ${soundEnabled ? 'off' : 'on'}`}
            aria-pressed={soundEnabled}
            onClick={() => {
              const nextEnabled = !soundEnabled
              setSoundEnabled(nextEnabled)
              setSoundEffectsEnabled(nextEnabled)
            }}
          >
            SOUND {soundEnabled ? 'ON' : 'OFF'}
          </button>
          {isSignedIn && !userLoading && user ? <span className="topbar-name" data-testid="nav-user-name">{user.name || user.email}</span> : null}
          {!isLoaded ? null : isSignedIn ? (
            <button className="topbar-action" type="button" onClick={() => void signOut()}>SIGN OUT</button>
          ) : (
            <button className="topbar-action" data-testid="nav-sign-in-button" type="button" onClick={() => setShowAuthModal(true)}>SIGN IN</button>
          )}
        </div>
      </div>
    </nav>
    {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
  </>
}
