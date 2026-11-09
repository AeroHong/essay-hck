// 그림 위 표시(스케치) — 문항의 배경 그림 위에 학생이 펜·직선·빗금으로 표시한 내용.
// classroom-live-hck의 판서 코드(src/lib/ink.js)를 essay 답안용으로 줄여 옮겼다.
//
// 좌표: 배경 그림의 가로를 SKETCH_W(1000)로 놓은 좌표계. 세로는 그림 비율대로(sketchHeight).
// 점 목록 pts는 [x0, y0, x1, y1, …] 평면 배열 — Firestore는 배열 안의 배열을 저장할 수 없다.
//
// 항목(item) 종류 — 제출물 sections[문항id].ink 배열에 저장
//   획   { id, tool: 'pen'|'marker', color, width, pts }
//   직선 { id, kind: 'line', x1, y1, x2, y2, color, width }
//   빗금 { id, kind: 'hatch', pts, color, dir: 1|-1 }   pts = 학생이 그린 테두리(닫힌 도형으로 본다)

export const SKETCH_W = 1000
export const SKETCH_COLORS = ['#dc2626', '#2563eb', '#0f172a']
export const SKETCH_WIDTH = 4
// 문항 하나의 표시가 제출물 문서(1MB)를 넘지 않도록 숫자 개수 상한
export const MAX_SKETCH_NUMBERS = 20000

export function sketchHeight(image) {
  const w = Number(image?.w) || 0
  const h = Number(image?.h) || 0
  return w > 0 && h > 0 ? Math.round((SKETCH_W * h) / w) : Math.round(SKETCH_W * 0.75)
}

export const hasSketch = (ink) => Array.isArray(ink) && ink.length > 0

/** 글을 썼거나 그림 위에 표시했으면 응답한 문항으로 본다 (진행 칩·필수 확인·대시보드 공용). */
export function sectionHasAnswer(answer, plainText) {
  return (plainText || '').trim().length > 0 || hasSketch(answer?.ink)
}

export const itemNumbers = (it) => (it?.pts?.length || 0) + 8
export const sketchSize = (items) => (items || []).reduce((n, it) => n + itemNumbers(it), 0)

const r1 = (v) => Math.round(v * 10) / 10

// Ramer–Douglas–Peucker: 곧은 구간의 점을 솎아 저장량을 줄인다
export function simplify(pts, tol = 1.2) {
  const n = pts.length / 2
  if (n <= 2) return pts.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1]
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    let far = -1, farD = tol
    for (let i = a + 1; i < b; i++) {
      // 빗금 테두리처럼 시작점으로 돌아오는 닫힌 선은 양 끝이 겹친다 — 그때는 직선까지가 아니라
      // 점까지의 거리로 재야 한다(아니면 모든 점이 거리 0이 되어 테두리가 통째로 사라진다)
      const d = len < 1e-6
        ? Math.hypot(pts[i * 2] - ax, pts[i * 2 + 1] - ay)
        : Math.abs(dy * pts[i * 2] - dx * pts[i * 2 + 1] + bx * ay - by * ax) / len
      if (d > farD) { farD = d; far = i }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  return out
}

/** 저장용: 솎고 소수점 한 자리로 */
export const finishPoints = (pts) => simplify(pts).map(r1)

/** 획 → SVG path (중간점을 잇는 2차 곡선으로 부드럽게) */
export function strokePath(pts) {
  if (!pts || pts.length < 2) return ''
  if (pts.length === 2) return `M${r1(pts[0])} ${r1(pts[1])}L${r1(pts[0] + 0.1)} ${r1(pts[1])}`
  if (pts.length === 4) return `M${r1(pts[0])} ${r1(pts[1])}L${r1(pts[2])} ${r1(pts[3])}`
  let d = `M${r1(pts[0])} ${r1(pts[1])}`
  for (let i = 2; i < pts.length - 2; i += 2) {
    d += `Q${r1(pts[i])} ${r1(pts[i + 1])} ${r1((pts[i] + pts[i + 2]) / 2)} ${r1((pts[i + 1] + pts[i + 3]) / 2)}`
  }
  return d + `L${r1(pts[pts.length - 2])} ${r1(pts[pts.length - 1])}`
}

/** 빗금 영역 테두리 → 닫힌 SVG path */
export function polygonPath(pts) {
  if (!pts || pts.length < 6) return ''
  let d = `M${r1(pts[0])} ${r1(pts[1])}`
  for (let i = 2; i + 1 < pts.length; i += 2) d += `L${r1(pts[i])} ${r1(pts[i + 1])}`
  return d + 'Z'
}

