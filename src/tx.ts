/**
 * RFQ trade execution through gateway-prepared autosign settlements.
 *
 * Flow:
 *  1. Resolve the active RFQ AutoSign session for the connected wallet.
 *  2. Fetch the market oracle price.
 *  3. Build canonical RFQ input using human price, margin, quantity, and guardrail price.
 *  4. Ask the RFQ gateway to match quotes and prepare a fee-paid settlement tx.
 *  5. Sign only the autosign signer slot locally, preserve the fee-payer signature,
 *     broadcast, and poll for confirmation.
 */

import { IndexerGrpcOracleApi } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints, Network } from '@injectivelabs/networks'
import { Decimal } from 'decimal.js'
import type { PerpMarket } from './injective'
import { getAutoSignSession } from './autosign.js'
import { buildRfqCloseInput, buildRfqOpenInput } from './rfq.js'
import { executeRfqGatewayAutoSign } from './rfqGateway.js'

const NETWORK = Network.MainnetSentry
const endpoints = getNetworkEndpoints(NETWORK)
const oracleApi = new IndexerGrpcOracleApi(endpoints.indexer)

async function getOraclePrice(market: PerpMarket): Promise<Decimal> {
  const oraclePriceRes = await oracleApi.fetchOraclePrice({
    baseSymbol: market.oracleBase,
    quoteSymbol: market.oracleQuote,
    oracleType: market.oracleType,
  }).catch(() => null)

  const price = oraclePriceRes?.price ? new Decimal(oraclePriceRes.price) : new Decimal(0)
  if (!price.isFinite() || price.lte(0)) {
    throw new Error(`Oracle price unavailable for ${market.symbol}`)
  }
  return price
}

function requireRfqSession(injAddress: string) {
  const session = getAutoSignSession(injAddress)
  if (!session) {
    throw new Error('RFQ trading needs AutoSign enabled. Authorize AutoSign, then try again.')
  }
  return session
}

export interface OpenTradeParams {
  injAddress: string
  ethAddress: string
  market: PerpMarket
  side: 'long' | 'short'
  notionalUsdc: number
  leverage: number
  slippage?: number
  onProgress?: (msg: string) => void
}

export interface TxResult {
  txHash: string
  rfqId?: number
  quotesAccepted?: number
  bestPrice?: string | null
}

export async function openTrade(params: OpenTradeParams): Promise<TxResult> {
  const { injAddress, market, side, notionalUsdc, leverage, slippage = 0.01, onProgress } = params
  const session = requireRfqSession(injAddress)
  const oraclePrice = await getOraclePrice(market)
  const notional = new Decimal(notionalUsdc.toString())
  const leverageDec = new Decimal(leverage.toString())
  if (!notional.isFinite() || notional.lte(0)) throw new Error('Trade notional must be positive')
  if (!leverageDec.isFinite() || leverageDec.lte(0)) throw new Error('Leverage must be positive')

  const input = buildRfqOpenInput({
    market,
    oraclePrice,
    side,
    marginUsdc: notional.div(leverageDec),
    leverage: leverageDec,
    slippage: new Decimal(slippage.toString()),
  })

  if (new Decimal(input.quantity).lte(0)) {
    throw new Error('Quantity rounds to zero after tick quantization. Try a larger size.')
  }

  const result = await executeRfqGatewayAutoSign({
    session,
    marketId: market.marketId,
    input,
    onProgress,
  })

  return {
    txHash: result.txHash,
    rfqId: result.rfqId,
    quotesAccepted: result.quotesAccepted,
    bestPrice: result.bestPrice,
  }
}

export interface CloseTradeParams {
  injAddress: string
  ethAddress: string
  market: PerpMarket
  side: 'long' | 'short'
  quantity: string
  slippage?: number
  onProgress?: (msg: string) => void
}

export async function closeTrade(params: CloseTradeParams): Promise<TxResult> {
  const { injAddress, market, side, quantity, slippage = 0.05, onProgress } = params
  const session = requireRfqSession(injAddress)
  const oraclePrice = await getOraclePrice(market)

  const input = buildRfqCloseInput({
    market,
    oraclePrice,
    side,
    quantity,
    slippage: new Decimal(slippage.toString()),
  })

  if (new Decimal(input.quantity).lte(0)) {
    throw new Error('Close quantity rounds to zero after tick quantization.')
  }

  const result = await executeRfqGatewayAutoSign({
    session,
    marketId: market.marketId,
    input,
    onProgress,
  })

  return {
    txHash: result.txHash,
    rfqId: result.rfqId,
    quotesAccepted: result.quotesAccepted,
    bestPrice: result.bestPrice,
  }
}
