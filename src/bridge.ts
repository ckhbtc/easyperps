/**
 * Circle CCTP V2 inbound bridge: source-chain USDC to native Injective USDC.
 *
 * EasyPerps is a static SPA, so the user submits both source-chain burn and
 * destination-chain mint transactions from MetaMask. The mint side is
 * permissionless, but it still requires a small amount of INJ on Injective EVM
 * for gas.
 */

import { Interface } from 'ethers'
import { NATIVE_USDC_EVM_ADDRESS } from './injective.js'

const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
const MESSAGE_TRANSMITTER_V2 = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
const ATTESTATION_API = 'https://iris-api.circle.com'
const ZERO_BYTES32 = '0'.repeat(64)
const STANDARD_FINALITY = 2000
const STANDARD_MAX_FEE = 0n

const APPROVE_SIG = '0x095ea7b3'
const ALLOWANCE_SIG = '0xdd62ed3e'
const DEPOSIT_FOR_BURN_SIG = '0x8e0250ee'
const DECIMAL_AMOUNT_RE = /^\d+(?:\.\d{1,6})?$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const RECEIVE_MESSAGE_IFACE = new Interface([
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
])

interface BridgeChain {
  id: number
  hex: string
  domain: number
  name: string
  shortName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

export type BridgeSourceSlug =
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'ethereum'
  | 'polygon'
  | 'avalanche'

export interface BridgeSourceChain extends BridgeChain {
  slug: BridgeSourceSlug
  usdc: string
}

export const ARBITRUM_SOURCE: BridgeSourceChain = {
  id: 42161,
  hex: '0xa4b1',
  domain: 3,
  slug: 'arbitrum',
  name: 'Arbitrum One',
  shortName: 'Arbitrum',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://arbiscan.io'],
  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
}

export const SOURCE_CHAINS: BridgeSourceChain[] = [
  ARBITRUM_SOURCE,
  {
    id: 8453,
    hex: '0x2105',
    domain: 6,
    slug: 'base',
    name: 'Base',
    shortName: 'Base',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'],
    blockExplorerUrls: ['https://basescan.org'],
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  {
    id: 10,
    hex: '0xa',
    domain: 2,
    slug: 'optimism',
    name: 'OP Mainnet',
    shortName: 'Optimism',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io', 'https://optimism.drpc.org'],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  {
    id: 1,
    hex: '0x1',
    domain: 0,
    slug: 'ethereum',
    name: 'Ethereum',
    shortName: 'Ethereum',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://eth.drpc.org', 'https://rpc.ankr.com/eth'],
    blockExplorerUrls: ['https://etherscan.io'],
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  {
    id: 137,
    hex: '0x89',
    domain: 7,
    slug: 'polygon',
    name: 'Polygon',
    shortName: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com', 'https://polygon.drpc.org'],
    blockExplorerUrls: ['https://polygonscan.com'],
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  {
    id: 43114,
    hex: '0xa86a',
    domain: 1,
    slug: 'avalanche',
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc', 'https://avalanche.drpc.org'],
    blockExplorerUrls: ['https://snowtrace.io'],
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
]

export const INJECTIVE_EVM: BridgeChain = {
  id: 1776,
  hex: '0x6f0',
  domain: 29,
  name: 'Injective',
  shortName: 'Injective',
  nativeCurrency: { name: 'INJ', symbol: 'INJ', decimals: 18 },
  rpcUrls: ['https://sentry.evm-rpc.injective.network'],
  blockExplorerUrls: ['https://blockscout.injective.network'],
}

export const BRIDGE_SRC_TOKEN = ARBITRUM_SOURCE.usdc
export const BRIDGE_DST_TOKEN = NATIVE_USDC_EVM_ADDRESS
export const MAX_BRIDGE_USDC = 100_000
export const DEFAULT_SOURCE_CHAIN_ID = ARBITRUM_SOURCE.id

const SOURCE_ALIASES: Record<string, BridgeSourceSlug> = {
  arb: 'arbitrum',
  'arbitrum-one': 'arbitrum',
  eth: 'ethereum',
  mainnet: 'ethereum',
  op: 'optimism',
  'op-mainnet': 'optimism',
  matic: 'polygon',
  poly: 'polygon',
  avax: 'avalanche',
  'avalanche-c-chain': 'avalanche',
}

export interface BridgeEstimation {
  srcAmount: string
  srcAmountBase: string
  dstAmount: string
  dstAmountBase: string
  protocolFee: string
  fixFeeWei: string
  route: string
  sourceChainId: number
  sourceChain: string
}

export interface BridgeResult {
  approveTxHash: string | null
  burnTxHash: string
  mintTxHash: string
  estimation: BridgeEstimation
}

export function amountToBaseUnits(human: string, decimals = 6): bigint {
  const amount = String(human).trim()
  if (amount.startsWith('-')) throw new Error('Invalid amount')
  if (!DECIMAL_AMOUNT_RE.test(amount)) {
    throw new Error(`Amount supports up to ${decimals} decimal places`)
  }

  const [wholeRaw = '0', fracRaw = ''] = amount.split('.')
  const base =
    BigInt(wholeRaw) * 10n ** BigInt(decimals) +
    BigInt((fracRaw + '0'.repeat(decimals)).slice(0, decimals))

  if (base <= 0n) throw new Error('Invalid amount')
  return base
}

export function amountFromBaseUnits(base: string | bigint, decimals = 6): string {
  const raw = typeof base === 'bigint' ? base : BigInt(base)
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = (raw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export function isValidBridgeAmount(amount: string): boolean {
  try {
    const base = amountToBaseUnits(amount)
    const max = BigInt(MAX_BRIDGE_USDC) * 1_000_000n
    return base > 0n && base <= max
  } catch {
    return false
  }
}

export function getBridgeSourceChain(source?: string | number): BridgeSourceChain {
  if (source === undefined || source === null || source === '') {
    return SOURCE_CHAINS.find(chain => chain.id === DEFAULT_SOURCE_CHAIN_ID) ?? ARBITRUM_SOURCE
  }

  if (typeof source === 'number' || /^\d+$/.test(String(source).trim())) {
    const chainId = Number(source)
    const found = SOURCE_CHAINS.find(chain => chain.id === chainId)
    if (found) return found
    throw new Error(`Unsupported bridge source chain: ${source}`)
  }

  const normalized = String(source).trim().toLowerCase().replace(/[\s_]+/g, '-')
  const slug = SOURCE_ALIASES[normalized] ?? normalized
  const found = SOURCE_CHAINS.find(chain => chain.slug === slug)
  if (found) return found

  throw new Error(`Unsupported bridge source network: ${source}`)
}

function assertEvmAddress(address: string, label: string): void {
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(`${label} must be a 0x EVM address`)
  }
}

function padUint(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, '0')
}

function padAddress(address: string): string {
  return address.replace(/^0x/i, '').toLowerCase().padStart(64, '0')
}

function encodeApprove(spender: string, amount: bigint): string {
  return `${APPROVE_SIG}${padAddress(spender)}${padUint(amount)}`
}

function encodeAllowance(owner: string, spender: string): string {
  return `${ALLOWANCE_SIG}${padAddress(owner)}${padAddress(spender)}`
}

function encodeDepositForBurn(amount: bigint, recipientEvm: string, source: BridgeSourceChain): string {
  return [
    DEPOSIT_FOR_BURN_SIG,
    padUint(amount),
    padUint(INJECTIVE_EVM.domain),
    padAddress(recipientEvm),
    padAddress(source.usdc),
    ZERO_BYTES32,
    padUint(STANDARD_MAX_FEE),
    padUint(STANDARD_FINALITY),
  ].join('')
}

function encodeReceiveMessage(message: string, attestation: string): string {
  return RECEIVE_MESSAGE_IFACE.encodeFunctionData('receiveMessage', [message, attestation])
}

async function switchToChain(chain: BridgeChain): Promise<void> {
  const current = await window.ethereum!.request({ method: 'eth_chainId' }) as string
  if (current.toLowerCase() === chain.hex.toLowerCase()) return

  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.hex }],
    })
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 4902) {
      await window.ethereum!.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chain.hex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        }],
      })
    } else {
      throw err
    }
  }
}

