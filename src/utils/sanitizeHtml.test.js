// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeAnswerHtml } from './sanitizeHtml.js'

describe('sanitizeAnswerHtml — 표 서식', () => {
  it('keeps cell alignment and table design classes', () => {
    const html = '<table class="et-table et-hrow et-band-even et-theme-blue" style="width:500px"><tbody><tr><td style="text-align:center">가</td><td style="text-align:justify;text-align-last:justify">나</td></tr></tbody></table>'
    const out = sanitizeAnswerHtml(html)
    expect(out).toContain('class="et-table et-hrow et-band-even et-theme-blue"')
    expect(out).toContain('style="width:500px"')
    expect(out).toContain('style="text-align:center"')
    expect(out).toContain('style="text-align:justify;text-align-last:justify"')
  })

  it('drops other style values', () => {
    const out = sanitizeAnswerHtml('<table><tbody><tr><td style="text-align:expression(alert(1));background:url(javascript:x)">가</td></tr></tbody></table>')
    expect(out).not.toMatch(/style=/)
  })
})
