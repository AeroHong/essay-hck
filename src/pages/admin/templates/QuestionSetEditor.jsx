import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { useAuth } from '../../../App.jsx'
import {
  getTemplate, createTemplate, updateTemplate, getTemplateKind, TEMPLATE_KIND_QUESTION_SET
} from '../../../services/reportTemplates.js'
import { sanitizePassageHtml, isEmptyHtml, htmlToText } from '../../../utils/sanitizeHtml.js'
import {
  sectionsToTree, treeToTemplate, treeTotalScore, addChild, emptyParent,
  autoParentHeading, autoChildHeading
} from '../../../utils/questionTree.js'
import { theme } from '../../../theme.js'
import RichTextEditor from '../../../components/richtext/RichTextEditor.jsx'
import ToastProvider from '../../../components/richtext/ToastProvider.jsx'
import { uploadPassageImage, isImageFile } from '../../../services/storage.js'

// 그림 위 표시용 배경 그림의 원래 크기 — 학생 화면에서 그림 비율대로 표시 칸을 잡는 데 쓴다
function readImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('그림을 불러오지 못했습니다.'))
    img.src = url
  })
}

/** 문항별 '그림 위 표시' 설정 — 배경 그림을 올리면 학생이 그 위에 빗금·펜으로 답한다 */
function DrawImageField({ value, onChange }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file) {
    if (!file) return
    if (!isImageFile(file)) { alert('그림 파일(png, jpg 등)만 올릴 수 있습니다.'); return }
    setBusy(true)
    try {
      const uploaded = await uploadPassageImage(file)
      const size = await readImageSize(uploaded.url)
      onChange({ url: uploaded.url, path: uploaded.path, ...size })
    } catch (err) {
      console.error('그림 업로드 실패:', err)
      alert(err.message || '그림을 올리지 못했습니다.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-600">그림 위 표시 (선택)</span>
        <span className="text-xs text-gray-400">그림을 올리면 학생이 그 위에 빗금·펜·직선으로 표시해 답합니다. 글 답안 칸도 함께 나옵니다.</span>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        <span className="ml-auto flex gap-1.5">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            {busy ? '올리는 중…' : value?.url ? '그림 바꾸기' : '그림 올리기'}
          </button>
          {value?.url && (
            <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-red-500 hover:bg-red-50">빼기</button>
          )}
        </span>
      </div>
      {value?.url && <img src={value.url} alt="그림 위 표시 배경" className="mt-2 max-h-64 rounded-lg border border-gray-200 bg-white" />}
    </div>
  )
}

const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'
const labelClass = 'block text-xs font-bold text-gray-600 mb-1.5'
const iconBtn = 'text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-300 px-1.5'

/** 답을 쓰는 칸의 설정 — 필수 응답·배점·분량 가이드·그림 위 표시 */
function AnswerOptions({ item, onChange }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={item.required} onChange={e => onChange({ required: e.target.checked })} />
          필수 응답
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap">배점</span>
          <input type="number" step="0.5" min="0" className={`${inputClass} !w-20`} value={item.maxScore ?? ''} onChange={e => onChange({ maxScore: e.target.value })} placeholder="예: 2" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap">분량 가이드(자, 선택)</span>
          <input type="number" className={`${inputClass} !w-24`} value={item.wordLimitGuide ?? ''} onChange={e => onChange({ wordLimitGuide: e.target.value })} placeholder="예: 200" />
        </div>
      </div>
      <DrawImageField value={item.drawImage} onChange={drawImage => onChange({ drawImage })} />
    </>
  )
}

/**
 * 서술형 문항 세트 편집기. 문항(공통 내용: 자료·상황) → 하위 문항(지시문·답안 칸) 2단 트리로 쓴다.
 * 하위 문항이 없는 문항은 그 자체가 답을 쓰는 문항이다. 저장 형식은 utils/questionTree.js 참고 —
 * 답을 쓰는 칸은 예전과 같은 reportTemplates.sections라서 배정·채점·리플레이는 그대로 동작한다.
 */
