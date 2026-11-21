/* landing pattern: split-hero — product promise and depth instrument share the first screen */
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../config/seo'

const depthBands = [
  { depth: '10 M', zone: 'SUNLIT', index: '01' },
  { depth: '200 M', zone: 'TWILIGHT', index: '02' },
  { depth: '1,000 M', zone: 'MIDNIGHT', index: '03' },
  { depth: '4,000 M', zone: 'ABYSS', index: '04' },
]

function DepthInstrument() {
  return (
    <div className="landing-instrument">
      <div className="landing-instrument-head">
        <span>SONAR RANGE</span>
        <span>000—4000 M</span>
      </div>
      <svg className="landing-sonar" viewBox="0 0 520 440" role="img" aria-labelledby="landing-sonar-title landing-sonar-desc">
        <title id="landing-sonar-title">Sonar depth instrument</title>
        <desc id="landing-sonar-desc">Four depth bands descend from the sunlit surface to the 4,000 meter abyss.</desc>
        <defs>
          <linearGradient id="sonar-sweep-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#A9CFE8" stopOpacity="0" />
            <stop offset="1" stopColor="#A9CFE8" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        <g className="landing-sonar-rings">
          <circle cx="260" cy="220" r="68" />
          <circle cx="260" cy="220" r="132" />
          <circle cx="260" cy="220" r="196" />
        </g>
        <path className="landing-sonar-crosshair" d="M52 220H468M260 12V428" />
        <path className="landing-sonar-beam" d="M260 220L260 24A196 196 0 0 1 399 82Z" fill="url(#sonar-sweep-gradient)" />
        <line className="landing-sonar-sweep" x1="260" y1="220" x2="260" y2="24" />
        <circle className="landing-sonar-origin" cx="260" cy="220" r="3" />
        <g className="landing-sonar-targets">
          <circle cx="260" cy="152" r="4" />
          <circle cx="352" cy="126" r="5" />
          <circle cx="164" cy="88" r="4" />
          <circle cx="260" cy="24" r="3" />
        </g>
        <text className="landing-sonar-label" x="260" y="215" textAnchor="middle">DEPTH</text>
        <text className="landing-sonar-center" x="260" y="239" textAnchor="middle">4000 M</text>
        <text className="landing-sonar-mark" x="260" y="46" textAnchor="middle">10 M</text>
        <text className="landing-sonar-mark" x="386" y="112">200 M</text>
        <text className="landing-sonar-mark" x="76" y="112">1000 M</text>
      </svg>
      <div className="landing-instrument-foot">
        <span>DEPTH SETS THE DIFFICULTY</span>
        <span>CLUES / CRYPTO / WEB</span>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div className="landing-page" data-testid="static-landing">
        <div className="landing-wrap">
          <header className="landing-nav">
            <Link className="landing-brand" to="/" aria-label="Deep Sea CTF home">
              <span className="landing-brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <span>{APP_NAME}<small>FIELD LOG / 01</small></span>
            </Link>
            <Link className="landing-nav-link" to="/home">ENTER OPERATIONS <span aria-hidden="true">↗</span></Link>
          </header>

          <main>
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-eyebrow"><span /> MARINE CYBERSECURITY / LIVE CTF</p>
                <h1>Recover the signal.<br /><em>Record the solve.</em></h1>
                <p className="landing-lede">
                  A capture-the-flag arena built for student crews. Decode ocean-floor clues,
                  submit your flag, and watch the live board shift with every solve.
                </p>
                <div className="landing-actions">
                  <Link className="landing-cta" to="/home">ENTER THE BOARD <span aria-hidden="true">↗</span></Link>
                  <Link className="landing-secondary" to="/scoreboard">VIEW SCOREBOARD</Link>
                </div>
                <p className="landing-assurance">FLAGS VERIFIED SERVER-SIDE <span /> REAL-TIME SCOREBOARD</p>
              </div>
              <DepthInstrument />
            </section>

            <section className="landing-depths" aria-labelledby="landing-depths-title">
              <div className="landing-depths-head">
                <p id="landing-depths-title">DESCENT PROFILE</p>
                <span>FOUR BANDS / ONE LIVE BOARD</span>
              </div>
              <div className="landing-depth-grid">
                {depthBands.map((band) => (
                  <div className="landing-depth-band" key={band.index}>
                    <span className="landing-depth-index">{band.index}</span>
                    <strong>{band.depth}</strong>
                    <span className="landing-depth-zone">{band.zone}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="landing-how-to" aria-labelledby="landing-how-to-title">
              <div>
                <p className="landing-how-to-label">FIELD GUIDE</p>
                <h2 id="landing-how-to-title">How to play</h2>
              </div>
              <ol className="landing-steps">
                <li>
                  <span>01</span>
                  <strong>Sign in</strong>
                  <p>Open the board and sign in to join the crew.</p>
                </li>
                <li>
                  <span>02</span>
                  <strong>Pick a challenge</strong>
                  <p>Choose a released signal from the board or library.</p>
                </li>
                <li>
                  <span>03</span>
                  <strong>Submit the flag</strong>
                  <p>Enter your answer in the <code>ocean{'{'}...{'}'}</code> format.</p>
                </li>
              </ol>
            </section>
          </main>

          <footer className="landing-footer">
            <span>DEEP SEA CTF / STUDENT CREW OPERATIONS</span>
            <span>FOLLOW THE SIGNAL DOWN</span>
          </footer>
        </div>
      </div>
    </>
  )
}
