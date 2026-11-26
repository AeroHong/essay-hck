// 불러온 명단은 이 기기에만 캐시한다 — 새로고침마다 Classroom 재로그인 없이 미참여 표시를
// 유지하려는 용도. 학생 이메일이 들어 있어 학생도 읽을 수 있는 배정 문서에는 넣지 않는다.
function rosterCacheKey(assignmentId) {
  return `essay-roster:${assignmentId}`
}
export function readRosterCache(assignmentId) {
  try {
    const raw = localStorage.getItem(rosterCacheKey(assignmentId))
    const data = raw ? JSON.parse(raw) : null
    // 이메일 권한 없이 불러와 0명으로 저장된 예전 캐시는 무시한다(명단 0명 상태로 굳지 않게).
    if (!data?.roster || Object.keys(data.roster).length === 0) return null
    return data
  } catch {
    return null
  }
}
export function writeRosterCache(assignmentId, data) {
  try {
    localStorage.setItem(rosterCacheKey(assignmentId), JSON.stringify(data))
  } catch {
    // 저장 공간이 없거나 막혀 있으면 이번 화면에서만 쓴다.
  }
}
