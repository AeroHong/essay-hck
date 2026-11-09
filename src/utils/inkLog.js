// 필기(그림 답안 ink / 문항 위 풀이 필기 promptInk·groupInk) 작성 과정 기록.
//
// 글 입력은 매번 전체 스냅샷을 남기지만(inputLogs), 필기는 한 칸이 수천 개 숫자라 매번 통째로
// 남기면 로그가 금방 커진다. 그래서 바뀐 획만 남긴다 — 획마다 고유 id가 있으므로 이전·이후
// 목록을 id로 비교해 새로 생긴 획(add)과 사라진 획(remove)을 기록한다. 되돌리기·모두 지우기도
// 결국 획이 생기거나 사라지는 것이라 같은 방식으로 정확히 재생된다.
//
// 이벤트: { t, sectionId, layer: 'ink'|'prompt'|'group', add?: item[], remove?: id[], w?: number }

/** 이전·이후 획 목록의 차이. 바뀐 게 없으면 null */
export function inkDelta(prev, next) {
  const before = new Map((prev || []).map((it) => [it.id, it]))
  const after = new Set((next || []).map((it) => it.id))
  const add = (next || []).filter((it) => !before.has(it.id))
  const remove = [...before.keys()].filter((id) => !after.has(id))
  if (!add.length && !remove.length) return null
  const d = {}
  if (add.length) d.add = add
  if (remove.length) d.remove = remove
  return d
}

export const inkLayerKey = (sectionId, layer) => `${sectionId}|${layer}`

/**
 * t 시점까지의 필기 상태를 다시 만든다.
 * @returns {Map<string, {items: Array, w?: number}>} inkLayerKey → 그 시점의 획 목록
 */
export function replayInk(events, upToT = Infinity) {
  const layers = new Map()
  for (const ev of events || []) {
    if (ev.t > upToT) break
    const key = inkLayerKey(ev.sectionId, ev.layer)
    const cur = layers.get(key) || { items: [] }
    let items = cur.items
    if (ev.remove?.length) {
      const gone = new Set(ev.remove)
      items = items.filter((it) => !gone.has(it.id))
    }
    if (ev.add?.length) items = [...items, ...ev.add]
    layers.set(key, { items, w: ev.w || cur.w })
  }
  return layers
}

/** 획을 새로 그은 횟수(지우기 제외) — 재생 화면 통계용 */
export const countStrokes = (events) => (events || []).reduce((n, ev) => n + (ev.add?.length || 0), 0)
