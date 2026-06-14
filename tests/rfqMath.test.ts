import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRfqCloseInput, buildRfqOpenInput, quantizeDecimal } from '../src/rfq.js'
import type { RfqMarketMetadata } from '../src/rfq.js'

const market: RfqMarketMetadata = {
  minPriceTickSize: '1000',
  minQuantityTickSize: '0.001',
}

describe('RFQ math', () => {
  it('quantizes decimals without trailing zeros', () => {
    assert.equal(quantizeDecimal('1.2399', '0.01'), '1.23')
    assert.equal(quantizeDecimal('1.2', '0.001'), '1.2')
  })

  it('builds open input from margin, leverage, and mark price', () => {
    const input = buildRfqOpenInput({
      market,
      oraclePrice: '100',
      side: 'long',
      marginUsdt: '10',
      leverage: '5',
      slippage: '0.01',
    })

    assert.deepEqual(input, {
      direction: 'long',
      margin: '10',
      quantity: '0.5',
      worstPrice: '101',
    })
  })

  it('builds close input as the opposite direction with zero margin', () => {
    const input = buildRfqCloseInput({
      market,
      oraclePrice: '100',
      side: 'long',
      quantity: '0.5555',
      slippage: '0.05',
    })

    assert.deepEqual(input, {
      direction: 'short',
      margin: '0',
      quantity: '0.555',
      worstPrice: '95',
    })
  })
})
