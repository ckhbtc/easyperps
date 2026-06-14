import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync('src/App.css', 'utf8')

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1]
}

describe('chat text wrapping CSS', () => {
  it('keeps message text from breaking normal words into vertical stacks', () => {
    const baseMsgText = ruleBody('.msg-text')
    assert.match(baseMsgText, /word-break:\s*normal;/)
    assert.match(baseMsgText, /overflow-wrap:\s*break-word;/)
    assert.match(baseMsgText, /hyphens:\s*none;/)
  })

  it('gives dealer message bubbles a stable readable width', () => {
    const dealerMsgText = ruleBody('.dealer-mode .msg-text')
    const userMsgText = ruleBody('.dealer-mode .msg-user .msg-text')

    assert.match(dealerMsgText, /min-width:\s*min\(100%,\s*260px\);/)
    assert.match(dealerMsgText, /max-width:\s*100%;/)
    assert.match(userMsgText, /min-width:\s*min\(100%,\s*220px\);/)
  })

  it('keeps quick command chips on one line', () => {
    const quickButton = ruleBody('.quick-strip button')
    assert.match(quickButton, /white-space:\s*nowrap;/)
    assert.match(quickButton, /word-break:\s*normal;/)
    assert.match(quickButton, /overflow-wrap:\s*normal;/)
  })
})
