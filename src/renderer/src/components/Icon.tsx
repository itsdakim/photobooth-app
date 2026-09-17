import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
}

function base(children: ReactNode, { size = 20, strokeWidth = 1.8, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function IconChevronLeft(props: IconProps = {}): JSX.Element {
  return base(<polyline points="15,18 9,12 15,6" />, props)
}
export function IconChevronRight(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12,5 19,12 12,19" />
    </>,
    props
  )
}
export function IconCalendar(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>,
    props
  )
}
export function IconSliders(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <line x1="6" y1="4" x2="6" y2="20" />
      <circle cx="6" cy="9" r="2.2" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <circle cx="12" cy="15" r="2.2" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <circle cx="18" cy="7" r="2.2" />
    </>,
    props
  )
}
export function IconPulse(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <line x1="2" y1="12" x2="7" y2="12" />
      <polyline points="7,12 10,5 13,19 16,12 17,12" />
      <line x1="17" y1="12" x2="22" y2="12" />
    </>,
    props
  )
}
export function IconCamera(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <rect x="3" y="7" width="15" height="12" rx="2" />
      <path d="M18 10l3-2v8l-3-2" />
    </>,
    props
  )
}
export function IconCheck(props: IconProps = {}): JSX.Element {
  return base(<polyline points="20,6 9,17 4,12" />, props)
}
export function IconHome(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </>,
    props
  )
}
export function IconTrash(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <polyline points="4,7 20,7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </>,
    props
  )
}
export function IconEdit(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
    props
  )
}
export function IconPrint(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <polyline points="6,9 6,2 18,2 18,9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </>,
    props
  )
}
export function IconDownload(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <path d="M12 3v12" />
      <polyline points="7,10 12,15 17,10" />
      <path d="M4 19h16" />
    </>,
    props
  )
}
export function IconFilm(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="8" y1="4" x2="8" y2="20" />
      <line x1="16" y1="4" x2="16" y2="20" />
      <line x1="3" y1="9" x2="8" y2="9" />
      <line x1="3" y1="15" x2="8" y2="15" />
      <line x1="16" y1="9" x2="21" y2="9" />
      <line x1="16" y1="15" x2="21" y2="15" />
    </>,
    props
  )
}
export function IconShare(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <line x1="14" y1="14" x2="21" y2="14" />
      <line x1="14" y1="14" x2="14" y2="21" />
      <line x1="18" y1="18" x2="21" y2="18" />
      <line x1="18" y1="18" x2="18" y2="21" />
    </>,
    props
  )
}
export function IconPlay(props: IconProps = {}): JSX.Element {
  return base(<polygon points="6,4 20,12 6,20" />, props)
}
export function IconImage(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="M21 15l-5-5L5 21" />
    </>,
    props
  )
}
export function IconPlus(props: IconProps = {}): JSX.Element {
  return base(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
    props
  )
}
