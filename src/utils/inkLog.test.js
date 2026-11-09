import { describe, it, expect } from 'vitest'
import { inkDelta, replayInk, inkLayerKey, countStrokes } from './inkLog.js'

const a = { id: 'a', pts: [0, 0, 1, 1] }
const b = { id: 'b', pts: [2, 2, 3, 3] }

describe('inkDelta', () => {
  it('새 획은 add, 사라진 획은 remove, 변화 없으면 null', () => {
    expect(inkDelta([], [a])).toEqual({ add: [a] })
    expect(inkDelta([a, b], [b])).toEqual({ remove: ['a'] })
    expect(inkDelta([a], [a])).toBe(null)
    expect(inkDelta(null, null)).toBe(null)
  })
})

describe('replayInk', () => {
  const events = [
    { t: 1, sectionId: 's', layer: 'prompt', add: [a], w: 600 },
    { t: 2, sectionId: 's', layer: 'prompt', add: [b] },
    { t: 3, sectionId: 's', layer: 'prompt', remove: ['a'] },
    { t: 4, sectionId: 's', layer: 'ink', add: [a] },
  ]
  it('그 시점까지의 획 목록을 층별로 복원한다', () => {
    const at2 = replayInk(events, 2)
    expect(at2.get(inkLayerKey('s', 'prompt'))).toEqual({ items: [a, b], w: 600 })
    expect(at2.has(inkLayerKey('s', 'ink'))).toBe(false)
    const end = replayInk(events)
    expect(end.get(inkLayerKey('s', 'prompt')).items).toEqual([b])
    expect(end.get(inkLayerKey('s', 'ink')).items).toEqual([a])
  })
  it('획 수는 그은 횟수만 센다', () => {
    expect(countStrokes(events)).toBe(3)
  })
})
