type DepthRingProps = { className?: string; state?: 'loading' | 'correct' | 'wrong' }

export function DepthRing({ className = '', state }: DepthRingProps) {
  return (
    <svg className={`depth-ring ${state ? `depth-ring-${state}` : ''} ${className}`} viewBox="0 0 48 48" aria-hidden="true">
      <circle className="ring-outer" cx="24" cy="24" r="19" />
      <circle className="ring-inner" cx="24" cy="24" r="12" />
      <circle className="ring-orbit" cx="24" cy="5" r="1.5" />
    </svg>
  )
}

export function DepthGauge() {
  return (
    <aside className="depth-gauge" aria-label="Depth gauge, 0 to 4000 meters">
      <span className="gauge-title">DEPTH</span>
      <svg viewBox="0 0 38 260" role="img" aria-label="Depth ruler marked every 100 meters">
        <path d="M25 4V256" className="gauge-spine" />
        {Array.from({ length: 41 }, (_, tick) => {
          const y = 5 + tick * 6.25
          const major = tick % 10 === 0
          return <g key={tick}><path d={`M${major ? 9 : 17} ${y}H25`} className={major ? 'gauge-major' : 'gauge-tick'} />{major && <text x="5" y={y + 3} className="gauge-mark">{tick * 100}</text>}</g>
        })}
      </svg>
      <span className="gauge-current">0000 M</span>
    </aside>
  )
}

export function ContourPattern() {
  return (
    <svg className="contour-pattern" viewBox="0 0 420 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><pattern id="contours" width="420" height="320" patternUnits="userSpaceOnUse">
        <path d="M-40 48C20 6 88 7 134 40s81 45 129 12 100-26 175 9M-35 77c59-43 124-42 170-9s81 45 129 12 100-26 175 9M-28 108c60-42 124-42 170-9s81 45 129 12 100-26 175 9M-30 164c61-42 125-42 171-9s81 45 129 12 100-26 175 9M-26 197c59-42 124-42 170-9s81 45 129 12 100-26 175 9M-30 235c59-42 124-42 170-9s81 45 129 12 100-26 175 9" />
      </pattern></defs><rect width="420" height="320" fill="url(#contours)" />
    </svg>
  )
}
