import React, { useEffect, useId, useRef, useState } from 'react'
import {
  SKETCH_W, SKETCH_COLORS, SKETCH_WIDTH, MAX_SKETCH_NUMBERS,
  sketchHeight, finishPoints, strokePath, polygonPath, snapLine, isHatchable, eraseItems,
  strokeWidthOf, sketchSize, normalizeSketch, findScrollParent, decayVelocity
} from '../../utils/sketch.js'

const TOOLS = [
  { id: 'hatch', label: '빗금', title: '영역 테두리를 따라 그리면 안쪽이 빗금으로 칠해집니다' },
  { id: 'pen', label: '펜', title: '자유롭게 그리기' },
  { id: 'line', label: '직선', title: '끌어서 직선 긋기 (수평·수직 가까이면 반듯하게)' },
  { id: 'marker', label: '형광펜', title: '반투명하게 굵게 칠하기' },
  { id: 'eraser', label: '지우개', title: '문지른 표시를 지웁니다 (빗금은 안쪽을 눌러도 지워집니다)' },
]
// 문항 위 필기(풀이용)에는 빗금이 필요 없다
const OVERLAY_TOOLS = ['pen', 'line', 'marker', 'eraser']
// 문항 위 필기는 문항마다 따로 저장되므로 한 칸 상한을 작게(제출물 문서 1MB)
const MAX_OVERLAY_NUMBERS = 8000
const COLOR_NAMES = ['빨강', '파랑', '검정']

let seq = 0
const newId = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * 펜·직선·빗금으로 표시하는 칸 (학생 작성 / 교사 채점 공용). 두 가지로 쓴다.
 *  - 그림 답안: image(문항 세트의 sections[].drawImage) 위에 표시 — 표시 자체가 답
 *  - 문항 위 필기: children(문항 내용) 위에 겹쳐 밑줄·메모·보조선 — 풀이용, 답으로 치지 않음
 *    좌표는 처음 필기한 순간의 내용 폭(contentWidth, px) 기준이다. 글은 폭에 따라 줄바꿈이 바뀌므로,
 *    필기가 있으면 내용을 그 폭으로 그린 뒤 화면 폭에 맞게 확대·축소해 필기와 글자가 어긋나지 않게 한다.
 * @param {{url:string, w:number, h:number}} [image]
 * @param {React.ReactNode} [children]
 * @param {number} [contentWidth] 문항 위 필기의 기준 폭(px)
 * @param {Array} value 표시 항목 배열 (utils/sketch.js 참고)
 * @param {(items:Array, contentWidth?:number)=>void} [onChange]
 * @param {boolean} [readOnly]
 */
