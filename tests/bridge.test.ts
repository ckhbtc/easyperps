import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ARBITRUM_SOURCE,
  DEFAULT_SOURCE_CHAIN_ID,
  MAX_BRIDGE_USDC,
  SOURCE_CHAINS,
  amountFromBaseUnits,
  amountToBaseUnits,
  fetchBridgeQuote,
  getBridgeSourceChain,
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
  it('lists all supported CCTP source chains from the reference apps', () => {
    assert.deepEqual(SOURCE_CHAINS.map(chain => chain.slug), [
      'arbitrum',
      'base',
      'optimism',
      'ethereum',
      'polygon',
      'avalanche',
    ])
    assert.equal(DEFAULT_SOURCE_CHAIN_ID, ARBITRUM_SOURCE.id)
  })

  it('resolves CCTP source networks by slug, alias, and chain id', () => {
    assert.equal(getBridgeSourceChain('base').id, 8453)
    assert.equal(getBridgeSourceChain('op').id, 10)
    assert.equal(getBridgeSourceChain('eth').id, 1)
    assert.equal(getBridgeSourceChain('matic').id, 137)
    assert.equal(getBridgeSourceChain('avax').id, 43114)
    assert.equal(getBridgeSourceChain(42161).slug, 'arbitrum')
  })

  it('quotes selected source USDC to native Injective USDC one for one', async () => {
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

  it('quotes non-Arbitrum source networks', async () => {
    const quote = await fetchBridgeQuote(
      '25',
      '0x1111111111111111111111111111111111111111',
      'base',
    )

    assert.equal(quote.sourceChainId, 8453)
    assert.equal(quote.sourceChain, 'Base')
    assert.equal(quote.dstAmount, '25')
    assert.match(quote.route, /Base to Injective/)
  })
})
