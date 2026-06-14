/**
 * Natural-language trade intent parser.
 *
 * Understands phrases like:
 *   "long 10 INJ with 5x"
 *   "2x short $10 of inj"
 *   "short ETH 50 dollars 3x"
 *   "close my INJ position"
 *   "what's my balance"
 *   "show positions"
 *   "price of BTC"
 *   "open a 100 USDC long on BTC at 10x leverage"
 *
 * Returns a structured ParseResult or null if nothing was understood.
 */

export type ParsedIntent =
  | { kind: 'trade'; side: 'long' | 'short'; symbol: string; amount: number; qty: number; leverage: number }
  | { kind: 'close'; symbol: string }
  | { kind: 'balances' }
  | { kind: 'positions' }
  | { kind: 'markets' }
  | { kind: 'price'; symbol: string }
  | { kind: 'bridge'; amount: number; source?: BridgeSourceSlug }
  | { kind: 'unknown' }

export type BridgeSourceSlug =
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'ethereum'
  | 'polygon'
  | 'avalanche'

export interface ParseResult {
  intent: ParsedIntent
  /** Human-readable summary for confirmation — undefined if more info needed */
  summary?: string
  /** Fields that are still missing */
  missing: string[]
}

export type PendingIntent = Partial<ParsedIntent> & { kind: ParsedIntent['kind'] }

export interface ClarificationResult {
  intent: PendingIntent | ParsedIntent
  missing: string[]
  ready: boolean
}

// Common token aliases
const TOKEN_ALIASES: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  injective: 'INJ',
  inj: 'INJ',
  solana: 'SOL',
  sol: 'SOL',
  atom: 'ATOM',
  cosmos: 'ATOM',
  bnb: 'BNB',
  bonk: 'BONK',
  tia: 'TIA',
  sei: 'SEI',
  pyth: 'PYTH',
}

function normalizeToken(raw: string): string {
  return TOKEN_ALIASES[raw.toLowerCase()] ?? raw.toUpperCase()
}

const SIDE_PATTERNS = {
  long: /\b(long|buy|bull|bullish|calls?|pump)\b/i,
  short: /\b(short|sell|bear|bearish|puts?|dump)\b/i,
}

// Matches: "5x", "5X", "5×", "x5", "leverage 5", "lev 5", "w 5x", "with 5x"
const LEVERAGE_PATTERN = /(?:^|\s)(?:w(?:ith)?\s+)?(\d+(?:\.\d+)?)\s*[xX×]|\b[xX×]\s*(\d+(?:\.\d+)?)|\blev(?:erage)?\s+(\d+(?:\.\d+)?)/i

const AMOUNT_PATTERN =
  /\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usdc|usdt?|usd|dollars?|\$)|(\d+(?:\.\d+)?)\s+(?:of\s+)?(?:usdc|usdt?|usd|dollars?)/i

// Known aliases are only shortcuts. Final market validation happens against
// the live derivative markets endpoint in resolveMarket().
const KNOWN_TOKEN_PATTERN_SOURCE =
  'btc|bitcoin|eth|ethereum|inj|injective|sol|solana|atom|cosmos|bnb|bonk|tia|sei|pyth|link|avax|op|arb|doge|pepe|wif|sui|apt|near'

const TOKEN_IN_TEXT_PATTERN = new RegExp(`\\b(${KNOWN_TOKEN_PATTERN_SOURCE})\\b`, 'i')
const TOKEN_ONLY_PATTERN = new RegExp(`^(${KNOWN_TOKEN_PATTERN_SOURCE})$`, 'i')
const SYMBOL_IN_TEXT_PATTERN = /\b(?:[a-z][a-z0-9]{1,15}|\d{2,}[a-z][a-z0-9]{0,12})\b/gi

