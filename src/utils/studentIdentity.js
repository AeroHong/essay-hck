// 제출물에는 학번 필드가 따로 없다 — 학교 계정은 구글 표시 이름에, 개인 계정은 직접 입력한
// "학번-이름"(services/users.js setManualStudentIdentity)에 학번이 들어 있다. 인쇄물 머리글처럼
// 학번과 이름을 나눠 보여줘야 할 때 이름 문자열에서 학번(3~10자리 숫자)을 떼어낸다.

const LEADING = /^\s*[[(]?\s*(\d{3,10})\s*[\])]?\s*[-_.·,:]?\s*(.*?)\s*$/
const TRAILING = /^\s*(.*?)\s*[-_.·,:]?\s*[[(]?\s*(\d{3,10})\s*[\])]?\s*$/

/**
 * "10101-홍길동", "10101 홍길동", "[10101] 홍길동", "홍길동(10101)", "홍길동 10101" → { studentNo, name }.
 * 숫자가 없으면 studentNo는 ''이고 이름은 그대로다.
 * @param {string} raw
 * @returns {{ studentNo: string, name: string }}
 */
export function splitStudentIdentity(raw) {
  const text = (raw || '').trim()
  if (!text) return { studentNo: '', name: '' }
  const lead = LEADING.exec(text)
  if (lead && lead[2]) return { studentNo: lead[1], name: lead[2] }
  const trail = TRAILING.exec(text)
  if (trail && trail[1]) return { studentNo: trail[2], name: trail[1] }
  return { studentNo: '', name: text }
}

/**
 * 여러 후보(제출물 이름, Classroom 명단 이름 등) 중 학번이 들어 있는 첫 값을 쓴다.
 * 학번을 못 찾으면 첫 번째로 비어 있지 않은 이름만 돌려준다.
 * @param {...string} candidates
 */
export function resolveStudentIdentity(...candidates) {
  let fallback = ''
  for (const c of candidates) {
    const parsed = splitStudentIdentity(c)
    if (parsed.studentNo) return parsed
    if (!fallback && parsed.name) fallback = parsed.name
  }
  return { studentNo: '', name: fallback }
}

/** 학번 순(숫자 비교), 학번이 없으면 뒤로 보내 이름 순. */
export function compareStudentIdentity(a, b) {
  if (a.studentNo && b.studentNo && a.studentNo !== b.studentNo) {
    return a.studentNo.length - b.studentNo.length || a.studentNo.localeCompare(b.studentNo)
  }
  if (a.studentNo && !b.studentNo) return -1
  if (!a.studentNo && b.studentNo) return 1
  return (a.name || '').localeCompare(b.name || '', 'ko')
}
