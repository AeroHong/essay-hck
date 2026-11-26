import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { getAssignment, getAssignmentClassrooms, subscribeSubmissions } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { subscribeExperimentResults } from '../../services/experiments.js'
import ExperimentReport from '../../components/experiment/ExperimentReport.jsx'
import SketchCanvas, { PromptInk } from '../../components/sketch/SketchCanvas.jsx'
import { PROMPT_BOX_CLASS, GROUP_BOX_CLASS } from '../../components/sketch/promptBoxes.js'
import { ANSWER_HTML_CLASS } from '../../components/feedback/AnnotatedAnswer.jsx'
import { sanitizeAnswerHtml, sanitizePassageHtml } from '../../utils/sanitizeHtml.js'
import { renderMathInElement } from '../../utils/mathExpression.js'
import { hasSketch } from '../../utils/sketch.js'
import { groupMap } from '../../utils/questionTree.js'
import { readRosterCache } from '../../utils/rosterCache.js'
import { resolveStudentIdentity, compareStudentIdentity } from '../../utils/studentIdentity.js'

/**
 * 학생 결과물 인쇄 — 대시보드의 '일괄 인쇄'(지금 보고 있는 반 전체)와 각 학생 행·재생 화면의 '인쇄'(한 명)가
 * 모두 이 화면을 새 탭으로 연다. ?uids=a,b 로 학생을 고르고(없으면 배정 전체), ?autoprint=1 이면 그림이 다
 * 뜬 뒤 인쇄 창을 바로 띄운다.
 *
 * 학생마다 한 장씩 새 페이지에서 시작하고, 머리글(학번·이름·반)은 <thead>에 넣어 답안이 여러 장으로
 * 넘어가도 매 장 위에 다시 찍힌다(브라우저가 인쇄할 때 표 머리글을 페이지마다 반복한다).
 */
