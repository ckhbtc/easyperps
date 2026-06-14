import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')

function jsxElementWithClass(tagName: string, className: string): string {
  const classIndex = app.indexOf(`className="${className}"`)
  assert.notEqual(classIndex, -1, `missing ${className}`)

  const start = app.lastIndexOf(`<${tagName}`, classIndex)
  assert.notEqual(start, -1, `missing opening ${tagName} for ${className}`)

  const selfClosingEnd = app.indexOf('/>', classIndex)
  const closingEnd = app.indexOf(`</${tagName}>`, classIndex)
  const end = selfClosingEnd !== -1 && (closingEnd === -1 || selfClosingEnd < closingEnd)
    ? selfClosingEnd + 2
    : closingEnd + `</${tagName}>`.length

  assert.ok(end > start, `missing closing ${tagName} for ${className}`)
  return app.slice(start, end)
}

describe('chat composer focus behavior', () => {
  it('keeps the text entry focusable while a message is sending', () => {
    const inputBlock = jsxElementWithClass('input', 'chat-input')

    assert.doesNotMatch(inputBlock, /disabled=\{loading\}/)
  })

  it('keeps click sends from moving focus out of the text entry', () => {
    const sendButtonBlock = jsxElementWithClass('button', 'btn btn-send')

    assert.match(sendButtonBlock, /onMouseDown=\{[\s\S]*preventDefault\(\)/)
  })

  it('returns focus around the async send cycle', () => {
    const sendStart = app.indexOf('async function handleSend()')
    const processStart = app.indexOf('// ─── NLP routing')
    const handleSendBlock = app.slice(sendStart, processStart)

    assert.match(handleSendBlock, /setMessages\(prev => \[\.\.\.prev, userMsg\(text\)\]\)\s+focusComposer\(\)\s+setLoading\(true\)/)
    assert.match(handleSendBlock, /finally \{\s+setLoading\(false\)\s+focusComposer\(\)\s+\}/)
  })
})
