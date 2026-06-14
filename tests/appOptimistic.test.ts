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
})
