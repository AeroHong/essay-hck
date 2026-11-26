// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildGrid, tableToClipboard, cleanPastedTable } from './tableGrid.js'

function makeTable(html) {
  const holder = document.createElement('div')
  holder.innerHTML = html
  document.body.appendChild(holder)
  return holder.querySelector('table')
}

const MERGED = `<table class="et-table et-hrow et-band-even et-theme-blue" style="width:300px">
  <colgroup><col style="width:100px"><col style="width:100px"><col style="width:100px"></colgroup>
  <tbody>
    <tr><td colspan="2" style="text-align:center">이름</td><td>점수</td></tr>
    <tr><td>홍<br>길동</td><td>a"b</td><td>90</td></tr>
  </tbody></table>`

describe('buildGrid', () => {
  it('maps merged cells onto logical coordinates', () => {
    const { grid, rowCount, colCount } = buildGrid(makeTable(MERGED))
    expect([rowCount, colCount]).toEqual([2, 3])
    expect(grid[0][1].originCol).toBe(0)
    expect(grid[0][2].cell.textContent).toBe('점수')
  })
})

describe('tableToClipboard', () => {
  it('writes tab-separated text with quoting for line breaks and quotes', () => {
    const { text } = tableToClipboard(makeTable(MERGED))
    expect(text).toBe('이름\t\t점수\n"홍\n길동"\t"a""b"\t90')
  })

  it('keeps merges, alignment and the design class in the HTML', () => {
    const { html } = tableToClipboard(makeTable(MERGED))
    expect(html).toContain('data-et-class="et-table et-hrow et-band-even et-theme-blue"')
    expect(html).toContain('colspan="2"')
    expect(html).toContain('text-align:center')
  })

  it('clips a merged cell to the copied range', () => {
    const { html, text } = tableToClipboard(makeTable(MERGED), { r1: 0, c1: 1, r2: 1, c2: 2 })
    expect(html).not.toContain('colspan')
    expect(text).toBe('이름\t점수\na"b\t90'.replace('a"b', '"a""b"'))
  })
})

describe('cleanPastedTable', () => {
  it('rebuilds our copied table with its design class and without Excel inline colors', () => {
    const { html } = tableToClipboard(makeTable(MERGED))
    const table = cleanPastedTable(html)
    expect(table.className).toBe('et-table et-hrow et-band-even et-theme-blue')
    expect(table.hasAttribute('data-et-copy')).toBe(false)
    expect(table.outerHTML).not.toMatch(/border:|background-color/)
    expect(table.querySelector('td').getAttribute('style')).toBe('text-align:center')
  })

  it('ignores tables copied from elsewhere', () => {
    expect(cleanPastedTable('<table><tr><td>x</td></tr></table>')).toBeNull()
  })
})
