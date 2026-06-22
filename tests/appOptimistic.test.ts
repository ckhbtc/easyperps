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
    assert.match(app, /last\.content\.startsWith\('RFQ matched'\)\s*\?\s*summarizeRfqSettlementError\(e\)/)
  })
})

describe('positions empty-state source contract', () => {
  it('answers empty positions with one plain agent message and no empty card', () => {
    assert.match(app, /if \(data\.length === 0\) return null/)
    assert.match(app, /data\.length === 0[\s\S]*agentMsg\('No open positions\.'\)/)
    assert.match(app, /agentMsg\('Your open positions:', \{ type: 'positions', data \}\)/)
  })
})

describe('wallet disconnect source contract', () => {
  it('revokes MetaMask account permissions on disconnect', () => {
    assert.match(app, /disconnectMetaMask/)
    assert.match(app, /await disconnectMetaMask\(\)/)
  })

  it('does not print duplicate disconnect messages after permission revoke', () => {
    assert.match(app, /prev\[prev\.length - 1\]\?\.content === 'Wallet disconnected\.'/)
  })
})

describe('RFQ close source contract', () => {
  it('uses raw position size instead of rounded display size when closing', () => {
    assert.match(app, /quantity:\s*pos\.rawQuantity/)
  })
})

describe('RFQ in-flight guards', () => {
  it('uses synchronous refs to block duplicate sends and RFQ actions', () => {
    assert.match(app, /const loadingRef = useRef\(false\)/)
    assert.match(app, /if \(!text \|\| loadingRef\.current\) return/)
    assert.match(app, /const rfqBusyRef = useRef\(false\)/)
    assert.match(app, /async function runRfqAction/)
  })
})