export default function PrintSubmissions() {
  const { assignmentId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [template, setTemplate] = useState(null)
  const [submissions, setSubmissions] = useState(null)
  const [experimentResults, setExperimentResults] = useState({})
  const [error, setError] = useState('')
  const [includePrompts, setIncludePrompts] = useState(false)
  const [includeScore, setIncludeScore] = useState(false)
  const [includeDrafts, setIncludeDrafts] = useState(true)
  const rootRef = useRef(null)
  const autoPrintedRef = useRef(false)

  const uidFilter = useMemo(() => {
    const raw = params.get('uids')
    return raw ? raw.split(',').filter(Boolean) : null
  }, [params])
  const autoPrint = params.get('autoprint') === '1'

  useEffect(() => {
    if (!user) return
    let unsub = () => {}
    let cancelled = false
    getAssignment(assignmentId).then(async a => {
      if (cancelled) return
      if (!a || a.createdBy !== user.uid) { setError('이 배정의 결과물을 인쇄할 권한이 없습니다.'); return }
      setAssignment(a)
      const usesSections = a.responseType === 'structured' || a.responseType === 'essay_calculator'
      if (usesSections && a.templateId) setTemplate(await getTemplate(a.templateId))
      unsub = subscribeSubmissions(assignmentId, setSubmissions, user.uid)
    }).catch(err => {
      console.error('인쇄용 배정 조회 실패:', err)
      setError('배정을 불러오지 못했습니다.')
    })
    return () => { cancelled = true; unsub() }
  }, [assignmentId, user])

  const hasExperiment = Boolean(assignment?.experiment)
  useEffect(() => {
    if (!hasExperiment || !user) return
    return subscribeExperimentResults(assignmentId, setExperimentResults, user.uid)
  }, [hasExperiment, assignmentId, user])

  const usesSections = assignment?.responseType === 'structured' || assignment?.responseType === 'essay_calculator'
  const isGradable = assignment?.responseType === 'essay_calculator'
  const roster = useMemo(() => readRosterCache(assignmentId)?.roster || null, [assignmentId])
  const courseNames = useMemo(
    () => Object.fromEntries(getAssignmentClassrooms(assignment).map(c => [c.courseId, c.courseName || ''])),
    [assignment]
  )

  // 인쇄할 학생 목록 — 학번 순. 학번은 제출물 이름 → Classroom 명단 이름 순으로 찾는다.
  const entries = useMemo(() => {
    if (!submissions) return null
    const singleOrPicked = Boolean(uidFilter)
    return submissions
      .filter(sub => (uidFilter ? uidFilter.includes(sub.studentUid) : true))
      .filter(sub => singleOrPicked || includeDrafts || sub.status === 'submitted')
      .map(sub => {
        const rosterEntry = roster?.[(sub.rosterEmail || sub.studentEmail || '').toLowerCase()]
        const identity = resolveStudentIdentity(sub.studentName, rosterEntry?.name)
        const className = sub.studentClass
          ? `${sub.studentClass}반`
          : (rosterEntry ? courseNames[rosterEntry.courseId] || '' : '')
        return { sub, ...identity, className }
      })
      .sort(compareStudentIdentity)
  }, [submissions, uidFilter, includeDrafts, roster, courseNames])

  const ready = Boolean(assignment && entries && (!usesSections || template !== null))

  useLayoutEffect(() => {
    if (ready && rootRef.current) renderMathInElement(rootRef.current)
  }, [ready, entries, includePrompts])

  useEffect(() => {
    document.title = assignment ? `${assignment.title || '결과물'} — 인쇄` : '결과물 인쇄'
  }, [assignment])

  // 그림이 다 뜬 뒤 한 번만 인쇄 창을 띄운다(덜 뜬 상태로 찍히면 빈칸이 된다). 너무 오래 걸리면 8초 뒤 그냥 띄운다.
  useEffect(() => {
    if (!autoPrint || !ready || autoPrintedRef.current || !entries?.length) return
    let done = false
    const fire = () => {
      if (done) return
      done = true
      autoPrintedRef.current = true
      window.print()
    }
    const imgs = [...(rootRef.current?.querySelectorAll('img') || [])]
    const pending = imgs.filter(img => !img.complete)
    const settle = () => setTimeout(fire, 400)
    if (!pending.length) { const t = settle(); return () => clearTimeout(t) }
    let left = pending.length
    const onOne = () => { left -= 1; if (left <= 0) settle() }
    pending.forEach(img => { img.addEventListener('load', onOne, { once: true }); img.addEventListener('error', onOne, { once: true }) })
    const timeout = setTimeout(fire, 8000)
    return () => {
      clearTimeout(timeout)
      pending.forEach(img => { img.removeEventListener('load', onOne); img.removeEventListener('error', onOne) })
    }
  }, [autoPrint, ready, entries])

  const totalMax = (template?.sections || []).reduce((sum, s) => sum + (s.maxScore || 0), 0)

  // 꼬리말(학번·이름·쪽수) — 학생마다 이름 붙은 페이지(page: stu-N)를 쓰고, 그 페이지의 아래 여백 상자에 찍는다.
  // Chrome은 이름 붙은 페이지마다 다른 꼬리말은 되지만, 쪽 번호를 학생마다 1부터 다시 세는 것(counter-reset)과
  // 학생별 전체 쪽수는 지원하지 않는다(Chrome 158에서 PDF로 직접 시험해 확인). 그래서 한 명만 인쇄하면 'n / 전체'가
  // 그 학생 기준으로 정확하고, 여러 명을 한꺼번에 인쇄하면 인쇄물 전체 기준 쪽수('전체 n / N쪽')로 표시한다.
  const footerCss = useMemo(() => {
    if (!entries?.length) return ''
    const single = entries.length === 1
    const cssString = v => `"${String(v).replace(/[\\"]/g, ' ').replace(/[\r\n]+/g, ' ')}"`
    return entries.map((e, i) => {
      const who = [e.studentNo, e.name || '(이름 없음)'].filter(Boolean).join(' ')
      const pages = single
        ? `counter(page) " / " counter(pages)`
        : `"전체 " counter(page) " / " counter(pages) "쪽"`
      return `.print-sheet[data-page-name="stu-${i}"] { page: stu-${i}; }
        @page stu-${i} { @bottom-center { content: ${cssString(who)} "  ·  " ${pages}; font-size: 9pt; color: #475569; } }`
    }).join('\n')
  }, [entries])

  if (error) return <div className="p-10 text-center text-gray-500">{error}</div>
  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm 12mm 16mm; }
        @media print {
          html, body { background: #fff !important; }
          .print-sheet { break-after: page; page-break-after: always; }
          .print-sheet:last-child { break-after: auto; page-break-after: auto; }
          .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          details > summary { display: none; }
        }
        ${footerCss}
      `}</style>

      {/* 화면 전용 도구 막대 */}
      <div className="print:hidden sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="mr-auto">
            <p className="font-bold text-gray-800">{assignment.title || '결과물'} — 인쇄</p>
            <p className="text-xs text-gray-400">{entries.length}명 · 학생마다 새 페이지에서 시작 · 쪽마다 아래에 학번·이름·쪽수</p>
            <p className="text-[11px] text-gray-400">인쇄 창의 '머리글과 바닥글'은 꺼 주세요(날짜·주소가 겹쳐 찍힙니다)</p>
          </div>
          {usesSections && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={includePrompts} onChange={e => setIncludePrompts(e.target.checked)} />
              문항 내용 포함
            </label>
          )}
          {isGradable && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={includeScore} onChange={e => setIncludeScore(e.target.checked)} />
              점수 포함
            </label>
          )}
          {!uidFilter && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={includeDrafts} onChange={e => setIncludeDrafts(e.target.checked)} />
              작성 중(미제출) 학생 포함
            </label>
          )}
          <button
            onClick={() => window.print()}
            disabled={!entries.length}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            🖨 인쇄하기
          </button>
        </div>
      </div>

      <div ref={rootRef} className="mx-auto max-w-[210mm] px-4 py-6 print:max-w-none print:p-0">
        {entries.length === 0 ? (
          <p className="py-16 text-center text-gray-400">인쇄할 결과물이 없습니다.</p>
        ) : entries.map((entry, i) => (
          <PrintSheet
            key={entry.sub.id}
            pageName={`stu-${i}`}
            entry={entry}
            assignment={assignment}
            template={template}
            usesSections={usesSections}
            includePrompts={includePrompts}
            includeScore={includeScore && isGradable}
            totalMax={totalMax}
            experimentResult={experimentResults[entry.sub.studentUid]}
          />
        ))}
      </div>
    </div>
  )
}

function formatDateTime(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 학생 한 명분 — 머리글(thead, 매 장 반복) + 답안 본문. */
function PrintSheet({ entry, pageName, assignment, template, usesSections, includePrompts, includeScore, totalMax, experimentResult }) {
  const { sub, studentNo, name, className } = entry
  const submittedLabel = sub.status === 'submitted'
    ? `제출 ${formatDateTime(sub.submittedAt)}`
    : '미제출(작성 중)'

  return (
    <div data-page-name={pageName} className="print-sheet mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm print:mb-0 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {/* table-fixed: 바깥 표가 내용 폭(학생이 넓은 화면에서 쓴 문항 위 필기 폭 등)에 끌려 종이 밖으로 커지지 않게
          종이 폭에 고정한다 — 그래야 필기 칸이 그 폭에 맞춰 줄어든다(SketchCanvas가 칸 폭을 재서 비율로 줄임). */}
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <td className="pb-3">
              <div className="flex items-end justify-between gap-4 border-b-2 border-gray-800 pb-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-gray-500">{assignment.title}</p>
                  <p className="text-[11px] text-gray-400">{submittedLabel}</p>
                </div>
                <div className="flex flex-shrink-0 items-stretch overflow-hidden rounded border border-gray-400 text-[13px]">
                  {className && (
                    <>
                      <span className="bg-gray-100 px-2 py-1 font-semibold text-gray-600">반</span>
                      <span className="min-w-[3.5rem] px-2 py-1 text-gray-900">{className}</span>
                    </>
                  )}
                  <span className="border-l border-gray-400 bg-gray-100 px-2 py-1 font-semibold text-gray-600">학번</span>
                  <span className="min-w-[4.5rem] px-2 py-1 font-semibold tabular-nums text-gray-900">{studentNo}</span>
                  <span className="border-l border-gray-400 bg-gray-100 px-2 py-1 font-semibold text-gray-600">이름</span>
                  <span className="min-w-[5rem] px-2 py-1 font-bold text-gray-900">{name || '(이름 없음)'}</span>
                  {includeScore && (
                    <>
                      <span className="border-l border-gray-400 bg-gray-100 px-2 py-1 font-semibold text-gray-600">점수</span>
                      <span className="min-w-[3.5rem] px-2 py-1 font-bold tabular-nums text-gray-900">
                        {sub.totalScore != null ? `${sub.totalScore}${totalMax > 0 ? ` / ${totalMax}` : ''}` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="align-top">
              {usesSections
                ? <SectionsBody template={template} sub={sub} includePrompts={includePrompts} includeScore={includeScore} experimentResult={experimentResult} />
                : <AnswerHtml html={sub.text} />}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function AnswerHtml({ html }) {
  const clean = sanitizeAnswerHtml(html || '')
  return clean
    ? <div className={ANSWER_HTML_CLASS} dangerouslySetInnerHTML={{ __html: clean }} />
    : <p className="text-sm text-gray-400">(작성 내용 없음)</p>
}

function SectionsBody({ template, sub, includePrompts, includeScore, experimentResult }) {
  const sections = template?.sections || []
  if (!sections.length) return <p className="text-sm text-gray-400">양식을 불러오지 못했습니다.</p>
  const groups = groupMap(template)
  let lastGroup = null
  return (
    <div className="space-y-5">
      {sections.map(sec => {
        const groupKey = sec.groupId || sec.groupLabel
        const showGroup = groupKey && groupKey !== lastGroup
        lastGroup = groupKey
        const group = sec.groupId ? groups.get(sec.groupId) : null
        const answer = sub.sections?.[sec.id] || {}
        const showSketch = Boolean(sec.drawImage?.url)
        const html = answer.text || ''
        return (
          <React.Fragment key={sec.id}>
            {showGroup && (
              <div className="space-y-2">
                <h2 className="border-b border-gray-300 pb-1 text-sm font-bold text-gray-900">{group?.label || sec.groupLabel}</h2>
                {includePrompts && group?.promptHtml && (
                  <PromptInk ink={answer.groupInk} readOnly>
                    <div className={GROUP_BOX_CLASS} dangerouslySetInnerHTML={{ __html: sanitizePassageHtml(group.promptHtml) }} />
                  </PromptInk>
                )}
              </div>
            )}
            <div>
              <div className="print-avoid-break mb-1.5 flex items-baseline justify-between gap-3">
                {sec.heading && <h3 className="text-sm font-bold text-gray-900">{sec.heading}</h3>}
                {includeScore && sec.maxScore != null && (
                  <span className="text-xs text-gray-500 tabular-nums">{answer.score ?? '—'} / {sec.maxScore}점</span>
                )}
              </div>
              {includePrompts && sec.promptHtml && (
                <div className="mb-2">
                  <PromptInk ink={answer.promptInk} readOnly>
                    <div className={PROMPT_BOX_CLASS} dangerouslySetInnerHTML={{ __html: sanitizePassageHtml(sec.promptHtml) }} />
                  </PromptInk>
                </div>
              )}
              {showSketch && (
                <div className="print-avoid-break mb-2">
                  {hasSketch(answer.ink)
                    ? <SketchCanvas image={sec.drawImage} value={answer.ink} readOnly />
                    : <p className="text-sm text-gray-400">(그림 위 표시 없음)</p>}
                </div>
              )}
              {sec.type === 'experiment'
                ? (experimentResult
                  ? <div className="print-avoid-break"><ExperimentReport result={experimentResult} /></div>
                  : <p className="text-sm text-gray-400">(실험 결과 미제출)</p>)
                : (showSketch && !html ? null : <AnswerHtml html={html} />)}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
