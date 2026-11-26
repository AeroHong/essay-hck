// 답안 표(EssayEditor.jsx)의 논리 격자 계산 + 복사/붙여넣기 변환.
import { sanitizeAnswerHtml } from './sanitizeHtml.js'
import { prepareMathForStorage } from './mathExpression.js'

/**
 * 실제 렌더 격자를 흉내내 grid[row][col] = {cell, originRow, originCol}을 채운다 — 병합 셀(colspan/rowspan)이
 * 있으면 <tr>.cells의 DOM 인덱스가 논리 열 번호와 어긋나므로, 모든 행/열 계산은 이 좌표만 본다.
 */
export function buildGrid(table) {
  const colCount = table.querySelector('colgroup')?.children.length || (table.rows[0]?.cells.length || 0)
  const rows = [...table.rows]
  const grid = rows.map(() => new Array(colCount).fill(null))
  rows.forEach((row, r) => {
    let c = 0
    ;[...row.cells].forEach(cell => {
      while (c < colCount && grid[r][c]) c++
      const colspan = cell.colSpan || 1
      const rowspan = cell.rowSpan || 1
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          if (grid[r + dr]) grid[r + dr][c + dc] = { cell, originRow: r, originCol: c }
        }
      }
      c += colspan
    })
  })
  return { grid, colCount, rowCount: rows.length }
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 셀 내용의 저장용 사본 — 수식은 원래 식 문자열로 접고, 그림은 [그림]으로 바꾼다(엑셀이 외부 그림을 끌어오지 않게). */
function cellContentClone(cell) {
  const clone = cell.cloneNode(true)
  prepareMathForStorage(clone)
  clone.querySelectorAll('img').forEach(img => img.replaceWith(document.createTextNode('[그림]')))
  return clone
}

/** 셀 하나의 평문(줄바꿈 유지) — 탭 구분 텍스트(엑셀·구글 시트의 평문 붙여넣기)에 쓴다. */
function cellPlainText(clone) {
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  clone.querySelectorAll('p, div, li').forEach(el => { el.append('\n') })
  return clone.textContent.replace(/ /g, ' ').replace(/\n+$/, '').trim()
}

function tsvField(text) {
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function cssColor(v) {
  return v && v !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(v) ? v : ''
}

/**
 * 표(또는 그 안의 사각 범위)를 클립보드용 HTML + 탭 구분 텍스트로 바꾼다.
 * HTML은 엑셀·구글 시트가 읽는 인라인 스타일(배경색·정렬·굵기·테두리)을 화면에 보이는 값 그대로 담고,
 * 앱 안에 다시 붙여넣을 때 표 디자인을 되살리도록 data-et-copy / data-et-class를 붙인다(cleanPastedTable).
 * 범위 경계를 가로지르는 병합 셀은 범위 안쪽만큼으로 잘라 넣는다.
 * @param {HTMLTableElement} table 화면에 붙어 있는(스타일 계산이 되는) 표
 * @param {{r1:number,c1:number,r2:number,c2:number}|null} range
 * @returns {{html:string, text:string}}
 */
export function tableToClipboard(table, range = null) {
  const { grid, rowCount, colCount } = buildGrid(table)
  const r1 = range ? range.r1 : 0
  const r2 = range ? range.r2 : rowCount - 1
  const c1 = range ? range.c1 : 0
  const c2 = range ? range.c2 : colCount - 1
  const cols = [...(table.querySelector('colgroup')?.children || [])]
  const view = table.ownerDocument.defaultView

  const htmlRows = []
  const textRows = []
  for (let r = r1; r <= r2; r++) {
    const htmlCells = []
    const textCells = []
    for (let c = c1; c <= c2; c++) {
      const occ = grid[r]?.[c]
      if (!occ) { textCells.push(''); continue }
      const startR = Math.max(occ.originRow, r1)
      const startC = Math.max(occ.originCol, c1)
      const clone = cellContentClone(occ.cell)
      const isStart = startR === r && startC === c
      textCells.push(isStart ? tsvField(cellPlainText(clone.cloneNode(true))) : '')
      if (!isStart) continue
      const rowspan = Math.min(occ.originRow + (occ.cell.rowSpan || 1) - 1, r2) - startR + 1
      const colspan = Math.min(occ.originCol + (occ.cell.colSpan || 1) - 1, c2) - startC + 1
      const cs = view?.getComputedStyle ? view.getComputedStyle(occ.cell) : null
      const styles = ['border:1px solid #94a3b8', 'vertical-align:top', 'padding:4px 6px']
      const bg = cssColor(cs?.backgroundColor)
      if (bg) styles.push(`background-color:${bg}`)
      const color = cssColor(cs?.color)
      if (color) styles.push(`color:${color}`)
      if (cs && Number(cs.fontWeight) >= 600) styles.push('font-weight:bold')
      const align = occ.cell.style.textAlign || (cs?.textAlign && cs.textAlign !== 'start' ? cs.textAlign : '')
      if (align) styles.push(`text-align:${align}`)
      if (occ.cell.style.textAlignLast === 'justify') styles.push('text-align-last:justify')
      const spanAttrs = `${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''}`
      htmlCells.push(`<td${spanAttrs} style="${styles.join(';')}">${sanitizeAnswerHtml(clone.innerHTML)}</td>`)
    }
    const rowHeight = table.rows[r]?.style.height
    htmlRows.push(`<tr${rowHeight ? ` style="height:${rowHeight}"` : ''}>${htmlCells.join('')}</tr>`)
    textRows.push(textCells.join('\t'))
  }
  const colHtml = cols.slice(c1, c2 + 1).map(col => `<col style="width:${col.style.width || '100px'}">`).join('')
  const width = cols.slice(c1, c2 + 1).reduce((sum, col) => sum + (parseFloat(col.style.width) || 100), 0)
  const designClass = escapeHtml(table.className || '')
  const html = `<table data-et-copy="1" data-et-class="${designClass}" border="1" style="border-collapse:collapse;width:${Math.round(width)}px"><colgroup>${colHtml}</colgroup><tbody>${htmlRows.join('')}</tbody></table>`
  return { html, text: textRows.join('\n') }
}

/**
 * 앱에서 복사한 표(tableToClipboard)를 다시 붙여넣을 때 답안에 넣을 깨끗한 표로 되돌린다 — 엑셀용 인라인
 * 색·테두리는 버리고(디자인은 클래스로 되살림) 정렬·크기만 남긴다. 앱에서 복사한 표가 아니면 null.
 * @param {string} html 클립보드 text/html
 * @returns {HTMLTableElement|null}
 */
export function cleanPastedTable(html) {
  if (!/data-et-copy/.test(html || '')) return null
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const source = tpl.content.querySelector('table[data-et-copy]')
  if (!source) return null
  const designClass = (source.getAttribute('data-et-class') || '').split(/\s+/).filter(c => /^et-[a-z-]+$/.test(c)).join(' ')
  const holder = document.createElement('div')
  holder.innerHTML = sanitizeAnswerHtml(source.outerHTML)
  const table = holder.querySelector('table')
  if (!table) return null
  ;[...table.attributes].forEach(a => { if (a.name !== 'style') table.removeAttribute(a.name) })
  if (designClass) table.className = designClass
  table.querySelectorAll('td').forEach(td => {
    ;[...td.attributes].forEach(a => { if (!['style', 'colspan', 'rowspan'].includes(a.name)) td.removeAttribute(a.name) })
    if (!td.firstChild) td.appendChild(document.createElement('br'))
  })
  return table
}
