// Essay Platform 표시: 원고지 한 장 + 청록 펜 (public/favicon.svg와 같은 모양).
// Classroom-live(Big Data/src/components/common/Logo.jsx)와 같은 짜임 — 짙은 brand 사각형 안 그림 + 이름·부제.
export function LogoMark({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2a3f53" />
      <path d="M15 12h24l10 10v30a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" fill="#fff" />
      <path d="M39 12v10h10" fill="#cfdae5" />
      <path d="M20 28h18M20 35h14M20 42h9" stroke="#7c97b0" strokeWidth="3" strokeLinecap="round" />
      <path d="M33 48l14-14 5 5-14 14-6 1z" fill="#06b6d4" stroke="#2a3f53" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ size = 36, light = false, sub = '서술형 평가 도구' }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className={`whitespace-nowrap font-extrabold tracking-tight ${light ? 'text-white' : 'text-brand-dark'}`} style={{ fontSize: Math.max(15, size * 0.5) }}>
          Essay Platform
        </div>
        {sub && <div className={`text-xs ${light ? 'text-white/70' : 'text-slate-500'}`}>{sub}</div>}
      </div>
    </div>
  )
}
