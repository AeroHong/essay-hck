import React, { useEffect, useId, useRef, useState } from 'react'
import {
  SKETCH_W, SKETCH_COLORS, SKETCH_WIDTH, MAX_SKETCH_NUMBERS,
  sketchHeight, finishPoints, strokePath, polygonPath, snapLine, isHatchable, eraseItems,
  strokeWidthOf, sketchSize, normalizeSketch
} from '../../utils/sketch.js'

const TOOLS = [
  { id: 'hatch', label: '빗금', title: '영역 테두리를 따라 그리면 안쪽이 빗금으로 칠해집니다' },
  { id: 'pen', label: '펜', title: '자유롭게 그리기' },
  { id: 'line', label: '직선', title: '끌어서 직선 긋기 (수평·수직 가까이면 반듯하게)' },
  { id: 'marker', label: '형광펜', title: '반투명하게 굵게 칠하기' },
  { id: 'eraser', label: '지우개', title: '문지른 표시를 지웁니다 (빗금은 안쪽을 눌러도 지워집니다)' },
]
const COLOR_NAMES = ['빨강', '파랑', '검정']

let seq = 0
const newId = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * 문항 배경 그림 위에 펜·직선·빗금으로 표시하는 칸 (학생 작성 / 교사 채점 공용).
 * @param {{url:string, w:number, h:number}} image 배경 그림 (문항 세트의 sections[].drawImage)
 * @param {Array} value 표시 항목 배열 (utils/sketch.js 참고)
 * @param {(items:Array)=>void} [onChange]
 * @param {boolean} [readOnly]
 */
