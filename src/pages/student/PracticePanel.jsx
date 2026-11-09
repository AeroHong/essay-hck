import React, { useEffect, useState } from 'react'
import EssayEditor from '../../components/EssayEditor.jsx'
import SketchCanvas, { PromptInk } from '../../components/sketch/SketchCanvas.jsx'
import { PROMPT_BOX_CLASS } from '../../components/sketch/promptBoxes.js'

// 연습용 그래프(속도-시간) — 실제 문항 그림처럼 이미지로 넣어 빗금·필기를 연습한다. 외부 파일 없이 SVG로 그린다.
const PRACTICE_GRAPH = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">' +
  '<rect width="600" height="360" fill="#fff"/>' +
  '<g stroke="#e2e8f0">' + [120, 180, 240, 300, 360, 420, 480, 540].map(x => `<line x1="${x}" y1="30" x2="${x}" y2="300"/>`).join('') +
  [60, 120, 180, 240].map(y => `<line x1="60" y1="${y}" x2="560" y2="${y}"/>`).join('') + '</g>' +
  '<path d="M60 20 V300 H580" fill="none" stroke="#0f172a" stroke-width="2.5"/>' +
  '<path d="M60 270 L300 90 L540 90" fill="none" stroke="#2563eb" stroke-width="4"/>' +
  '<g font-family="sans-serif" font-size="16" fill="#334155"><text x="68" y="22">속도 v (m/s)</text><text x="470" y="350">시간 t (s)</text>' +
  '<text x="55" y="320">0</text><text x="292" y="320">4</text><text x="532" y="320">8</text><text x="30" y="95">20</text></g></svg>'
)
const PRACTICE_IMAGE = { url: PRACTICE_GRAPH, w: 600, h: 360 }

/**
 * 대기실(assignment.waitingRoomEnabled) 화면의 왼쪽 칸 — 교사가 "평가 시작"을 누르기 전까지
 * 실제 평가와 같은 입력창(수식 입력 포함)을 써볼 수 있게 한다. 입력 내용은 이 컴포넌트의
 * 로컬 state에만 있고 저장·로깅·제출되지 않으며, 평가가 시작되면 이 컴포넌트와 함께 사라진다.
 * paused: 평가 중 교사가 일시정지("대기실로 보내기")한 경우 — 안내 문구만 다르다.
 * @param {{calculatorEnabled: boolean, paused?: boolean}} props
 */
export default function PracticePanel({ calculatorEnabled, paused = false }) {
  const [text, setText] = useState('')
  // 문항 위 필기·그림 위 빗금 연습 — 이 화면의 로컬 state에만 있고 저장·기록되지 않는다
  const [promptInk, setPromptInk] = useState(null)
  const [drawInk, setDrawInk] = useState([])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-amber-800">{paused ? '⏸ 평가 일시정지' : '⏳ 평가 준비 시간'}</p>
          <span className="font-mono text-xs text-amber-700">대기 {mm}:{ss}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
          {paused
            ? '선생님이 평가를 잠시 멈췄습니다. 남은 시간도 멈춰 있고, 작성하던 답안은 저장되어 있습니다. 선생님이 재개하면 이 화면이 자동으로 답안 화면으로 돌아갑니다.'
            : <>선생님이 평가를 시작하면 이 화면이 자동으로 문항으로 바뀝니다. 그 전까지
              {calculatorEnabled ? ' 공학용 계산기와' : ''} 아래 문항 위 필기·그림 위 표시·입력창을 자유롭게 연습해보세요.</>}
        </p>
        <p className="mt-1 text-xs text-amber-700">연습 내용은 저장·제출되지 않으며, 평가가 {paused ? '재개되면' : '시작되면'} 지워집니다.</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">✏️ 연습 문항 — 문항 위에 펜으로 밑줄을 긋거나 풀이를 적어 보세요</p>
        <PromptInk ink={promptInk} onChange={setPromptInk}>
          <div className={PROMPT_BOX_CLASS}>
            <p>(연습) 그래프는 직선 도로를 달리는 자동차의 속도-시간 그래프이다. 0~4초 동안의 가속도를 구하시오.</p>
            <img src={PRACTICE_GRAPH} alt="연습용 속도-시간 그래프" className="mt-2 w-full max-w-md rounded-lg" draggable={false} />
          </div>
        </PromptInk>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">🖍️ 그림 위 표시 연습 — 빗금: 칠할 영역의 테두리를 한 바퀴 따라 그리세요</p>
        <SketchCanvas image={PRACTICE_IMAGE} value={drawInk} onChange={setDrawInk} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">⌨️ 연습용 입력창</p>
        <EssayEditor value={text} onChange={setText} wordLimitGuide={0} minHeight={120} />
      </div>
    </div>
  )
}
