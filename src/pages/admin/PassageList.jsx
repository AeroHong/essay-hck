import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { listPassages, updatePassage, deletePassage, listAssignmentsUsingPassage } from '../../services/essay.js'
import AppHeader from '../../components/brand/AppHeader.jsx'

export default function PassageList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [passages, setPassages] = useState([])
  const [loading, setLoading] = useState(true)

  // 이 화면은 teacher 전용이다(super_admin은 지문을 직접 만들지 않는다) — 본인이 만든
  // 지문만 firestore.rules와 짝을 이뤄 필터링한다.
  function reload() {
    setLoading(true)
    listPassages(user.uid).then(data => { setPassages(data); setLoading(false) })
  }

  useEffect(() => { reload() }, [])

  async function toggleActive(p) {
    await updatePassage(p.id, { active: !p.active })
    reload()
  }

  async function handleDelete(p) {
    const using = await listAssignmentsUsingPassage(p.id)
    if (using.length > 0) {
      alert(`이 지문을 사용 중인 배정이 ${using.length}개 있어 삭제할 수 없습니다: ${using.map(a => a.title).join(', ')}\n먼저 그 배정을 삭제하거나 다른 지문으로 바꿔주세요.`)
      return
    }
    if (!window.confirm(`"${p.title || '(제목 없음)'}" 지문을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    await deletePassage(p.id)
    reload()
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <AppHeader title="지문 관리" onBack={() => navigate('/admin')}>
        <button
          onClick={() => navigate('/admin/passages/new')}
          className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-2 transition-colors active:scale-95"
        >
          + 새 지문
        </button>
      </AppHeader>

      <main className="flex-1 p-5 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : passages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            등록된 지문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {passages.map(p => (
              <div key={p.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-4 ${p.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{p.title || '(제목 없음)'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{p.bodyText?.slice(0, 80)}</p>
                </div>
                <button
                  onClick={() => toggleActive(p)}
                  className={`text-xs rounded-full px-2.5 py-1 border font-medium flex-shrink-0 ${
                    p.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {p.active ? '활성' : '보관'}
                </button>
                <button
                  onClick={() => navigate(`/admin/passages/${p.id}/edit`)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 font-medium transition-colors flex-shrink-0"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 font-medium transition-colors flex-shrink-0"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
