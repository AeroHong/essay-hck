import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import AppHeader from '../../components/brand/AppHeader.jsx'
import { listAssignments, deleteAssignment, countSubmissionsForAssignment, getAssignmentClassrooms } from '../../services/essay.js'

const STATUS_LABEL = { open: '진행 중', closed: '마감' }

function formatDate(ts) {
  if (!ts?.toDate) return '마감일 없음'
  return ts.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export default function EssayAdminHome() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  // 이 화면은 이제 teacher 전용이다(super_admin은 SuperAdminHome을 본다) — 본인이 만든
  // 배정만 firestore.rules와 짝을 이뤄 필터링한다.
  function reload() {
    setLoading(true)
    listAssignments(user.uid).then(data => { setAssignments(data); setLoading(false) })
  }

  useEffect(() => { reload() }, [user])

  async function handleDelete(a) {
    const count = await countSubmissionsForAssignment(a.id, user.uid)
    const warn = count > 0
      ? `\n\n주의: 이미 작성/제출된 학생 응답이 ${count}건 있습니다. 배정을 삭제해도 학생 응답 데이터 자체는 남지만, 이 목록과 대시보드에서는 더 이상 접근할 수 없게 됩니다.`
      : ''
    if (!window.confirm(`"${a.title || '(제목 없음)'}" 배정을 삭제하시겠습니까? 되돌릴 수 없습니다.${warn}`)) return
    await deleteAssignment(a.id)
    reload()
  }

  const name = userInfo?.name || user?.displayName || ''
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
  const openCount = assignments.filter(a => a.status !== 'closed').length

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader z="z-30">
        <span className="hidden text-sm font-medium text-slate-600 sm:block">{name && `${name} 선생님`}</span>
        <button
          onClick={() => navigate('/help')}
          className="inline-flex min-h-[36px] items-center rounded-xl px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          사용법
        </button>
        <button
          onClick={async () => { await signOut(auth); navigate('/login') }}
          className="inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
        >
          로그아웃
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        <section className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">{today}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              안녕하세요{name ? `, ${name} 선생님` : ''} 👋
            </h1>
          </div>
          <button
            onClick={() => navigate('/admin/assignments/new')}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 font-semibold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-dark active:scale-95"
          >
            + 새 배정 만들기
          </button>
        </section>

        {/* 자료 관리 — 예전엔 머리말의 색색 테두리 버튼이었다 */}
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { to: '/admin/question-sets', icon: '📝', title: '서술형 문항', desc: '문항·하위 문항·배점·그림 위 표시' },
            { to: '/admin/templates', icon: '📋', title: '보고서 양식', desc: '항목별로 나눠 쓰는 보고서 틀' },
            { to: '/admin/passages', icon: '📄', title: '지문', desc: '읽고 답하는 글·자료' },
          ].map(m => (
            <button
              key={m.to}
              onClick={() => navigate(m.to)}
              className="group flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xl">{m.icon}</span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-900">{m.title} 관리</span>
                <span className="block truncate text-xs text-slate-500">{m.desc}</span>
              </span>
              <span className="ml-auto text-slate-300 transition group-hover:text-brand">→</span>
            </button>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">배정</h2>
            <span className="text-sm text-slate-500">전체 {assignments.length} · 진행 중 {openCount}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-slate-300 py-16 text-center">
              <div className="text-4xl">🗂️</div>
              <div className="mt-3 font-bold text-slate-800">아직 만든 배정이 없습니다</div>
              <p className="mt-1 text-sm text-slate-500">먼저 문항이나 지문을 등록한 뒤 배정을 만들어 보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assignments.map(a => {
                const closed = a.status === 'closed'
                const classrooms = getAssignmentClassrooms(a)
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/admin/assignments/${a.id}`)}
                    className="flex cursor-pointer flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand/40"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        closed ? 'bg-slate-100 text-slate-500' : 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200'
                      }`}>
                        {STATUS_LABEL[a.status] || a.status}
                      </span>
                      <h3 className="min-w-0 flex-1 truncate font-bold text-slate-900">{a.title || '(제목 없음)'}</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">마감 {formatDate(a.dueAt)}</p>
                    {classrooms.length > 0 && (
                      <p className="mt-1 truncate text-xs text-emerald-700">
                        🎓 {classrooms.map(c => c.courseName).filter(Boolean).join(', ')}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3">
                      <span className="text-sm font-semibold text-brand">대시보드 →</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/assignments/new?from=${a.id}`) }}
                        title="이 배정을 복제해서 새 배정 만들기 (설정은 그대로, 제출물·Classroom 게시는 새로)"
                        className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                      >
                        복제
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                        title="배정 삭제"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
