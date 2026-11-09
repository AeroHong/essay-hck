import { describe, it, expect } from 'vitest'
import {
  SKETCH_W, sketchHeight, hasSketch, sectionHasAnswer, simplify, finishPoints, polygonPath,
  snapLine, isHatchable, insidePolygon, hitItem, eraseItems, normalizeSketch, sketchSize
} from './sketch.js'

describe('sketchHeight', () => {
  it('배경 그림 비율대로 세로 좌표 범위를 잡는다', () => {
    expect(sketchHeight({ w: 1280, h: 920 })).toBe(Math.round((SKETCH_W * 920) / 1280))
  })
  it('크기를 모르면 4:3으로 둔다', () => {
    expect(sketchHeight({})).toBe(750)
  })
})

describe('sectionHasAnswer', () => {
  it('글이나 그림 표시 중 하나만 있어도 응답으로 본다', () => {
    expect(sectionHasAnswer({ text: '' }, '')).toBe(false)
    expect(sectionHasAnswer({ text: '<p>a</p>' }, 'a')).toBe(true)
    expect(sectionHasAnswer({ ink: [{ id: 'k', pts: [1, 2] }] }, '  ')).toBe(true)
    expect(hasSketch([])).toBe(false)
  })
})

describe('simplify / finishPoints', () => {
  it('일직선 위의 중간 점을 솎는다', () => {
    expect(simplify([0, 0, 5, 0, 10, 0, 15, 0])).toEqual([0, 0, 15, 0])
  })
  it('시작점으로 돌아오는 닫힌 테두리를 지우지 않는다', () => {
    const loop = finishPoints([0, 0, 50, 0, 100, 0, 100, 50, 100, 100, 50, 100, 0, 100, 0, 50, 0, 0])
    expect(loop).toEqual([0, 0, 100, 0, 100, 100, 0, 100, 0, 0])
    expect(isHatchable(loop)).toBe(true)
  })
  it('꺾인 점은 남기고 소수 한 자리로 저장한다', () => {
    expect(finishPoints([0, 0, 10.04, 10.06, 20, 0])).toEqual([0, 0, 10, 10.1, 20, 0])
  })
})

describe('빗금 영역', () => {
  const square = [0, 0, 100, 0, 100, 100, 0, 100]
  it('테두리를 닫힌 도형으로 그린다', () => {
    expect(polygonPath(square)).toBe('M0 0L100 0L100 100L0 100Z')
  })
  it('너무 작은 테두리는 칠하지 않는다', () => {
    expect(isHatchable([0, 0, 3, 3, 0, 3])).toBe(false)
    expect(isHatchable(square)).toBe(true)
  })
  it('안쪽 점을 판정한다', () => {
    expect(insidePolygon(square, 50, 50)).toBe(true)
    expect(insidePolygon(square, 150, 50)).toBe(false)
  })
  it('지우개는 빗금의 안쪽을 눌러도 지운다', () => {
    expect(hitItem({ kind: 'hatch', pts: square }, 50, 50)).toBe(true)
    expect(hitItem({ kind: 'hatch', pts: square }, 300, 300)).toBe(false)
  })
})

describe('eraseItems', () => {
  const big = { id: 'a', kind: 'hatch', pts: [0, 0, 200, 0, 200, 200, 0, 200] }
  const small = { id: 'b', kind: 'hatch', pts: [50, 50, 150, 50, 150, 150, 50, 150] }
  it('겹친 빗금 안쪽을 누르면 맨 위 하나만 지운다', () => {
    expect(eraseItems([big, small], 100, 100).map((i) => i.id)).toEqual(['a'])
  })
  it('테두리에 닿으면 그 빗금을 지운다', () => {
    expect(eraseItems([big, small], 0, 100).map((i) => i.id)).toEqual(['b'])
  })
  it('아무것도 안 닿으면 그대로', () => {
    const items = [small]
    expect(eraseItems(items, 400, 400)).toBe(items)
  })
})

describe('snapLine / hitItem', () => {
  it('거의 수평인 직선은 수평으로 붙인다', () => {
    expect(snapLine({ x1: 0, y1: 0, x2: 100, y2: 3 }).y2).toBe(0)
  })
  it('직선·획 근처를 지우개로 맞힌다', () => {
    expect(hitItem({ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0, width: 4 }, 50, 5)).toBe(true)
    expect(hitItem({ tool: 'pen', pts: [0, 0, 100, 0], width: 4 }, 50, 40)).toBe(false)
  })
})

describe('normalizeSketch', () => {
  it('깨진 항목은 버린다', () => {
    const ok = { id: 'a', tool: 'pen', pts: [1, 2, 3, 4] }
    expect(normalizeSketch([ok, null, { kind: 'line', x1: 1 }, { pts: ['x'] }])).toEqual([ok])
    expect(normalizeSketch(undefined)).toEqual([])
    expect(sketchSize([ok])).toBe(12)
  })
})

describe('decayVelocity', () => {
  it('시간이 지나면 속도가 줄고, 충분히 느려지면 0이 된다', async () => {
    const { decayVelocity } = await import('./sketch.js')
    const v = decayVelocity(2, 16)
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(2)
    expect(decayVelocity(0.0205, 16)).toBe(0)
    expect(decayVelocity(-2, 16)).toBeLessThan(0)
  })
})