const RESERVED_SYMBOL_WORDS = new Set([
  'a',
  'all',
  'an',
  'at',
  'balance',
  'balances',
  'bear',
  'bearish',
  'bridge',
  'bull',
  'bullish',
  'buy',
  'calls',
  'close',
  'current',
  'deposit',
  'dollars',
  'dump',
  'exit',
  'flatten',
  'for',
  'from',
  'fund',
  'funds',
  'get',
  'how',
  'leverage',
  'lev',
  'list',
  'long',
  'market',
  'markets',
  'my',
  'of',
  'on',
  'open',
  'position',
  'positions',
  'price',
  'pump',
  'puts',
  'quote',
  'sell',
  'short',
  'show',
  'the',
  'token',
  'trades',
  'usdc',
  'usd',
  'usdt',
  'via',
  'wallet',
  'what',
  'which',
  'with',
])

function isSymbolCandidate(raw: string): boolean {
  const lower = raw.toLowerCase()
  if (TOKEN_ALIASES[lower]) return true
  if (RESERVED_SYMBOL_WORDS.has(lower)) return false
  return /^[a-z][a-z0-9]{1,15}$/i.test(raw) || /^\d{2,}[a-z][a-z0-9]{0,12}$/i.test(raw)
}

function extractTokenMatch(text: string): { raw: string; symbol: string } | null {
  const knownMatch = TOKEN_IN_TEXT_PATTERN.exec(text)
  if (knownMatch) {
    return { raw: knownMatch[1], symbol: normalizeToken(knownMatch[1]) }
  }

  for (const match of text.matchAll(SYMBOL_IN_TEXT_PATTERN)) {
    const raw = match[0]
    if (isSymbolCandidate(raw)) return { raw, symbol: normalizeToken(raw) }
  }

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const BRIDGE_PATTERN = /\b(bridge|deposit|fund)\b/i

const BRIDGE_SOURCE_LABELS: Record<BridgeSourceSlug, string> = {
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
}

const BRIDGE_SOURCE_ALIASES: Record<string, BridgeSourceSlug> = {
  arbitrum: 'arbitrum',
  arb: 'arbitrum',
  'arbitrum-one': 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  op: 'optimism',
  'op-mainnet': 'optimism',
  ethereum: 'ethereum',
  eth: 'ethereum',
  mainnet: 'ethereum',
  polygon: 'polygon',
  matic: 'polygon',
  poly: 'polygon',
  avalanche: 'avalanche',
  avax: 'avalanche',
  'avalanche-c-chain': 'avalanche',
}

function parseBridgeSource(text: string): BridgeSourceSlug | undefined {
  const match = /\b(?:from|on|via)\s+([a-z][a-z0-9_-]*)\b/i.exec(text)
  if (!match) return undefined
  const normalized = match[1].toLowerCase().replace(/[\s_]+/g, '-')
  return BRIDGE_SOURCE_ALIASES[normalized]
}

const CLOSE_PATTERN = /\b(close|exit|flatten|get out of|dump my|sell all)\b/i

const BALANCE_PATTERN = /\b(balance|balances|wallet|funds?|holdings?|how much|what.?s in)\b/i

const POSITION_PATTERN = /\b(position|positions|open trades?|my trades?|p&l|pnl|show positions?|portfolio)\b/i

const MARKETS_PATTERN = /\b(list markets?|show markets?|available markets?|what markets?|markets)\b/i

const PRICE_PATTERN = /\b(price|what.?s|how much is|quote|current price)\b/i

function parsePositiveAmount(text: string): number {
  const match = /^\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:usdc|usdt|usd|dollars?)?\s*$/i.exec(text)
  const amount = match ? parseFloat(match[1]) : 0
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function parseBareToken(text: string): string {
  const trimmed = text.trim()
  const tokenMatch = TOKEN_ONLY_PATTERN.exec(trimmed)
  if (tokenMatch) return normalizeToken(tokenMatch[1])
  return isSymbolCandidate(trimmed) ? normalizeToken(trimmed) : ''
}

function missingForIntent(intent: PendingIntent | ParsedIntent): string[] {
  switch (intent.kind) {
    case 'trade': {
      const trade = intent as Partial<Extract<ParsedIntent, { kind: 'trade' }>>
      const missing: string[] = []
      if (!trade.symbol) missing.push('which token?')
      if (!trade.amount && !trade.qty) missing.push('how much? (e.g. $50 or 10 INJ)')
      if (!trade.leverage) missing.push('what leverage? (e.g. 5x)')
      return missing
    }
    case 'close': {
      const close = intent as Partial<Extract<ParsedIntent, { kind: 'close' }>>
      return close.symbol ? [] : ['which market to close?']
    }
    case 'price': {
      const price = intent as Partial<Extract<ParsedIntent, { kind: 'price' }>>
      return price.symbol ? [] : ['which token?']
    }
    case 'bridge': {
      const bridge = intent as Partial<Extract<ParsedIntent, { kind: 'bridge' }>>
      return bridge.amount ? [] : ['how much to bridge? (e.g. $10 or 50 USDC)']
    }
    case 'unknown':
      return []
    default:
      return []
  }
}

export function applyClarification(pending: PendingIntent, text: string): ClarificationResult {
  const fresh = parse(text)
  const base = { ...pending } as Record<string, unknown>

  if (fresh.intent.kind === 'trade' && base.kind === 'trade') {
    const fi = fresh.intent
    if (fi.symbol) base.symbol = fi.symbol
    if (fi.amount) base.amount = fi.amount
    if (fi.qty) base.qty = fi.qty
    if (fi.leverage) base.leverage = fi.leverage
  } else if (fresh.intent.kind === 'close' && base.kind === 'close') {
    if (fresh.intent.symbol) base.symbol = fresh.intent.symbol
  } else if (fresh.intent.kind === 'price' && base.kind === 'price') {
    if (fresh.intent.symbol) base.symbol = fresh.intent.symbol
  } else if (fresh.intent.kind === 'bridge' && base.kind === 'bridge') {
    if (fresh.intent.amount) base.amount = fresh.intent.amount
    if (fresh.intent.source) base.source = fresh.intent.source
  } else if (fresh.intent.kind !== 'unknown') {
    return {
      intent: fresh.intent,
      missing: fresh.missing,
      ready: fresh.missing.length === 0,
    }
  } else if (base.kind === 'trade') {
    const t = text.trim()
    const levOnly = /^(\d+(?:\.\d+)?)\s*[xX×]$/.exec(t)
    const numOnly = /^(\d+(?:\.\d+)?)$/.exec(t)
    const symbol = parseBareToken(t)

    if (levOnly) base.leverage = parseFloat(levOnly[1])
    else if (numOnly) base.amount = parseFloat(numOnly[1])
    if (symbol) base.symbol = symbol
  } else if (base.kind === 'close' || base.kind === 'price') {
    const symbol = parseBareToken(text)
    if (symbol) base.symbol = symbol
  } else if (base.kind === 'bridge') {
    const amount = parsePositiveAmount(text)
    if (amount > 0) base.amount = amount
  }

  const intent = base as PendingIntent
  const missing = missingForIntent(intent)
  return { intent, missing, ready: missing.length === 0 }
}

export function parse(input: string): ParseResult {
  const text = input.trim()

  // ─── Balance / Positions / Price shortcuts ───────────────────────────────

  if (BALANCE_PATTERN.test(text) && !BRIDGE_PATTERN.test(text) && !SIDE_PATTERNS.long.test(text) && !SIDE_PATTERNS.short.test(text)) {
    return { intent: { kind: 'balances' }, missing: [], summary: 'Show your wallet balances' }
  }

  if (POSITION_PATTERN.test(text) && !SIDE_PATTERNS.long.test(text) && !SIDE_PATTERNS.short.test(text)) {
    return { intent: { kind: 'positions' }, missing: [], summary: 'Show your open positions' }
  }

  if (MARKETS_PATTERN.test(text)) {
    return { intent: { kind: 'markets' }, missing: [], summary: 'List available markets' }
  }

  if (PRICE_PATTERN.test(text) && !SIDE_PATTERNS.long.test(text) && !SIDE_PATTERNS.short.test(text)) {
    const tokenMatch = extractTokenMatch(text)
    if (tokenMatch) {
      return { intent: { kind: 'price', symbol: tokenMatch.symbol }, missing: [], summary: `Get ${tokenMatch.symbol} price` }
    }
    return { intent: { kind: 'price', symbol: '' }, missing: ['which token?'] }
  }

  // ─── Bridge ─────────────────────────────────────────────────────────────

  if (BRIDGE_PATTERN.test(text)) {
    const amountMatch = AMOUNT_PATTERN.exec(text)
    const amountStr = amountMatch?.[1] ?? amountMatch?.[2] ?? amountMatch?.[3] ?? ''
    const amount = amountStr ? parseFloat(amountStr) : 0
    const source = parseBridgeSource(text) ?? 'arbitrum'
    const sourceLabel = BRIDGE_SOURCE_LABELS[source]
    const missing = amount > 0 ? [] : ['how much to bridge? (e.g. $10 or 50 USDC)']
    return {
      intent: { kind: 'bridge', amount, source },
      missing,
      summary: amount > 0 ? `Bridge $${amount} USDC from ${sourceLabel} to Injective native USDC` : undefined,
    }
  }

  // ─── Close ──────────────────────────────────────────────────────────────

  if (CLOSE_PATTERN.test(text)) {
    const tokenMatch = extractTokenMatch(text)
    if (tokenMatch) {
      return {
        intent: { kind: 'close', symbol: tokenMatch.symbol },
        missing: [],
        summary: `Close your ${tokenMatch.symbol} position`,
      }
    }
    return { intent: { kind: 'close', symbol: '' }, missing: ['which market to close?'] }
  }

  // ─── Trade (long / short) ─────────────────────────────────────────────────

  const isLong = SIDE_PATTERNS.long.test(text)
  const isShort = SIDE_PATTERNS.short.test(text)

  if (!isLong && !isShort) {
    return { intent: { kind: 'unknown' }, missing: [] }
  }

  const side: 'long' | 'short' = isLong ? 'long' : 'short'

  // Extract token
  const tokenMatch = extractTokenMatch(text)
  const symbol = tokenMatch?.symbol ?? ''

  // Extract USDC notional, or a generic dollar amount.
  const amountMatch = AMOUNT_PATTERN.exec(text)
  const amountStr = amountMatch?.[1] ?? amountMatch?.[2] ?? amountMatch?.[3] ?? ''
  const usdcAmount = amountStr ? parseFloat(amountStr) : 0

  // Extract token quantity — bare number adjacent to token name
  // e.g. "long 1 INJ" → qty=1, "1 inj long" → qty=1
  let tokenQty = 0
  if (!usdcAmount && tokenMatch) {
    const tokenPattern = escapeRegExp(tokenMatch.raw)
    const qtyBeforeToken = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s+${tokenPattern}\\b`, 'i')
    const qtyAfterSide = /\b(?:long|short|buy|sell)\s+(\d+(?:\.\d+)?)\b/i
    const qbtMatch = qtyBeforeToken.exec(text)
    const qasMatch = qtyAfterSide.exec(text)
    // Prefer the match that is adjacent to the token name
    if (qbtMatch) tokenQty = parseFloat(qbtMatch[1])
    else if (qasMatch) tokenQty = parseFloat(qasMatch[1])
  }

  // Extract leverage — pattern has 3 capture groups
  const levMatch = LEVERAGE_PATTERN.exec(text)
  const leverage = levMatch ? parseFloat(levMatch[1] ?? levMatch[2] ?? levMatch[3]) : 0

  const missing: string[] = []
  if (!symbol) missing.push('which token? (e.g. INJ, BTC, ETH)')
  if (!usdcAmount && !tokenQty) missing.push('how much? (e.g. $50 or 10 INJ)')
  if (!leverage) missing.push('what leverage? (e.g. 5x)')

  const sizeDesc = usdcAmount ? `$${usdcAmount}` : `${tokenQty} ${symbol}`
  if (missing.length > 0) {
    return {
      intent: { kind: 'trade', side, symbol, amount: usdcAmount, qty: tokenQty, leverage },
      missing,
    }
  }

  return {
    intent: { kind: 'trade', side, symbol, amount: usdcAmount, qty: tokenQty, leverage },
    missing: [],
    summary: `Open a ${side} position on ${symbol}, ${sizeDesc} at ${leverage}x leverage`,
  }
}

export function formatMissing(missing: string[]): string {
  if (missing.length === 1) return `Just need one more thing: ${missing[0]}`
  return `A few things are unclear:\n${missing.map(m => `• ${m}`).join('\n')}`
}
