import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectNativeUsdcBalances,
  formatPositionInfo,
  isUsdcPerpMarket,
  NATIVE_USDC_DENOM,
  resolveDenom,
} from '../src/injective.js'

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

  it('shows only native USDC across wallet and trading balances', () => {
    const balances = collectNativeUsdcBalances({
      bankBalancesList: [
        { denom: 'inj', amount: '9000000000000000000' },
        { denom: 'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', amount: '800000000000000' },
        { denom: 'peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1230000' },
        { denom: NATIVE_USDC_DENOM.toUpperCase(), amount: '13957400' },
      ],
      subaccountsList: [
        { denom: NATIVE_USDC_DENOM, deposit: { availableBalance: '1042600' } },
        { denom: 'erc20:0x88f7f2b685f9692caf8c478f5badf09ee9b1cc13', deposit: { availableBalance: '5000000' } },
      ],
    })

    assert.deepEqual(balances, [
      { symbol: 'USDC', amount: '15.0000', denom: NATIVE_USDC_DENOM },
    ])
  })
})

describe('Injective positions', () => {
  it('keeps exact raw quantity for BTC closes while allowing rounded display', () => {
    const position = formatPositionInfo({
      marketId: '0xbtc',
      ticker: 'BTC/USDC PERP',
      direction: 'long',
      quantity: '0.00038',
      entryPrice: '65000000000',
      markPrice: '66000000000',
      margin: '25000000',
    }, {
      symbol: 'BTC',
      ticker: 'BTC/USDC PERP',
      marketId: '0xbtc',
      quoteDenom: NATIVE_USDC_DENOM,
      minPriceTickSize: '1000',
      minQuantityTickSize: '0.00001',
      initialMarginRatio: '0.05',
      maintenanceMarginRatio: '0.02',
      takerFeeRate: '0.001',
      oracleBase: 'BTC',
      oracleQuote: 'USDC',
      oracleType: 'pyth',
    })

    assert.equal(position.quantity, '0.0004')
    assert.equal(position.rawQuantity, '0.00038')
  })
})
