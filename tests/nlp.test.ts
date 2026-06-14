import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parse } from '../src/nlp.js'

describe('parse', () => {
  it('parses a USDC notional trade', () => {
    const result = parse('long $50 INJ at 5x')

    assert.equal(result.intent.kind, 'trade')
    if (result.intent.kind !== 'trade') assert.fail('expected trade intent')
    assert.equal(result.intent.side, 'long')
    assert.equal(result.intent.symbol, 'INJ')
    assert.equal(result.intent.amount, 50)
    assert.equal(result.intent.qty, 0)
    assert.equal(result.intent.leverage, 5)
    assert.deepEqual(result.missing, [])
  })

  it('parses token quantity trades', () => {
    const result = parse('short 2 ETH with 3x')

    assert.equal(result.intent.kind, 'trade')
    if (result.intent.kind !== 'trade') assert.fail('expected trade intent')
    assert.equal(result.intent.side, 'short')
    assert.equal(result.intent.symbol, 'ETH')
    assert.equal(result.intent.amount, 0)
    assert.equal(result.intent.qty, 2)
    assert.equal(result.intent.leverage, 3)
  })

  it('keeps incomplete trades in clarification state', () => {
    const result = parse('long INJ')

    assert.equal(result.intent.kind, 'trade')
    assert.deepEqual(result.missing, [
      'how much? (e.g. $50 or 10 INJ)',
      'what leverage? (e.g. 5x)',
    ])
  })

  it('parses bridge commands with the requested amount', () => {
    const result = parse('bridge 100.50 USDC from Arbitrum')

    assert.equal(result.intent.kind, 'bridge')
    if (result.intent.kind !== 'bridge') assert.fail('expected bridge intent')
    assert.equal(result.intent.amount, 100.5)
    assert.equal(result.intent.source, 'arbitrum')
    assert.deepEqual(result.missing, [])
    assert.equal(result.summary, 'Bridge $100.5 USDC from Arbitrum to Injective native USDC')
  })

  it('parses bridge source aliases', () => {
    const result = parse('bridge $25 from op')

    assert.equal(result.intent.kind, 'bridge')
    if (result.intent.kind !== 'bridge') assert.fail('expected bridge intent')
    assert.equal(result.intent.amount, 25)
    assert.equal(result.intent.source, 'optimism')
    assert.equal(result.summary, 'Bridge $25 USDC from Optimism to Injective native USDC')
  })

  it('asks for a bridge amount when missing', () => {
    const result = parse('bridge funds')

    assert.equal(result.intent.kind, 'bridge')
    assert.deepEqual(result.missing, ['how much to bridge? (e.g. $10 or 50 USDC)'])
  })

  it('parses read-only account intents', () => {
    assert.equal(parse('show balances').intent.kind, 'balances')
    assert.equal(parse('show positions').intent.kind, 'positions')
    assert.equal(parse('price of BTC').intent.kind, 'price')
  })
})
