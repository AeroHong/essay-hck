import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo, LogoMark } from './Logo.jsx'

/**
 * 관리자·교사 화면 공용 머리말. 홈 화면은 로고(이름+부제), 하위 화면은 작은 로고 + ← 뒤로 + 제목.
 * @param {React.ReactNode} [title] 하위 화면 제목 — 없으면 홈 머리말(큰 로고)
 * @param {React.ReactNode} [subtitle]
 * @param {() => void} [onBack] ← 버튼 동작(없으면 버튼 없음)
 * @param {React.ReactNode} [children] 오른쪽 액션 영역
 * @param {string} [className] 추가 클래스(예: print:hidden)
 * @param {string} [homeTo] 로고를 눌렀을 때 갈 곳
 */
export default function AppHeader({ title, subtitle, onBack, children, className = '', homeTo = '/admin', z = 'z-10' }) {
  const navigate = useNavigate()
  return (
    <header className={`sticky top-0 ${z} border-b border-slate-200/80 bg-white/90 backdrop-blur ${className}`}>
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 sm:px-6">
        {title == null ? (
          <button type="button" onClick={() => navigate(homeTo)} className="rounded-xl" aria-label="홈으로">
            <Logo size={36} />
          </button>
        ) : (
          <>
            <button type="button" onClick={() => navigate(homeTo)} className="hidden shrink-0 rounded-lg sm:block" aria-label="홈으로" title="Essay Platform 홈">
              <LogoMark size={30} />
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="뒤로"
              >
                ←
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900">{title}</h1>
              {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
            </div>
          </>
        )}
        {title == null && <div className="flex-1" />}
        {children && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>}
      </div>
    </header>
  )
}
