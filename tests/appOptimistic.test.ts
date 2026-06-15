import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')

describe('RFQ optimistic UI source contract', () => {
  it('links transaction hashes to TCX mainnet explorer', () => {
    assert.match(app, /https:\/\/tcx\.inj\.so\/tx\/\$\{encodeURIComponent\(txHash\)\}\?network=mainnet&mode=all/)
  })

  it('handles RFQ matched progress before printing the transaction hash', () => {
    assert.match(app, /event\?\.phase === 'matched'/)
    assert.match(app, /confirmation\s*\?\.\s*then/)
    assert.match(app, /type:\s*'tx',\s*txHash/)
  })

  it('does not collapse post-broadcast settlement errors to a blank generic message', () => {
    assert.match(app, /summarizeRfqSettlementError/)
    assert.match(app, /RFQ quotes expired before settlement/)
    assert.match(app, /console\.error\('RFQ settlement failed after broadcast'/)
  })
})

describe('positions empty-state source contract', () => {
  it('answers empty positions with one plain agent message and no empty card', () => {
    assert.match(app, /if \(data\.length === 0\) return null/)
    assert.match(app, /data\.length === 0[\s\S]*agentMsg\('No open positions\.'\)/)
    assert.match(app, /agentMsg\('Your open positions:', \{ type: 'positions', data \}\)/)
  })
})