export default function SketchCanvas({ image, children, contentWidth, value, onChange, readOnly = false }) {
  const overlay = !image
  const items = normalizeSketch(value)
  const outerRef = useRef(null)
  const [avail, setAvail] = useState(0)
  const [innerH, setInnerH] = useState(0)
  // 그리기 칸(그림 답안: 그림 칸, 문항 위 필기: 문항 내용을 감싼 칸) — 좌표·포인터 캡처 기준
  const areaRef = useRef(null)
  useEffect(() => {
    if (!overlay) return
    const ro = new ResizeObserver(() => {
      if (outerRef.current) setAvail(outerRef.current.clientWidth)
      if (areaRef.current) setInnerH(areaRef.current.offsetHeight)
    })
    if (outerRef.current) ro.observe(outerRef.current)
    if (areaRef.current) ro.observe(areaRef.current)
    return () => ro.disconnect()
  }, [overlay])
  const baseW = overlay ? ((items.length && contentWidth) || avail) : 0
  const scale = overlay && baseW && avail ? avail / baseW : 1
  const baseWRef = useRef(baseW)
  baseWRef.current = baseW
  const H = overlay
    ? (baseW && innerH ? Math.max(1, Math.round((innerH / baseW) * SKETCH_W)) : SKETCH_W)
    : sketchHeight(image)
  const draft = useRef(null)
  const penSeen = useRef(false)
  const history = useRef([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const pan = useRef(null)
  const inertia = useRef(0)
  const [tool, setTool] = useState(overlay ? 'pen' : 'hatch')
  // 기본은 '손가락 = 스크롤, 펜·마우스 = 그리기'. 펜이 없는 학생만 켜서 손가락으로 그린다.
  const [fingerDraw, setFingerDraw] = useState(false)
  const [color, setColor] = useState(SKETCH_COLORS[0])
  const [dir, setDir] = useState(1)
  const [, setTick] = useState(0)
  const [notice, setNotice] = useState('')
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  // iPad Safari: 길게 누를 때 돋보기·글자 선택·스크롤이 끼어들지 않게
  useEffect(() => {
    const el = areaRef.current
    // 문항 위 필기는 글 속 링크·영상을 손가락으로 누를 수 있어야 해서 터치 기본 동작을 막지 않는다
    if (!el || readOnly || overlay) return
    const stop = (e) => e.cancelable && e.preventDefault()
    el.addEventListener('touchstart', stop, { passive: false })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('touchmove', stop)
    }
  }, [readOnly, overlay])

  const stopInertia = () => {
    if (inertia.current) window.cancelAnimationFrame(inertia.current)
    inertia.current = 0
  }
  useEffect(() => stopInertia, [])

  function startInertia(scroller, vx, vy) {
    let last = performance.now()
    const step = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      vx = decayVelocity(vx, dt)
      vy = decayVelocity(vy, dt)
      if (!vx && !vy) { inertia.current = 0; return }
      scroller.scrollTop -= vy * dt
      scroller.scrollLeft -= vx * dt
      inertia.current = window.requestAnimationFrame(step)
    }
    inertia.current = window.requestAnimationFrame(step)
  }

  function panMove(e) {
    const p = pan.current
    const now = performance.now()
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.scroller.scrollTop -= dy
    p.scroller.scrollLeft -= dx
    const dt = Math.max(1, now - p.t)
    // 최근 움직임 위주로 속도를 잡는다(손을 떼기 직전 멈췄으면 관성 없이)
    p.vx = 0.8 * (dx / dt) + 0.2 * p.vx
    p.vy = 0.8 * (dy / dt) + 0.2 * p.vy
    p.x = e.clientX
    p.y = e.clientY
    p.t = now
  }

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(t)
  }, [notice])

  const point = (e) => {
    const r = areaRef.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * SKETCH_W, ((e.clientY - r.top) / r.height) * H]
  }

  function commit(next, { snapshot = true } = {}) {
    if (snapshot) history.current = [...history.current.slice(-49), itemsRef.current]
    itemsRef.current = next
    onChange?.(next, baseWRef.current || undefined)
  }

  function add(item) {
    const next = [...itemsRef.current, item]
    if (sketchSize(next) > (overlay ? MAX_OVERLAY_NUMBERS : MAX_SKETCH_NUMBERS)) {
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
    stopInertia()
    if (e.pointerType === 'pen') penSeen.current = true
    if (e.pointerType === 'touch' && (!fingerDraw || penSeen.current)) {
      // 손가락은 스크롤 — 그리는 중(펜)이거나 이미 다른 손가락으로 밀고 있으면 무시(손바닥 오작동 방지)
      if (draft.current || pan.current) return
      e.preventDefault()
      try { areaRef.current.setPointerCapture(e.pointerId) } catch { /* 이미 떨어진 포인터 */ }
      pan.current = { pointerId: e.pointerId, scroller: findScrollParent(areaRef.current), x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0 }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (draft.current) return
    // 펜을 대기 전에 손바닥이 먼저 닿아 스크롤이 시작됐으면 멈춘다 — 그리는 동안 화면이 밀리지 않게
    pan.current = null
    e.preventDefault()
    try { areaRef.current.setPointerCapture(e.pointerId) } catch { /* 이미 떨어진 포인터 */ }
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
    if (pan.current?.pointerId === e.pointerId) { panMove(e); return }
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
    const p = pan.current
    if (p?.pointerId === e.pointerId) {
      pan.current = null
      // 마지막으로 움직인 지 80ms가 넘었으면 멈춘 채 뗀 것 — 관성 없음
      if (e.type !== 'pointercancel' && performance.now() - p.t < 80) {
        const cap = (v) => Math.max(-3, Math.min(3, v)) // px/ms — 세게 튕겨도 한참 날아가지 않게
        startInertia(p.scroller, cap(p.vx), cap(p.vy))
      }
      return
    }
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
    } else if (!overlay || it.pts.length > 2) {
      // 문항 위에서 링크를 누르듯 콕 찍은 것은 필기로 남기지 않는다
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
    if (!window.confirm(overlay ? '문항 위에 필기한 내용을 모두 지울까요?' : '그림 위에 표시한 내용을 모두 지울까요?')) return
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

  const btn = (active) => `rounded-lg border ${overlay ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium transition-colors ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`
  const tools = overlay ? TOOLS.filter((t) => OVERLAY_TOOLS.includes(t.id)) : TOOLS
  const svgLayer = (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${SKETCH_W} ${H}`} preserveAspectRatio="none">
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
  )
  // 그리기 이벤트는 svg가 아니라 감싸는 칸에서 받는다(문항 위 필기에서는 svg 아래 글이 보여야 하므로)
  const inputStyle = readOnly ? {} : { touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair', WebkitTouchCallout: 'none' }
  const inputHandlers = readOnly ? {} : {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: up,
    // 손을 떼기 전에 브라우저가 포인터 추적을 놓친 경우 — 그대로 두면 '그리는 중'(draft)이 남아
    // 그 칸에서 펜이 다시 안 먹혔다. 손을 뗀 것처럼 마무리한다(이미 끝난 획이면 up이 무시한다).
    onLostPointerCapture: up,
    onContextMenu: (e) => e.preventDefault(),
  }

  return (
    <div className={overlay ? '' : 'rounded-xl border border-gray-200 bg-white p-2'} data-fb-ui>
      {!readOnly && (
        <div className={`${overlay ? 'mb-1' : 'mb-2'} flex flex-wrap items-center gap-1.5`}>
          {overlay && <span className="text-[11px] font-medium text-gray-400">✏️ 문항 위 필기</span>}
          {tools.map((t) => (
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
              className={`${overlay ? 'h-5 w-5' : 'h-6 w-6'} rounded-full border-2 ${color === c ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-white ring-1 ring-gray-200'}`}
              style={{ background: c }}
            />
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              title="펜이 없으면 켜서 손가락으로 그립니다 (끄면 손가락으로 밀어 스크롤)"
              onClick={() => { setFingerDraw((v) => !v); penSeen.current = false }}
              className={btn(fingerDraw)}
            >
              {overlay ? '손가락 필기' : '손가락으로 그리기'} {fingerDraw ? '켬' : '끔'}
            </button>
            <button type="button" onClick={undo} disabled={!history.current.length} className={`${btn(false)} disabled:opacity-40`}>되돌리기</button>
            <button type="button" onClick={clearAll} disabled={!items.length} className={`${btn(false)} disabled:opacity-40`}>모두 지우기</button>
          </span>
        </div>
      )}
      {overlay ? (
        <div ref={outerRef} className="relative w-full overflow-hidden" style={baseW && innerH ? { height: innerH * scale } : undefined}>
          <div
            ref={areaRef}
            className="relative select-none"
            style={{ ...(baseW ? { width: baseW, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left' } : {}), ...inputStyle }}
            {...inputHandlers}
          >
            {children}
            {svgLayer}
          </div>
        </div>
      ) : (
        <div ref={areaRef} className="relative w-full select-none" style={{ aspectRatio: `${SKETCH_W} / ${H}`, ...inputStyle }} {...inputHandlers}>
          <img src={image.url} alt="문항 그림" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
          {svgLayer}
        </div>
      )}
      {!readOnly && (!overlay || notice) && (
        <p className={`mt-1.5 text-xs ${notice ? 'text-amber-600' : 'text-gray-400'}`}>
          {notice || `${fingerDraw ? '' : '펜으로 그리고, 손가락으로 밀면 화면이 스크롤됩니다. '}빗금: 칠할 영역의 테두리를 한 바퀴 따라 그리면 안쪽이 칠해집니다. 색과 방향을 바꿔 영역을 구분하세요.`}
        </p>
      )}
    </div>
  )
}

/**
 * 문항 내용(children) 위 풀이 필기. 저장 형식 { w: 기준 폭(px), items: [...] } — 다 지우면 null.
 * 제출물 sections[문항].promptInk(문항 지시문) / groupInk(공통 내용)에 들어가며 답·작성 여부와는 무관하다.
 */
export function PromptInk({ ink, onChange, readOnly = false, children }) {
  const items = ink?.items || []
  // 잠긴 화면(제출 후·채점)에서 필기가 없으면 그냥 내용만 보여 준다
  if (readOnly && !items.length) return children
  return (
    <SketchCanvas
      value={items}
      contentWidth={ink?.w}
      readOnly={readOnly}
      onChange={(next, w) => onChange?.(next.length ? { w: Math.round(w || 0), items: next } : null)}
    >
      {children}
    </SketchCanvas>
  )
}