export default function SketchCanvas({ image, value, onChange, readOnly = false }) {
  const items = normalizeSketch(value)
  const H = sketchHeight(image)
  const svgRef = useRef(null)
  const draft = useRef(null)
  const penSeen = useRef(false)
  const history = useRef([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const [tool, setTool] = useState('hatch')
  const [color, setColor] = useState(SKETCH_COLORS[0])
  const [dir, setDir] = useState(1)
  const [, setTick] = useState(0)
  const [notice, setNotice] = useState('')
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  // iPad Safari: 길게 누를 때 돋보기·글자 선택·스크롤이 끼어들지 않게
  useEffect(() => {
    const el = svgRef.current
    if (!el || readOnly) return
    const stop = (e) => e.cancelable && e.preventDefault()
    el.addEventListener('touchstart', stop, { passive: false })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('touchmove', stop)
    }
  }, [readOnly])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(t)
  }, [notice])

  const point = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * SKETCH_W, ((e.clientY - r.top) / r.height) * H]
  }

  function commit(next, { snapshot = true } = {}) {
    if (snapshot) history.current = [...history.current.slice(-49), itemsRef.current]
    itemsRef.current = next
    onChange?.(next)
  }

  function add(item) {
    const next = [...itemsRef.current, item]
    if (sketchSize(next) > MAX_SKETCH_NUMBERS) {
      setNotice('표시가 너무 많아 더 저장할 수 없습니다. 일부를 지운 뒤 다시 그려 주세요.')
      return
    }
    commit(next)
  }

  function eraseAt(x, y) {
    const cur = itemsRef.current
    // 빗금 안쪽 지우기는 한 번 문지를 때 하나만 — 끌고 지나가며 겹친 빗금이 줄줄이 지워지지 않게
    const next = eraseItems(cur, x, y, 12, { interior: !draft.current.interiorUsed })
    if (next.length === cur.length) return
    if (next.length === cur.length - 1 && !cur.some((it) => !next.includes(it) && it.kind !== 'hatch')) draft.current.interiorUsed = true
    if (!draft.current.erased) {
      draft.current.erased = true
      history.current = [...history.current.slice(-49), cur]
    }
    commit(next, { snapshot: false })
  }

  function down(e) {
    if (readOnly) return
    if (e.pointerType === 'pen') penSeen.current = true
    // 펜을 한 번이라도 쓰면 손바닥·손가락 터치는 무시한다
    if (e.pointerType === 'touch' && penSeen.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (draft.current) return
    e.preventDefault()
    try { svgRef.current.setPointerCapture(e.pointerId) } catch { /* 이미 떨어진 포인터 */ }
    const [x, y] = point(e)
    if (tool === 'eraser') {
      draft.current = { pointerId: e.pointerId, erasing: true, last: [x, y] }
      eraseAt(x, y)
      return
    }
    if (tool === 'line') {
      draft.current = { pointerId: e.pointerId, item: { id: newId(), kind: 'line', x1: x, y1: y, x2: x, y2: y, color, width: SKETCH_WIDTH } }
    } else if (tool === 'hatch') {
      draft.current = { pointerId: e.pointerId, item: { id: newId(), kind: 'hatch', pts: [x, y], color, dir } }
    } else {
      draft.current = { pointerId: e.pointerId, item: { id: newId(), tool, color, width: SKETCH_WIDTH, pts: [x, y] } }
    }
    setTick((t) => t + 1)
  }

  function move(e) {
    const d = draft.current
    if (!d || d.pointerId !== e.pointerId) return
    const events = e.nativeEvent.getCoalescedEvents?.() || []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = point(ev)
      if (d.erasing) {
        // 빠르게 문질러도 사이에 있는 표시를 놓치지 않게 8 간격으로 채운다
        const [lx, ly] = d.last
        const n = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / 8))
        for (let k = 1; k <= n; k++) eraseAt(lx + ((x - lx) * k) / n, ly + ((y - ly) * k) / n)
        d.last = [x, y]
        continue
      }
      const it = d.item
      if (it.kind === 'line') { it.x2 = x; it.y2 = y; continue }
      const p = it.pts
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 1.5) p.push(x, y)
    }
    if (!d.erasing) setTick((t) => t + 1)
  }

  function up(e) {
    const d = draft.current
    if (!d || d.pointerId !== e.pointerId) return
    draft.current = null
    if (d.erasing || e.type === 'pointercancel') { setTick((t) => t + 1); return }
    const it = d.item
    if (it.kind === 'line') {
      const s = snapLine(it)
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 6) {
        add({ ...s, x1: Math.round(s.x1), y1: Math.round(s.y1), x2: Math.round(s.x2), y2: Math.round(s.y2) })
      }
    } else if (it.kind === 'hatch') {
      const pts = finishPoints(it.pts)
      if (isHatchable(pts)) add({ ...it, pts })
      else setNotice('빗금: 칠할 영역의 테두리를 한 바퀴 따라 그려 주세요.')
    } else {
      add({ ...it, pts: finishPoints(it.pts) })
    }
    setTick((t) => t + 1)
  }

  function undo() {
    const prev = history.current.pop()
    if (prev) commit(prev, { snapshot: false })
  }

  function clearAll() {
    if (!itemsRef.current.length) return
    if (!window.confirm('그림 위에 표시한 내용을 모두 지울까요?')) return
    commit([])
  }

  const live = draft.current?.item
  const patternId = (c, dr) => `${uid}h${SKETCH_COLORS.indexOf(c) < 0 ? 0 : SKETCH_COLORS.indexOf(c)}${dr > 0 ? 'a' : 'b'}`
  const usedPatterns = new Set(
    [...items, live].filter((it) => it?.kind === 'hatch').map((it) => `${it.color}|${it.dir > 0 ? 1 : -1}`)
  )

  const renderItem = (it, isLive = false) => {
    if (it.kind === 'line') {
      const s = isLive ? snapLine(it) : it
      return <line key={it.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={it.color} strokeWidth={it.width || SKETCH_WIDTH} strokeLinecap="round" />
    }
    if (it.kind === 'hatch') {
      if (isLive) return <path key={it.id} d={strokePath(it.pts)} fill="none" stroke={it.color} strokeWidth={2} strokeDasharray="6 5" />
      return (
        <path
          key={it.id}
          d={polygonPath(it.pts)}
          fill={`url(#${patternId(it.color, it.dir)})`}
          stroke={it.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )
    }
    return (
      <path
        key={it.id}
        d={strokePath(it.pts)}
        fill="none"
        stroke={it.color}
        strokeWidth={strokeWidthOf(it)}
        strokeOpacity={it.tool === 'marker' ? 0.35 : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }

  const btn = (active) => `rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2" data-fb-ui>
      {!readOnly && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" title={t.title} onClick={() => setTool(t.id)} className={btn(tool === t.id)}>{t.label}</button>
          ))}
          {tool === 'hatch' && (
            <span className="ml-1 flex items-center gap-1">
              <button type="button" title="빗금 방향 ／" onClick={() => setDir(1)} className={btn(dir === 1)}>／</button>
              <button type="button" title="빗금 방향 ＼" onClick={() => setDir(-1)} className={btn(dir === -1)}>＼</button>
            </span>
          )}
          <span className="mx-1 h-5 w-px bg-gray-200" />
          {SKETCH_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              title={COLOR_NAMES[i]}
              aria-label={COLOR_NAMES[i]}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-white ring-1 ring-gray-200'}`}
              style={{ background: c }}
            />
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={undo} disabled={!history.current.length} className={`${btn(false)} disabled:opacity-40`}>되돌리기</button>
            <button type="button" onClick={clearAll} disabled={!items.length} className={`${btn(false)} disabled:opacity-40`}>모두 지우기</button>
          </span>
        </div>
      )}
      <div className="relative w-full select-none" style={{ aspectRatio: `${SKETCH_W} / ${H}` }}>
        <img src={image.url} alt="문항 그림" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${SKETCH_W} ${H}`}
          preserveAspectRatio="none"
          style={readOnly ? undefined : { touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={readOnly ? undefined : (e) => e.preventDefault()}
        >
          <defs>
            {[...usedPatterns].map((key) => {
              const [c, dr] = key.split('|')
              return (
                <pattern key={key} id={patternId(c, Number(dr))} patternUnits="userSpaceOnUse" width="12" height="12" patternTransform={`rotate(${Number(dr) > 0 ? 45 : -45})`}>
                  <line x1="0" y1="0" x2="0" y2="12" stroke={c} strokeWidth="2.5" />
                </pattern>
              )
            })}
          </defs>
          {items.map((it) => renderItem(it))}
          {live && renderItem(live, true)}
        </svg>
      </div>
      {!readOnly && (
        <p className={`mt-1.5 text-xs ${notice ? 'text-amber-600' : 'text-gray-400'}`}>
          {notice || '빗금: 칠할 영역의 테두리를 한 바퀴 따라 그리면 안쪽이 칠해집니다. 색과 방향을 바꿔 영역을 구분하세요.'}
        </p>
      )}
    </div>
  )
}
