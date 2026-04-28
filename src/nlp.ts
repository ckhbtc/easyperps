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
 *   "open a 100 USDT long on BTC at 10x leverage"
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
  | { kind: 'bridge'; amount: number }
  | { kind: 'unknown' }

export interface ParseResult {
  intent: ParsedIntent
  /** Human-readable summary for confirmation — undefined if more info needed */
  summary?: string
  /** Fields that are still missing */
  missing: string[]
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
  /\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usdt?|usd|dollars?|\$)|(\d+(?:\.\d+)?)\s+(?:of\s+)?(?:usdt?|usd|dollars?)/i

// All token symbols — broad list including short aliases
const TOKEN_IN_TEXT_PATTERN =
  /\b(btc|bitcoin|eth|ethereum|inj|injective|sol|solana|atom|cosmos|bnb|bonk|tia|sei|pyth|link|avax|op|arb|doge|pepe|wif|sui|apt|near)\b/i

const BRIDGE_PATTERN = /\b(bridge|deposit|fund)\b/i

const CLOSE_PATTERN = /\b(close|exit|flatten|get out of|dump my|sell all)\b/i

const BALANCE_PATTERN = /\b(balance|balances|wallet|funds?|holdings?|how much|what.?s in)\b/i

const POSITION_PATTERN = /\b(position|positions|open trades?|my trades?|p&l|pnl|show positions?|portfolio)\b/i

const MARKETS_PATTERN = /\b(list markets?|show markets?|available markets?|what markets?|markets)\b/i

const PRICE_PATTERN = /\b(price|what.?s|how much is|quote|current price)\b/i

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
    const tokenMatch = TOKEN_IN_TEXT_PATTERN.exec(text)
    if (tokenMatch) {
      const symbol = normalizeToken(tokenMatch[1])
      return { intent: { kind: 'price', symbol }, missing: [], summary: `Get ${symbol} price` }
    }
    return { intent: { kind: 'price', symbol: '' }, missing: ['which token?'] }
  }

  // ─── Bridge ─────────────────────────────────────────────────────────────

  if (BRIDGE_PATTERN.test(text)) {
    const amountMatch = AMOUNT_PATTERN.exec(text)
    const amountStr = amountMatch?.[1] ?? amountMatch?.[2] ?? amountMatch?.[3] ?? ''
    const amount = amountStr ? parseFloat(amountStr) : 0
    const missing = amount > 0 ? [] : ['how much to bridge? (e.g. $10 or 50 USDC)']
    return {
      intent: { kind: 'bridge', amount },
      missing,
      summary: amount > 0 ? `Bridge $${amount} USDC from Arbitrum → Injective USDT` : undefined,
    }
  }

  // ─── Close ──────────────────────────────────────────────────────────────

  if (CLOSE_PATTERN.test(text)) {
    const tokenMatch = TOKEN_IN_TEXT_PATTERN.exec(text)
    if (tokenMatch) {
      const symbol = normalizeToken(tokenMatch[1])
      return {
        intent: { kind: 'close', symbol },
        missing: [],
        summary: `Close your ${symbol} position`,
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
  const tokenMatch = TOKEN_IN_TEXT_PATTERN.exec(text)
  const symbol = tokenMatch ? normalizeToken(tokenMatch[1]) : ''

  // Extract USDT notional — explicit dollar amount
  const amountMatch = AMOUNT_PATTERN.exec(text)
  const amountStr = amountMatch?.[1] ?? amountMatch?.[2] ?? amountMatch?.[3] ?? ''
  const usdtAmount = amountStr ? parseFloat(amountStr) : 0

  // Extract token quantity — bare number adjacent to token name
  // e.g. "long 1 INJ" → qty=1, "1 inj long" → qty=1
  let tokenQty = 0
  if (!usdtAmount) {
    const qtyBeforeToken = /\b(\d+(?:\.\d+)?)\s+(?:btc|bitcoin|eth|ethereum|inj|injective|sol|solana|atom|cosmos|bnb|bonk|tia|sei|pyth|link|avax|op|arb|doge|pepe|wif|sui|apt|near)\b/i
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
  if (!usdtAmount && !tokenQty) missing.push('how much? (e.g. $50 or 10 INJ)')
  if (!leverage) missing.push('what leverage? (e.g. 5x)')

  const sizeDesc = usdtAmount ? `$${usdtAmount}` : `${tokenQty} ${symbol}`
  if (missing.length > 0) {
    return {
      intent: { kind: 'trade', side, symbol, amount: usdtAmount, qty: tokenQty, leverage },
      missing,
    }
  }

  return {
    intent: { kind: 'trade', side, symbol, amount: usdtAmount, qty: tokenQty, leverage },
    missing: [],
    summary: `Open a ${side} position on ${symbol} — ${sizeDesc} at ${leverage}x leverage`,
  }
}

export function formatMissing(missing: string[]): string {
  if (missing.length === 1) return `Just need one more thing: ${missing[0]}`
  return `A few things are unclear:\n${missing.map(m => `• ${m}`).join('\n')}`
}
