import { describe, expect, it } from 'vitest'
import { splitStudentIdentity, resolveStudentIdentity, compareStudentIdentity } from './studentIdentity.js'

describe('splitStudentIdentity', () => {
  it.each([
    ['10101-홍길동', '10101', '홍길동'],
    ['10101 홍길동', '10101', '홍길동'],
    ['10101홍길동', '10101', '홍길동'],
    ['[10101] 홍길동', '10101', '홍길동'],
    ['홍길동(10101)', '10101', '홍길동'],
    ['홍길동 10101', '10101', '홍길동'],
    ['홍길동', '', '홍길동'],
    ['', '', '']
  ])('%s', (raw, no, name) => {
    expect(splitStudentIdentity(raw)).toEqual({ studentNo: no, name })
  })

  it('does not treat a lone number as both 학번 and 이름', () => {
    expect(splitStudentIdentity('12345')).toEqual({ studentNo: '', name: '12345' })
  })
})

describe('resolveStudentIdentity', () => {
  it('prefers the candidate that carries a 학번', () => {
    expect(resolveStudentIdentity('홍길동', '30512 홍길동')).toEqual({ studentNo: '30512', name: '홍길동' })
  })
  it('falls back to the first non-empty name', () => {
    expect(resolveStudentIdentity('', '김철수')).toEqual({ studentNo: '', name: '김철수' })
  })
})

describe('compareStudentIdentity', () => {
  it('sorts by 학번 numerically, then puts entries without 학번 last by name', () => {
    const list = [
      { studentNo: '', name: '나' },
      { studentNo: '10210', name: '다' },
      { studentNo: '10102', name: '라' },
      { studentNo: '', name: '가' }
    ].sort(compareStudentIdentity)
    expect(list.map(x => x.name)).toEqual(['라', '다', '가', '나'])
  })
})
