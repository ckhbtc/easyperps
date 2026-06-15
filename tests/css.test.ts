import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync('src/App.css', 'utf8')
const appSource = readFileSync('src/App.tsx', 'utf8')

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

describe('tooltip CSS', () => {
  it('keeps tooltip text readable against the tooltip background', () => {
    const tooltip = ruleBody('[data-tooltip]::after')

    assert.match(tooltip, /background:\s*var\(--bg\);/)
    assert.doesNotMatch(tooltip, /color:\s*var\(--text\);/)
  })
})

describe('bridge source dropdown UI', () => {
  it('uses an in-app listbox instead of the native select menu', () => {
    assert.doesNotMatch(appSource, /<select[\s\S]*bridge-chain-select/)
    assert.match(appSource, /aria-haspopup="listbox"/)
    assert.match(appSource, /role="listbox"/)
    assert.match(appSource, /role="option"/)
  })

  it('matches the dealer-mode bridge design language', () => {
    const trigger = ruleBody('.dealer-mode .bridge-source-trigger')
    const menu = ruleBody('.dealer-mode .bridge-source-menu')
    const option = ruleBody('.dealer-mode .bridge-source-option')
    const selected = ruleBody('.dealer-mode .bridge-source-option.selected')

    assert.match(trigger, /font-family:\s*var\(--font-display\);/)
    assert.match(menu, /background:\s*var\(--cream\);/)
    assert.match(menu, /border:\s*4px solid var\(--blue\);/)
    assert.match(menu, /box-shadow:\s*0 0 0 2px var\(--yellow\),\s*10px 10px 0 #080812;/)
    assert.match(option, /border:\s*3px solid #080812;/)
    assert.match(selected, /background:\s*var\(--blue\);/)
  })
})

describe('dealer ticker marquee', () => {
  it('renders duplicated ticker lanes so the loop can reset invisibly', () => {
    assert.match(appSource, /const DEALER_TICKER_PHRASES = \[/)
    assert.match(appSource, /const DEALER_TICKER_LANES = \[0, 1\]/)
    assert.match(appSource, /DEALER_TICKER_LANES\.map/)
    assert.match(appSource, /className="dealer-ticker-group"/)
  })

  it('keeps enough phrases in each lane to cover wide screens', () => {
    const phrases = /const DEALER_TICKER_PHRASES = \[([\s\S]*?)\]\n/.exec(appSource)?.[1] ?? ''
    const phraseCount = (phrases.match(/'/g) ?? []).length / 2

    assert.ok(phraseCount >= 14, `expected at least 14 ticker phrases, found ${phraseCount}`)
  })

  it('animates exactly one duplicated lane with no end gap', () => {
    const track = ruleBody('.dealer-ticker-track')
    const group = ruleBody('.dealer-ticker-group')

    assert.match(css, /@keyframes dealer-marquee\s*\{[\s\S]*translate3d\(-50%,\s*0,\s*0\);[\s\S]*\}/)
    assert.match(track, /animation:\s*dealer-marquee\s*24s linear infinite;/)
    assert.match(track, /will-change:\s*transform;/)
    assert.match(group, /flex:\s*0 0 auto;/)
    assert.match(group, /min-width:\s*100vw;/)
  })
})
