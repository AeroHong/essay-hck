import { describe, it, expect } from 'vitest'
import { sectionsToTree, treeToTemplate, treeTotalScore, addChild, emptyParent, emptyItem } from './questionTree.js'

const img = { url: 'https://x/pv.png', path: 'p', w: 1280, h: 920 }

describe('treeToTemplate', () => {
  it('하위 문항이 있는 문항은 공통 내용(questionGroups)과 하위 문항 섹션으로 나눈다', () => {
    const tree = [
      { ...emptyParent(), id: 'g1', promptHtml: '<p>자료</p>', children: [
        { ...emptyItem('s1'), promptHtml: '<p>빗금</p>', maxScore: '1', drawImage: img },
        { ...emptyItem('s2'), promptHtml: '<p>일</p>', maxScore: 3 },
      ] },
      { ...emptyParent(), id: 's3', promptHtml: '<p>단일 문항</p>', maxScore: 2 },
    ]
    const { sections, questionGroups } = treeToTemplate(tree)
    expect(questionGroups).toEqual([{ id: 'g1', label: '문항 1', promptHtml: '<p>자료</p>' }])
    expect(sections.map((s) => [s.id, s.heading, s.groupId, s.groupLabel, s.maxScore])).toEqual([
      ['s1', '1-1', 'g1', '문항 1', 1],
      ['s2', '1-2', 'g1', '문항 1', 3],
      ['s3', '문항 2', undefined, '', 2],
    ])
    expect(sections[0].drawImage).toEqual(img)
  })

  it('빈 문항·빈 하위 문항은 버리고 번호를 다시 매긴다', () => {
    const tree = [
      emptyParent(),
      { ...emptyParent(), id: 'g', promptHtml: '<p>a</p>', children: [emptyItem('x'), { ...emptyItem('y'), promptHtml: '<p>b</p>' }] },
    ]
    const { sections, questionGroups } = treeToTemplate(tree)
    expect(questionGroups[0].label).toBe('문항 1')
    expect(sections.map((s) => [s.id, s.heading])).toEqual([['y', '1-1']])
  })

  it('직접 붙인 이름은 그대로 쓴다', () => {
    const tree = [{ ...emptyParent(), id: 'g', heading: '순환 과정의 일', children: [{ ...emptyItem('a'), heading: '빗금 표시', promptHtml: '<p>q</p>' }] }]
    const { sections } = treeToTemplate(tree)
    expect([sections[0].heading, sections[0].groupLabel]).toEqual(['빗금 표시', '순환 과정의 일'])
  })
})

describe('sectionsToTree', () => {
  it('저장 형식을 트리로 되돌린다 (왕복)', () => {
    const tree = [
      { ...emptyParent(), id: 'g1', promptHtml: '<p>자료</p>', children: [{ ...emptyItem('s1'), promptHtml: '<p>q1</p>', maxScore: 1 }, { ...emptyItem('s2'), promptHtml: '<p>q2</p>', maxScore: 3 }] },
      { ...emptyParent(), id: 's3', promptHtml: '<p>q3</p>', maxScore: 2 },
    ]
    const saved = treeToTemplate(tree)
    const back = sectionsToTree(saved.sections, saved.questionGroups)
    expect(back.map((p) => [p.id, p.promptHtml, p.children.map((c) => c.id)])).toEqual([
      ['g1', '<p>자료</p>', ['s1', 's2']],
      ['s3', '<p>q3</p>', []],
    ])
    // 자동 이름('문항 1', '1-1')은 비워서 불러온다 — 순서를 바꾸면 다시 매겨지도록
    expect(back[0].heading).toBe('')
    expect(back[0].children[0].heading).toBe('')
  })

  it('그룹이 없는 예전 문항 세트는 문항마다 하나씩', () => {
    const back = sectionsToTree([{ id: 'a', heading: '서론', promptHtml: '<p>x</p>', maxScore: 5 }])
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ id: 'a', heading: '서론', maxScore: 5, children: [] })
  })
})

describe('addChild / treeTotalScore', () => {
  it('첫 하위 문항을 만들면 기존 답안 설정과 섹션 id를 그 하위 문항으로 옮긴다', () => {
    const p = { ...emptyParent(), id: 's9', promptHtml: '<p>자료</p>', maxScore: 4, drawImage: img }
    const next = addChild(p)
    expect(next.id).not.toBe('s9')
    expect(next.maxScore).toBe(null)
    expect(next.promptHtml).toBe('<p>자료</p>')
    expect(next.children).toHaveLength(1)
    expect(next.children[0]).toMatchObject({ id: 's9', maxScore: 4, drawImage: img })
    expect(addChild(next).children).toHaveLength(2)
  })

  it('배점 합은 답을 쓰는 칸만 더한다', () => {
    const tree = [
      { ...emptyParent(), maxScore: 99, children: [{ ...emptyItem(), maxScore: 1 }, { ...emptyItem(), maxScore: '3' }] },
      { ...emptyParent(), maxScore: 2 },
    ]
    expect(treeTotalScore(tree)).toBe(6)
  })
})
