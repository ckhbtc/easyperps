import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ARBITRUM_SOURCE,
  MAX_BRIDGE_USDC,
  amountFromBaseUnits,
  amountToBaseUnits,
  fetchBridgeQuote,
  isValidBridgeAmount,
} from '../src/bridge.js'

describe('bridge amount conversion', () => {
  it('converts human USDC amounts to base units exactly', () => {
    assert.equal(amountToBaseUnits('100').toString(), '100000000')
    assert.equal(amountToBaseUnits('1.234567').toString(), '1234567')
    assert.equal(amountToBaseUnits('0.000001').toString(), '1')
  })

  it('converts base units back to display amounts', () => {
    assert.equal(amountFromBaseUnits('100000000'), '100')
    assert.equal(amountFromBaseUnits('1234567'), '1.234567')
    assert.equal(amountFromBaseUnits('1'), '0.000001')
  })

  it('rejects invalid or over-precise amounts instead of rounding', () => {
    assert.throws(() => amountToBaseUnits('0'), /Invalid amount/)
    assert.throws(() => amountToBaseUnits('-1'), /Invalid amount/)
    assert.throws(() => amountToBaseUnits('1.2345678'), /up to 6 decimal places/)
  })
})

describe('isValidBridgeAmount', () => {
  it('accepts positive amounts up to the cap', () => {
    assert.equal(isValidBridgeAmount('1'), true)
    assert.equal(isValidBridgeAmount('01'), true)
    assert.equal(isValidBridgeAmount('100.5'), true)
    assert.equal(isValidBridgeAmount(String(MAX_BRIDGE_USDC)), true)
  })

  it('rejects empty, zero, negative, over-precise, non-numeric, and over-cap inputs', () => {
    assert.equal(isValidBridgeAmount(''), false)
    assert.equal(isValidBridgeAmount('0'), false)
    assert.equal(isValidBridgeAmount('-1'), false)
    assert.equal(isValidBridgeAmount('1.0000001'), false)
    assert.equal(isValidBridgeAmount('abc'), false)
    assert.equal(isValidBridgeAmount(String(MAX_BRIDGE_USDC + 1)), false)
  })
})

describe('CCTP bridge quote', () => {
  it('quotes Arbitrum USDC to native Injective USDC one for one', async () => {
    const quote = await fetchBridgeQuote('10.5', '0x1111111111111111111111111111111111111111')

    assert.equal(quote.sourceChainId, ARBITRUM_SOURCE.id)
    assert.equal(quote.sourceChain, 'Arbitrum')
    assert.equal(quote.srcAmountBase, '10500000')
    assert.equal(quote.dstAmount, '10.5')
    assert.equal(quote.dstAmountBase, '10500000')
    assert.equal(quote.protocolFee, '0')
    assert.equal(quote.fixFeeWei, '0')
    assert.match(quote.route, /Circle CCTP V2 standard/)
  })
})
