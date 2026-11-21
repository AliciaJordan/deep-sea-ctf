import { Link } from 'react-router-dom'
import { APP_NAME } from '../constants'

export default function NotFound() {
  return (
    <main className="ctf-shell not-found-page" aria-labelledby="not-found-heading">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <p className="ctf-label">SIGNAL LOST / 404</p>
      <h1 id="not-found-heading" className="not-found-heading">Page not found</h1>
      <p className="ctf-subtitle">This signal does not match a page in the Deep Sea CTF.</p>
      <Link className="ctf-back" to="/home">RETURN TO THE BOARD</Link>
    </main>
  )
}