export default function QuestionSetEditor() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { templateId } = useParams()
  const isEdit = Boolean(templateId)
  const [title, setTitle] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [tree, setTree] = useState(() => [emptyParent()])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    getTemplate(templateId).then(t => {
      if (t && t.createdBy !== user.uid) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      if (t && getTemplateKind(t) !== TEMPLATE_KIND_QUESTION_SET) {
        navigate(`/admin/templates/${templateId}/edit`, { replace: true })
        return
      }
      if (t) {
        setTitle(t.title || '')
        setDescriptionHtml(t.descriptionHtml || plainToHtml(t.description))
        const loaded = sectionsToTree(t.sections || [], t.questionGroups || [])
        setTree(loaded.length ? loaded : [emptyParent()])
      }
      setLoading(false)
    })
  }, [isEdit, templateId, user, navigate])

  const setParent = (pi, patch) => setTree(prev => prev.map((p, i) => (i === pi ? { ...p, ...patch } : p)))
  const setChild = (pi, ci, patch) => setTree(prev => prev.map((p, i) => (
    i === pi ? { ...p, children: p.children.map((c, k) => (k === ci ? { ...c, ...patch } : c)) } : p
  )))

  function move(list, idx, dir) {
    const target = idx + dir
    if (target < 0 || target >= list.length) return list
    const next = [...list]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    return next
  }
  const moveParent = (pi, dir) => setTree(prev => move(prev, pi, dir))
  const moveChild = (pi, ci, dir) => setTree(prev => prev.map((p, i) => (i === pi ? { ...p, children: move(p.children, ci, dir) } : p)))

  const hasText = (html) => !isEmptyHtml(sanitizePassageHtml(html || ''))

  function removeParent(pi) {
    const p = tree[pi]
    const filled = hasText(p.promptHtml) || p.children.some(c => hasText(c.promptHtml))
    const label = p.heading.trim() || autoParentHeading(pi + 1)
    const msg = p.children.length ? `${label}과 하위 문항 ${p.children.length}개를 모두 삭제할까요?` : `${label}을 삭제할까요?`
    if (filled && !window.confirm(msg)) return
    setTree(prev => prev.filter((_, i) => i !== pi))
  }

  function removeChild(pi, ci) {
    const c = tree[pi].children[ci]
    if (hasText(c.promptHtml) && !window.confirm(`하위 문항 ${autoChildHeading(pi + 1, ci + 1)}을 삭제할까요?`)) return
    setTree(prev => prev.map((p, i) => (i === pi ? { ...p, children: p.children.filter((_, k) => k !== ci) } : p)))
  }

  const addChildTo = (pi) => setTree(prev => prev.map((p, i) => (i === pi ? addChild(p) : p)))
  const addParent = () => setTree(prev => [...prev, emptyParent()])

  async function handleSave() {
    if (!title.trim()) { alert('문항 세트 제목을 입력해주세요.'); return }
    const { sections, questionGroups } = treeToTemplate(tree, { sanitize: sanitizePassageHtml, isEmpty: isEmptyHtml })
    if (sections.length === 0) { alert('문항을 하나 이상 입력해주세요.'); return }

    const safeDescription = sanitizePassageHtml(descriptionHtml || '')
    const cleanDescription = isEmptyHtml(safeDescription) ? '' : safeDescription

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        // 공통 안내도 그림을 넣을 수 있게 서식 HTML(descriptionHtml)로 저장한다. description에는
        // 평문을 같이 남겨 두지만, 학생 화면은 descriptionHtml이 있으면 그쪽만 보여준다.
        descriptionHtml: cleanDescription,
        description: htmlToText(cleanDescription),
        sections,
        questionGroups,
        kind: TEMPLATE_KIND_QUESTION_SET
      }
      if (isEdit) await updateTemplate(templateId, payload)
      else await createTemplate(payload)
      navigate('/admin/question-sets')
    } catch (err) {
      console.error('문항 세트 저장 실패:', err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">다른 교사가 만든 문항 세트라 수정할 수 없습니다.</p>
          <button onClick={() => navigate('/admin/question-sets')} className="text-indigo-600 text-sm underline">돌아가기</button>
        </div>
      </div>
    )
  }

  const totalMaxScore = treeTotalScore(tree)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin/question-sets')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">{isEdit ? '문항 세트 수정' : '새 문항 세트 만들기'}</h1>
        {totalMaxScore > 0 && <span className="ml-auto text-xs text-gray-500">총 배점 {totalMaxScore}점</span>}
      </header>

      <main className="flex-1 p-5 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <label className={labelClass}>문항 세트 제목</label>
          <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 2학기 물리학Ⅱ 서술형 평가" />
        </div>

        <ThemeProvider theme={theme}>
          <ToastProvider>
            <div>
              <label className={labelClass}>공통 안내 (선택, 학생 화면 상단에 표시 — 그림도 붙여넣을 수 있습니다)</label>
              <RichTextEditor
                value={descriptionHtml}
                onChange={setDescriptionHtml}
                placeholder="예: 풀이 과정을 반드시 쓰시오. 단위를 빠뜨리면 감점됩니다."
              />
            </div>

            <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-700">
              문항마다 <b>공통 내용</b>(상황·자료·그림)을 쓰고, 그 아래에 <b>하위 문항</b>(1-1, 1-2 …)을 추가하세요.
              하위 문항마다 지시문·배점·답안 칸이 따로 생기고, 학생 화면에서는 지시문이 그 답안 칸 바로 위에 보입니다.
              하위 문항을 만들지 않으면 그 문항 자체가 답을 쓰는 문항이 됩니다.
            </p>

            <div className="space-y-5">
              {tree.map((p, pi) => {
                const n = pi + 1
                const hasChildren = p.children.length > 0
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-indigo-700 flex-shrink-0">{autoParentHeading(n)}</span>
                      <input
                        className={`${inputClass} flex-1`}
                        value={p.heading}
                        onChange={e => setParent(pi, { heading: e.target.value })}
                        placeholder={`문항 이름 (선택, 비우면 "${autoParentHeading(n)}")`}
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => moveParent(pi, -1)} disabled={pi === 0} title="위로" className={iconBtn}>▲</button>
                        <button onClick={() => moveParent(pi, 1)} disabled={pi === tree.length - 1} title="아래로" className={iconBtn}>▼</button>
                        <button onClick={() => removeParent(pi)} title="문항 삭제" className="text-gray-300 hover:text-red-500 px-1.5">✕</button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        {hasChildren
                          ? '공통 내용 — 하위 문항들 위에 한 번 보이는 상황·자료·그림입니다. (비워 둬도 됩니다)'
                          : "문항 내용 — 글을 쓰고, 그림은 붙여넣거나(Ctrl+V) 끌어다 놓으면 됩니다. '/'를 치면 서식 메뉴가 뜹니다."}
                      </label>
                      <RichTextEditor
                        value={p.promptHtml}
                        onChange={html => setParent(pi, { promptHtml: html })}
                        placeholder={hasChildren ? '상황·자료를 입력하세요.' : '문항을 입력하세요.'}
                      />
                    </div>

                    {!hasChildren && <AnswerOptions item={p} onChange={patch => setParent(pi, patch)} />}

                    {hasChildren && (
                      <div className="space-y-3 border-l-2 border-indigo-100 pl-4">
                        {p.children.map((c, ci) => (
                          <div key={c.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold text-gray-700 flex-shrink-0">{autoChildHeading(n, ci + 1)}</span>
                              <input
                                className={`${inputClass} flex-1 bg-white`}
                                value={c.heading}
                                onChange={e => setChild(pi, ci, { heading: e.target.value })}
                                placeholder={`하위 문항 이름 (선택, 비우면 "${autoChildHeading(n, ci + 1)}")`}
                              />
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => moveChild(pi, ci, -1)} disabled={ci === 0} title="위로" className={iconBtn}>▲</button>
                                <button onClick={() => moveChild(pi, ci, 1)} disabled={ci === p.children.length - 1} title="아래로" className={iconBtn}>▼</button>
                                <button onClick={() => removeChild(pi, ci)} title="하위 문항 삭제" className="text-gray-300 hover:text-red-500 px-1.5">✕</button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">지시문 — 학생 답안 칸 바로 위에 보입니다. 이 하위 문항에만 필요한 조건·그림도 여기에.</label>
                              <RichTextEditor
                                value={c.promptHtml}
                                onChange={html => setChild(pi, ci, { promptHtml: html })}
                                placeholder="예: 그래프의 면적을 이용하여 팽창하는 동안 기체가 한 일을 구하시오."
                              />
                            </div>
                            <AnswerOptions item={c} onChange={patch => setChild(pi, ci, patch)} />
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={() => addChildTo(pi)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                      + 하위 문항 추가{!hasChildren && ' (지금 쓴 내용은 공통 내용이 되고, 배점·그림 위 표시는 첫 하위 문항으로 옮겨집니다)'}
                    </button>
                  </div>
                )
              })}
            </div>
          </ToastProvider>
        </ThemeProvider>
        <button onClick={addParent} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ 문항 추가</button>

        <div className="flex gap-2 pt-2">
          <button onClick={() => navigate('/admin/question-sets')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </main>
    </div>
  )
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 공통 안내가 평문(description)만 있던 초기 문항 세트를 열면 서식 편집기에 옮겨 담는다.
function plainToHtml(text) {
  return (text || '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}
