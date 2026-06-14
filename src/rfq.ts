import { Decimal } from 'decimal.js'

const QUOTE_DECIMALS = 6

export interface RfqMarketMetadata {
  minPriceTickSize: string
  minQuantityTickSize: string
}

export interface RfqOrderInput {
  direction: 'long' | 'short'
  margin: string
  quantity: string
  worstPrice: string
}

function canonicalDecimal(value: Decimal.Value): string {
  const decimal = new Decimal(value)
  if (!decimal.isFinite()) throw new Error(`Invalid decimal value: ${value}`)
  const fixed = decimal.toFixed()
  if (!fixed.includes('.')) return fixed
  return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') || '0'
}

export function quantizeDecimal(
  value: Decimal.Value,
  tick: Decimal.Value,
  rounding: Decimal.Rounding = Decimal.ROUND_FLOOR,
): string {
  const decimal = new Decimal(value)
  const minTick = new Decimal(tick || 0)
  if (!decimal.isFinite()) throw new Error(`Invalid decimal value: ${value}`)
  if (!minTick.isFinite() || minTick.lte(0)) return canonicalDecimal(decimal)
  return canonicalDecimal(decimal.div(minTick).toDecimalPlaces(0, rounding).mul(minTick))
}

function humanPriceTick(minPriceTickSize: string): Decimal {
  return new Decimal(minPriceTickSize || '1').div(new Decimal(10).pow(QUOTE_DECIMALS))
}

export function buildRfqOpenInput({
  market,
  oraclePrice,
  side,
  marginUsdt,
  leverage,
  slippage,
}: {
  market: RfqMarketMetadata
  oraclePrice: Decimal.Value
  side: 'long' | 'short'
  marginUsdt: Decimal.Value
  leverage: Decimal.Value
  slippage: Decimal.Value
}): RfqOrderInput {
  const price = new Decimal(oraclePrice)
  const margin = new Decimal(marginUsdt)
  const leverageDec = new Decimal(leverage)
  if (!price.isFinite() || price.lte(0)) throw new Error('Oracle price is unavailable')
  if (!margin.isFinite() || margin.lte(0)) throw new Error('Margin must be positive')
  if (!leverageDec.isFinite() || leverageDec.lte(0)) throw new Error('Leverage must be positive')

  const direction = side
  const notional = margin.mul(leverageDec)
  const slippageDec = new Decimal(slippage)
  const priceTick = humanPriceTick(market.minPriceTickSize)
  const quantityTick = new Decimal(market.minQuantityTickSize || '0.001')
  const worstRaw = direction === 'long'
    ? price.mul(new Decimal(1).plus(slippageDec))
    : price.mul(new Decimal(1).minus(slippageDec))

  return {
    direction,
    margin: canonicalDecimal(margin),
    quantity: quantizeDecimal(notional.div(price), quantityTick, Decimal.ROUND_FLOOR),
    worstPrice: quantizeDecimal(
      worstRaw,
      priceTick,
      direction === 'long' ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR,
    ),
  }
}

export function buildRfqCloseInput({
  market,
  oraclePrice,
  side,
  quantity,
  slippage,
}: {
  market: RfqMarketMetadata
  oraclePrice: Decimal.Value
  side: 'long' | 'short'
  quantity: Decimal.Value
  slippage: Decimal.Value
}): RfqOrderInput {
  const price = new Decimal(oraclePrice)
  const qty = new Decimal(quantity)
  if (!price.isFinite() || price.lte(0)) throw new Error('Oracle price is unavailable')
  if (!qty.isFinite() || qty.lte(0)) throw new Error('Close quantity must be positive')

  const direction = side === 'long' ? 'short' : 'long'
  const slippageDec = new Decimal(slippage)
  const priceTick = humanPriceTick(market.minPriceTickSize)
  const quantityTick = new Decimal(market.minQuantityTickSize || '0.001')
  const worstRaw = direction === 'long'
    ? price.mul(new Decimal(1).plus(slippageDec))
    : price.mul(new Decimal(1).minus(slippageDec))

  return {
    direction,
    margin: '0',
    quantity: quantizeDecimal(qty, quantityTick, Decimal.ROUND_FLOOR),
    worstPrice: quantizeDecimal(
      worstRaw,
      priceTick,
      direction === 'long' ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR,
    ),
  }
}
