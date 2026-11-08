// 서술형 문항 세트의 트리 구조 ↔ 저장 형식 변환.
//
// 편집기에서는 '문항(공통 내용) → 하위 문항' 2단 트리로 다루지만, 채점·리플레이·대시보드·제출물은
// 모두 답을 쓰는 칸 단위의 평평한 sections[]를 기준으로 동작한다. 그래서 저장은 이렇게 나눈다.
//   template.questionGroups = [{ id, label, promptHtml }]   하위 문항이 있는 문항의 공통 내용(자료·상황)
//   template.sections[]     = 답을 쓰는 칸. 하위 문항이면 groupId(그 문항 id)·groupLabel(그 문항 이름)을 가진다.
// 하위 문항이 없는 문항은 예전처럼 section 하나로 저장된다(기존 문항 세트와 호환).

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
export const makeSectionId = () => newId('sec')
export const makeGroupId = () => newId('grp')

// 비워 두면 자동으로 붙는 이름 — 순서를 바꾸면 다시 매겨야 하므로 저장된 값이 이 꼴이면 '자동'으로 본다
const AUTO_PARENT = /^문항\s*\d+$/
const AUTO_CHILD = /^\d+\s*-\s*\d+$/
export const autoParentHeading = (n) => `문항 ${n}`
export const autoChildHeading = (n, k) => `${n}-${k}`
const userHeading = (h, auto) => (typeof h === 'string' && !auto.test(h.trim()) ? h : '')

export function emptyItem(id = makeSectionId()) {
  return { id, heading: '', promptHtml: '', required: true, wordLimitGuide: null, maxScore: null, drawImage: null }
}

export function emptyParent() {
  return { ...emptyItem(), children: [] }
}

const answerFields = (s) => ({
  required: s.required !== false,
  wordLimitGuide: s.wordLimitGuide ?? null,
  maxScore: s.maxScore ?? null,
  drawImage: s.drawImage?.url ? s.drawImage : null,
})

/**
 * 저장된 문항 세트 → 편집용 트리
 * @param {Array} sections template.sections
 * @param {Array} [groups] template.questionGroups
 */
export function sectionsToTree(sections = [], groups = []) {
  const groupById = new Map((groups || []).map((g) => [g.id, g]))
  const tree = []
  for (const s of sections || []) {
    const group = s.groupId ? groupById.get(s.groupId) : null
    const item = { id: s.id, heading: userHeading(s.heading, group ? AUTO_CHILD : AUTO_PARENT), promptHtml: s.promptHtml || '', ...answerFields(s) }
    if (!group) {
      tree.push({ ...item, children: [] })
      continue
    }
    const last = tree[tree.length - 1]
    if (last && last.id === group.id) last.children.push(item)
    else tree.push({ ...emptyItem(group.id), heading: userHeading(group.label, AUTO_PARENT), promptHtml: group.promptHtml || '', children: [item] })
  }
  return tree
}

/**
 * 편집용 트리 → 저장 형식. isEmptyHtml/sanitize는 호출부(편집기)에서 주입한다.
 * @param {Array} tree
 * @param {{sanitize:(html:string)=>string, isEmpty:(html:string)=>boolean}} html
 * @returns {{sections: Array, questionGroups: Array}}
 */
export function treeToTemplate(tree, { sanitize = (h) => h || '', isEmpty = (h) => !h } = {}) {
  const clean = (h) => {
    const safe = sanitize(h || '')
    return isEmpty(safe) ? '' : safe
  }
  const hasContent = (it) => clean(it.promptHtml) || (it.heading || '').trim() || it.drawImage?.url
  const toSection = (it, extra) => ({
    id: it.id,
    groupLabel: '',
    guidance: '',
    promptHtml: clean(it.promptHtml),
    required: !!it.required,
    wordLimitGuide: it.wordLimitGuide ? Number(it.wordLimitGuide) : null,
    maxScore: it.maxScore !== '' && it.maxScore != null && Number(it.maxScore) > 0 ? Number(it.maxScore) : null,
    drawImage: it.drawImage?.url
      ? { url: it.drawImage.url, path: it.drawImage.path || '', w: Number(it.drawImage.w) || 0, h: Number(it.drawImage.h) || 0 }
      : null,
    ...extra,
  })

  const sections = []
  const questionGroups = []
  let n = 0
  for (const parent of tree || []) {
    const children = (parent.children || []).filter(hasContent)
    if (!children.length && !hasContent(parent)) continue
    n += 1
    const label = (parent.heading || '').trim() || autoParentHeading(n)
    if (!children.length) {
      sections.push(toSection(parent, { heading: label }))
      continue
    }
    questionGroups.push({ id: parent.id, label, promptHtml: clean(parent.promptHtml) })
    children.forEach((c, k) => {
      sections.push(toSection(c, { heading: (c.heading || '').trim() || autoChildHeading(n, k + 1), groupId: parent.id, groupLabel: label }))
    })
  }
  return { sections, questionGroups }
}

/** 답을 쓰는 칸(하위 문항이 없는 문항 + 모든 하위 문항)의 배점 합 */
export function treeTotalScore(tree) {
  let sum = 0
  for (const p of tree || []) {
    const items = p.children?.length ? p.children : [p]
    for (const it of items) sum += Number(it.maxScore) || 0
  }
  return sum
}

/**
 * 하위 문항이 없던 문항에 첫 하위 문항을 만든다. 그 문항에 이미 달려 있던 답안 설정(배점·그림 위
 * 표시·분량)과 section id는 첫 하위 문항으로 옮긴다 — 이미 낸 답안이 있어도 그 칸에 그대로 이어지게.
 * 문항 자체는 새 그룹 id를 받고, 내용(promptHtml)은 공통 내용으로 남는다.
 */
export function addChild(parent) {
  if (parent.children?.length) return { ...parent, children: [...parent.children, emptyItem()] }
  const first = { ...emptyItem(parent.id), ...answerFields(parent) }
  return { ...parent, id: makeGroupId(), maxScore: null, drawImage: null, wordLimitGuide: null, children: [first] }
}

/** 공통 내용의 그룹 id를 찾기 위한 조회표 */
export function groupMap(template) {
  return new Map((template?.questionGroups || []).map((g) => [g.id, g]))
}