async function switchBackTo(chainId: string): Promise<void> {
  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    })
  } catch {
    // The user can switch back manually.
  }
}

async function waitForReceipt(txHash: string, maxMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const receipt = await window.ethereum!.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }) as { status?: string } | null
    if (receipt) {
      if (receipt.status && receipt.status !== '0x1') {
        throw new Error(`Transaction reverted: ${txHash}`)
      }
      return
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  throw new Error('Timed out waiting for transaction confirmation')
}

async function sendMM(params: { from: string; to: string; data: string }): Promise<string> {
  return window.ethereum!.request({
    method: 'eth_sendTransaction',
    params: [{ from: params.from, to: params.to, data: params.data }],
  }) as Promise<string>
}

async function readAllowance(owner: string, source: BridgeSourceChain): Promise<bigint> {
  const raw = await window.ethereum!.request({
    method: 'eth_call',
    params: [{
      to: source.usdc,
      data: encodeAllowance(owner, TOKEN_MESSENGER_V2),
    }, 'latest'],
  }) as string
  return /^0x[0-9a-fA-F]+$/.test(raw) ? BigInt(raw) : 0n
}

async function pollAttestation(
  source: BridgeSourceChain,
  burnTxHash: string,
): Promise<{ message: string; attestation: string }> {
  const started = Date.now()
  const timeoutMs = 30 * 60 * 1000
  const url = `${ATTESTATION_API}/v2/messages/${source.domain}?transactionHash=${burnTxHash}`

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(url).catch(() => null)
    if (res?.ok) {
      const data = await res.json() as {
        messages?: Array<{ status?: string; message?: string; attestation?: string }>
      }
      const msg = data.messages?.[0]
      if (msg?.status === 'complete' && msg.message && msg.attestation && msg.attestation !== 'PENDING') {
        return { message: msg.message, attestation: msg.attestation }
      }
    }
    await new Promise(r => setTimeout(r, 5000))
  }

  throw new Error('Circle attestation timed out after 30 minutes')
}

