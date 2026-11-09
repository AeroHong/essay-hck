import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase.js'
import { Logo } from '../components/brand/Logo.jsx'

const FEATURES = [
  { icon: '📝', title: '서술형 문항 세트', text: '공통 자료 → 하위 문항, 배점·그림 위 표시까지' },
  { icon: '⏱️', title: '평가 운영', text: '대기실·제한시간·화면 이탈 감지·실시간 접속 현황' },
  { icon: '▶️', title: '작성 과정 재생', text: '붙여넣기·타이핑 기록으로 직접 썼는지 확인' },
  { icon: '🗒️', title: '채점과 피드백', text: '문항별 점수, 답안에 붙이는 포스트잇 피드백' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user

      // 학교 도메인 제한은 두지 않는다 — 개인 계정으로 들어온 학생은 로그인 자체는
      // 허용하고, 과제 화면(EssayWritePage)에서 학번·이름을 따로 받아 본인 확인을 한다.
      // Firestore users 컬렉션은 physlab과 공유 — 없으면 student로 신규 생성
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      const from = location.state?.from?.pathname

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName || '',
          role: 'student',
          class: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      } else {
        await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true })
      }

      // RootRedirect가 role에 따라 /admin 또는 안내 화면으로 보내주므로 '/'로 통일
      navigate(from || '/')
    } catch (err) {
      console.error('로그인 오류:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해주세요.')
      } else if (err.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.')
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    // Classroom-live 로그인과 같은 짜임: brand 그라데이션 + 옅은 격자 위에 소개(왼쪽)와 로그인 카드(오른쪽)
    <div className="relative flex min-h-screen flex-col overflow-hidden break-keep bg-gradient-to-br from-brand-dark via-brand to-brand-light text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1.25fr_1fr] lg:gap-16 lg:py-16">
        <section className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl">
            <div className="mb-6 lg:hidden">
              <Logo size={44} />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-brand-dark">시작하기</h2>
            <p className="mt-1 text-slate-500">Google 계정 하나로 선생님도 학생도 들어와요.</p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-6 font-semibold text-slate-700 shadow-sm transition-all hover:border-brand-light hover:bg-brand-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
              )}
              {loading ? '로그인 중...' : '구글 계정으로 로그인'}
            </button>

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-600">
              <p className="flex gap-3">
                <span className="text-xl">🧑‍🎓</span>
                <span><b className="text-slate-800">학생</b> — 선생님이 Classroom에 올린 링크로 들어와 로그인하면 바로 작성 화면이 열려요.</span>
              </p>
              <p className="flex gap-3">
                <span className="text-xl">🧑‍🏫</span>
                <span><b className="text-slate-800">선생님</b> — 로그인한 뒤 교사 권한을 요청하면 관리자가 승인해요.</span>
              </p>
            </div>
          </div>
        </section>

        <section className="order-2 lg:order-1">
          <div className="hidden lg:block">
            <Logo size={52} light />
          </div>
          <h1 className="mt-0 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:mt-10">
            쓰는 과정까지 보는<br />서술형 평가
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/80">
            문항을 만들어 Classroom에 내고, 학생이 쓰는 과정을 기록하고, 채점과 피드백까지 한곳에서.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(f => (
              <div key={f.title} className="flex gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                <span className="text-3xl">{f.icon}</span>
                <div>
                  <div className="font-bold">{f.title}</div>
                  <div className="mt-0.5 text-sm leading-snug text-white/75">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 pb-6 text-sm text-white/60">
        <span>Essay Platform · 서술형 평가 도구</span>
        <Link to="/help" className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-white/80 underline-offset-4 hover:text-white hover:underline">📖 선생님용 사용법</Link>
      </footer>
    </div>
  )
}
