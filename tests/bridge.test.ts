import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_BRIDGE_USDC,
  amountFromBaseUnits,
  amountToBaseUnits,
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
    assert.equal(isValidBridgeAmount('100.5'), true)
    assert.equal(isValidBridgeAmount(String(MAX_BRIDGE_USDC)), true)
  })

  it('rejects empty, zero, negative, non-numeric, and over-cap inputs', () => {
    assert.equal(isValidBridgeAmount(''), false)
    assert.equal(isValidBridgeAmount('0'), false)
    assert.equal(isValidBridgeAmount('-1'), false)
    assert.equal(isValidBridgeAmount('abc'), false)
    assert.equal(isValidBridgeAmount(String(MAX_BRIDGE_USDC + 1)), false)
  })
})
