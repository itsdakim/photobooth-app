import type { CSSProperties, ReactNode } from 'react'

interface DoodleProps {
  size?: number
  className?: string
  style?: CSSProperties
}

// Decorative line art in the same ink stroke as the rest of the UI. Place these
// in empty corners only — they sit under content and never take clicks.
function doodle(children: ReactNode, { size = 40, className = '', style }: DoodleProps, viewBox = '0 0 40 40'): JSX.Element {
  return (
    <svg
      className={`doodle ${className}`}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DoodleSparkle(props: DoodleProps): JSX.Element {
  return doodle(<path d="M20 4c1.2 8.6 3.4 14.8 16 16-12.6 1.2-14.8 7.4-16 16-1.2-8.6-3.4-14.8-16-16C16.6 18.8 18.8 12.6 20 4Z" />, props)
}

export function DoodleHeart(props: DoodleProps): JSX.Element {
  return doodle(<path d="M20 34C8 25 5 18 5 13.5 5 9.4 8 6.5 11.7 6.5c3.3 0 6 2 8.3 5.5 2.3-3.5 5-5.5 8.3-5.5 3.7 0 6.7 2.9 6.7 7 0 4.5-3 11.5-15 20.5Z" />, props)
}

export function DoodleFlower(props: DoodleProps): JSX.Element {
  return doodle(
    <>
      <circle cx="20" cy="20" r="3.4" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="20" cy="10.6" rx="4.2" ry="5.8" transform={`rotate(${deg} 20 20)`} />
      ))}
    </>,
    props
  )
}

export function DoodleSquiggle(props: DoodleProps): JSX.Element {
  return doodle(<path d="M3 24c4-10 7-10 9 0s5 10 9 0 7-10 9 0 4 6 7 0" />, { size: 56, ...props }, '0 0 40 40')
}

export function DoodleStar(props: DoodleProps): JSX.Element {
  return doodle(<path d="M20 5l4.4 9.6 10.4 1.2-7.8 7 2.2 10.4L20 27.8l-9.2 5.4 2.2-10.4-7.8-7 10.4-1.2L20 5Z" />, props)
}

interface ScallopFrameProps {
  size: number
  children: ReactNode
}

// Stamp-edge frame for the QR code: semicircular bumps around a square, filled
// in the deeper coral. The QR itself sits on a white tile so it stays scannable.
export function ScallopFrame({ size, children }: ScallopFrameProps): JSX.Element {
  const bumps = 9
  // Bumps bulge outward by one radius, so leave room for them (plus the stroke)
  // inside the viewBox: inset = r + 2 where r = (size - 2 * inset) / (2 * bumps).
  const inset = (size / (2 * bumps) + 2) / (1 + 1 / bumps)
  const span = size - inset * 2
  const r = span / bumps / 2
  const x0 = inset
  const y0 = inset
  let d = `M ${x0} ${y0}`
  for (let i = 0; i < bumps; i++) d += ` a ${r} ${r} 0 0 1 ${r * 2} 0`
  for (let i = 0; i < bumps; i++) d += ` a ${r} ${r} 0 0 1 0 ${r * 2}`
  for (let i = 0; i < bumps; i++) d += ` a ${r} ${r} 0 0 1 ${-r * 2} 0`
  for (let i = 0; i < bumps; i++) d += ` a ${r} ${r} 0 0 1 0 ${-r * 2}`
  d += ' Z'
  return (
    <div className="scallop-frame" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <path d={d} fill="var(--color-coral-deep)" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="scallop-frame-inner">{children}</div>
    </div>
  )
}