/** 직선은 수평·수직 가까이면 붙인다 (자 없이도 반듯하게) */
export function snapLine(it) {
  const dx = it.x2 - it.x1, dy = it.y2 - it.y1
  const deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180
  if (deg < 5 || deg > 175) return { ...it, y2: it.y1 }
  if (Math.abs(deg - 90) < 5) return { ...it, x2: it.x1 }
  return it
}

/** 빗금으로 칠할 만큼 넓은 테두리인가 (점 3개 이상, 가로·세로가 모두 조금은 있어야) */
export function isHatchable(pts) {
  if (!pts || pts.length < 6) return false
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i])
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1])
  }
  return maxX - minX >= 8 && maxY - minY >= 8
}

// 점과 선분 사이 거리
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function hitPolyline(p, x, y, reach, closed = false) {
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= reach
  for (let i = 0; i + 3 < p.length; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true
  if (closed && p.length >= 6 && segDist(x, y, p[p.length - 2], p[p.length - 1], p[0], p[1]) <= reach) return true
  return false
}

// 점이 다각형 안인가 (짝홀 규칙)
export function insidePolygon(pts, x, y) {
  let inside = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const strokeWidthOf = (it) => (it.tool === 'marker' ? (it.width || SKETCH_WIDTH) * 4 : it.width || SKETCH_WIDTH)

/** 지우개 판정: (x, y)에서 반지름 r 안에 닿는 항목인가. 빗금은 테두리나 안쪽을 문지르면 지워진다. */
export function hitItem(it, x, y, r = 12) {
  if (it.kind === 'hatch') return hitEdge(it, x, y, r) || insidePolygon(it.pts || [], x, y)
  return hitEdge(it, x, y, r)
}

/** 선(획·직선·빗금 테두리)에 닿았는가 — 빗금의 안쪽은 보지 않는다 */
export function hitEdge(it, x, y, r = 12) {
  if (it.kind === 'line') return hitPolyline([it.x1, it.y1, it.x2, it.y2], x, y, r + (it.width || SKETCH_WIDTH) / 2)
  if (it.kind === 'hatch') return hitPolyline(it.pts || [], x, y, r, true)
  return hitPolyline(it.pts || [], x, y, r + strokeWidthOf(it) / 2)
}

/**
 * 지우개로 (x, y)를 눌렀을 때 남는 항목. 선에 닿은 것은 모두 지우고, 선에는 안 닿고 빗금 안쪽만
 * 누른 경우에는 맨 위(가장 나중에 그린) 빗금 하나만 지운다 — 겹친 빗금이 한꺼번에 사라지지 않게.
 */
export function eraseItems(items, x, y, r = 12, { interior = true } = {}) {
  const edgeHit = items.filter((it) => hitEdge(it, x, y, r))
  if (edgeHit.length) return items.filter((it) => !edgeHit.includes(it))
  if (!interior) return items
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'hatch' && insidePolygon(items[i].pts || [], x, y)) return items.filter((_, k) => k !== i)
  }
  return items
}

/** 저장된 값이 깨져 있어도 화면이 죽지 않게 알맞은 항목만 남긴다 */
export function normalizeSketch(ink) {
  if (!Array.isArray(ink)) return []
  return ink.filter((it) => it && typeof it === 'object' && (
    (it.kind === 'line' && [it.x1, it.y1, it.x2, it.y2].every(Number.isFinite)) ||
    ((it.kind === 'hatch' || !it.kind) && Array.isArray(it.pts) && it.pts.length >= 2 && it.pts.every(Number.isFinite))
  ))
}

// ─── 손가락 스크롤 ────────────────────────────────────────────────────────────
// 그림 위에서는 iPad Pencil이 페이지를 끌고 가지 않도록 touch-action:none을 유지하고, 대신
// 손가락(touch) 끌기를 직접 스크롤로 바꾼다. 그림이 태블릿 화면 폭에 꽉 차서 그림 위를
// 밀지 못하면 스크롤할 곳이 양옆 여백뿐이었다(실기기 신고, 2026-11-09).

/** el에서 위로 올라가며 실제로 세로로 넘치는 스크롤 칸을 찾는다(없으면 문서 전체) */
export function findScrollParent(el) {
  for (let n = el?.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = window.getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
  }
  return document.scrollingElement || document.documentElement
}

/** 손을 뗀 뒤 관성 스크롤: 한 프레임(ms) 지나고 남는 속도(px/ms). 충분히 느려지면 0 */
export function decayVelocity(v, dt, { friction = 0.0025, stop = 0.02 } = {}) {
  const next = v * Math.exp(-friction * dt)
  return Math.abs(next) < stop ? 0 : next
}
