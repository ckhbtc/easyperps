import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isUsdcPerpMarket, NATIVE_USDC_DENOM, resolveDenom } from '../src/injective.js'

describe('Injective native USDC helpers', () => {
  it('resolves native erc20 USDC denoms', () => {
    assert.deepEqual(resolveDenom(NATIVE_USDC_DENOM), { symbol: 'USDC', decimals: 6 })
    assert.deepEqual(resolveDenom('erc20:0xA00C59FF5A080D2B954D0C75E46E22A0C371235A'), {
      symbol: 'USDC',
      decimals: 6,
    })
  })

  it('identifies USDC perps across indexer market shapes', () => {
    assert.equal(isUsdcPerpMarket({ quoteDenom: NATIVE_USDC_DENOM }, 'BTC/USDC PERP'), true)
    assert.equal(isUsdcPerpMarket({ quoteToken: { symbol: 'USDC' } }, 'ETH/USDC PERP'), true)
    assert.equal(isUsdcPerpMarket({ oracleQuote: 'USDC' }, 'INJ/USDC PERP'), true)
    assert.equal(isUsdcPerpMarket({ quoteToken: { symbol: 'USDT' } }, 'INJ/USDT PERP'), false)
  })
})