export async function fetchBridgeQuote(
  amount: string,
  recipientEvm: string,
  sourceChain: string | number = DEFAULT_SOURCE_CHAIN_ID,
): Promise<BridgeEstimation> {
  void recipientEvm
  const source = getBridgeSourceChain(sourceChain)
  const srcAmountBase = amountToBaseUnits(amount)
  return {
    srcAmount: amount,
    srcAmountBase: srcAmountBase.toString(),
    dstAmount: amountFromBaseUnits(srcAmountBase),
    dstAmountBase: srcAmountBase.toString(),
    protocolFee: '0',
    fixFeeWei: '0',
    route: `Circle CCTP V2 standard, ${source.shortName} to ${INJECTIVE_EVM.shortName}`,
    sourceChainId: source.id,
    sourceChain: source.shortName,
  }
}

export async function executeBridge(
  amount: string,
  senderEvm: string,
  recipientEvm: string,
  onProgress: (msg: string) => void,
  sourceChain: string | number = DEFAULT_SOURCE_CHAIN_ID,
): Promise<BridgeResult> {
  assertEvmAddress(senderEvm, 'senderEvm')
  assertEvmAddress(recipientEvm, 'recipientEvm')

  const source = getBridgeSourceChain(sourceChain)
  const srcAmountBase = amountToBaseUnits(amount)
  const estimation = await fetchBridgeQuote(amount, recipientEvm, source.id)
  const originalChainId = await window.ethereum!.request({ method: 'eth_chainId' }) as string
  let approveTxHash: string | null = null

  try {
    onProgress(`Switching MetaMask to ${source.shortName}...`)
    await switchToChain(source)

    onProgress(`Checking ${source.shortName} USDC allowance...`)
    const allowance = await readAllowance(senderEvm, source)
    if (allowance < srcAmountBase) {
      onProgress('Step 1 / 3 - Approve USDC (confirm in MetaMask)...')
      approveTxHash = await sendMM({
        from: senderEvm,
        to: source.usdc,
        data: encodeApprove(TOKEN_MESSENGER_V2, srcAmountBase),
      })
      onProgress(`Approval submitted (${approveTxHash.slice(0, 12)}...), waiting for confirmation...`)
      await waitForReceipt(approveTxHash)
    }

    onProgress('Step 2 / 3 - Burn USDC with Circle CCTP (confirm in MetaMask)...')
    const burnTxHash = await sendMM({
      from: senderEvm,
      to: TOKEN_MESSENGER_V2,
      data: encodeDepositForBurn(srcAmountBase, recipientEvm, source),
    })
    onProgress(`Burn submitted (${burnTxHash.slice(0, 12)}...), waiting for confirmation...`)
    await waitForReceipt(burnTxHash)

    onProgress('Waiting for Circle attestation...')
    const { message, attestation } = await pollAttestation(source, burnTxHash)

    onProgress(`Switching MetaMask to ${INJECTIVE_EVM.shortName} EVM...`)
    await switchToChain(INJECTIVE_EVM)

    onProgress('Step 3 / 3 - Mint native USDC on Injective (confirm in MetaMask)...')
    const mintTxHash = await sendMM({
      from: senderEvm,
      to: MESSAGE_TRANSMITTER_V2,
      data: encodeReceiveMessage(message, attestation),
    })
    onProgress(`Mint submitted (${mintTxHash.slice(0, 12)}...), waiting for confirmation...`)
    await waitForReceipt(mintTxHash, 180_000)

    return {
      approveTxHash,
      burnTxHash,
      mintTxHash,
      estimation,
    }
  } finally {
    await switchBackTo(originalChainId)
  }
}
