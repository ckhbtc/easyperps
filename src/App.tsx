import { useState, useRef, useEffect, useCallback } from 'react'
import { connectMetaMask, isMetaMaskAvailable, onAccountsChanged } from './wallet'
import type { WalletInfo } from './wallet'
import { parse, formatMissing } from './nlp'
import type { ParsedIntent } from './nlp'
import { getMarketPrice, getBalances, getPositions, resolveMarket, listMarkets } from './injective'
import type { PositionInfo, BalanceInfo, PerpMarket } from './injective'
import { openTrade, closeTrade } from './tx'
import { enableAutoSign, disableAutoSign } from './autosign'
import { fetchBridgeQuote, executeBridge } from './bridge'
import type { BridgeEstimation } from './bridge'
import './App.css'

// ─── Theme ───────────────────────────────────────────────────────────────────

type Theme = 'cyber' | 'retro' | 'nexus' | 'rave'

const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: 'cyber', label: 'Cyber', color: '#00d4ff' },
  { id: 'retro', label: 'Retro', color: '#ffdd00' },
  { id: 'nexus', label: 'Nexus', color: '#4fc3f7' },
  { id: 'rave',  label: 'Rave',  color: '#ff006e' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'agent' | 'system'

interface Message {
  id: string
  role: MessageRole
  content: string
  ts: number
  card?: CardData
}

type CardData =
  | { type: 'balances'; data: BalanceInfo[] }
  | { type: 'positions'; data: PositionInfo[] }
  | { type: 'markets'; data: PerpMarket[] }
  | { type: 'price'; symbol: string; price: string }
  | { type: 'confirm'; summary: string; onConfirm: () => void; onCancel: () => void }
  | { type: 'tx'; txHash: string; label: string }

interface PendingTrade {
  side: 'long' | 'short'
  symbol: string
  amount: number
  leverage: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) }

function agentMsg(content: string, card?: CardData): Message {
  return { id: uid(), role: 'agent', content, ts: Date.now(), card }
}
function userMsg(content: string): Message {
  return { id: uid(), role: 'user', content, ts: Date.now() }
}
function systemMsg(content: string): Message {
  return { id: uid(), role: 'system', content, ts: Date.now() }
}

function parsePositiveAmount(text: string): number {
  const match = /^\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:usdc|usdt|usd|dollars?)?\s*$/i.exec(text)
  const amount = match ? parseFloat(match[1]) : 0
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

const WELCOME = agentMsg(
  'Welcome to EasyPerps.\n\nConnect MetaMask to get started, then tell me what you want to do.\n\nExamples:\n• "long $50 INJ at 5x"\n• "2x short $10 of ETH"\n• "close my BTC position"\n• "show balances"\n• "price of INJ"\n• "bridge $10 from Arbitrum to Injective"'
)

// ─── Cards ───────────────────────────────────────────────────────────────────

function BalancesCard({ data }: { data: BalanceInfo[] }) {
  if (data.length === 0) return <p className="card-empty">No balances found.</p>
  return (
    <table className="data-table">
      <thead><tr><th>Asset</th><th>Amount</th></tr></thead>
      <tbody>
        {data.map((b, i) => <tr key={i}><td>{b.symbol}</td><td>{b.amount}</td></tr>)}
      </tbody>
    </table>
  )
}

function PositionsCard({ data }: { data: PositionInfo[] }) {
  if (data.length === 0) return <p className="card-empty">No open positions.</p>
  return (
    <table className="data-table">
      <thead>
        <tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>PnL</th></tr>
      </thead>
      <tbody>
        {data.map((p, i) => {
          const pnl = parseFloat(p.pnl)
          return (
            <tr key={i}>
              <td>{p.symbol}</td>
              <td className={p.side === 'long' ? 'side-long' : 'side-short'}>{p.side.toUpperCase()}</td>
              <td>{p.quantity}</td>
              <td>${p.entryPrice}</td>
              <td>${p.markPrice}</td>
              <td className={pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}>{pnl >= 0 ? '+' : ''}{p.pnl} ({p.pnlPct}%)</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MarketsCard({ data }: { data: PerpMarket[] }) {
  if (data.length === 0) return <p className="card-empty">No markets found.</p>
  return (
    <table className="data-table">
      <thead><tr><th>Symbol</th><th>Init Margin</th><th>Taker Fee</th></tr></thead>
      <tbody>
        {data.map((m, i) => (
          <tr key={i}>
            <td>{m.symbol}</td>
            <td>{(parseFloat(m.initialMarginRatio) * 100).toFixed(1)}%</td>
            <td>{(parseFloat(m.takerFeeRate) * 100).toFixed(3)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ConfirmCard({ summary, onConfirm, onCancel }: {
  summary: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="confirm-card">
      <pre className="confirm-summary">{summary}</pre>
      <div className="confirm-actions">
        <button className="btn btn-confirm" onClick={onConfirm}>✓ Confirm</button>
        <button className="btn btn-cancel" onClick={onCancel}>✕ Cancel</button>
      </div>
    </div>
  )
}

function TxCard({ txHash, label }: { txHash: string; label: string }) {
  const url = `https://explorer.injective.network/transaction/${txHash}`
  return (
    <div className="tx-card">
      <span className="tx-label">✓ {label}</span>
      <a href={url} target="_blank" rel="noreferrer" className="tx-hash">
        {txHash.slice(0, 10)}…{txHash.slice(-6)}
      </a>
    </div>
  )
}

function RenderCard({ card }: { card: CardData }) {
  switch (card.type) {
    case 'balances':  return <BalancesCard data={card.data} />
    case 'positions': return <PositionsCard data={card.data} />
    case 'markets':   return <MarketsCard data={card.data} />
    case 'price':     return (
      <div className="price-card">
        <span className="price-symbol">{card.symbol}</span>
        <span className="price-value">${card.price}</span>
      </div>
    )
    case 'confirm': return <ConfirmCard {...card} />
    case 'tx':      return <TxCard txHash={card.txHash} label={card.label} />
  }
}

// ─── Theme Picker ─────────────────────────────────────────────────────────────

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = THEMES.find(t => t.id === theme)!

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="theme-picker" ref={ref}>
      <button className="theme-btn" onClick={() => setOpen(o => !o)}>
        <span className="theme-swatch" style={{ background: current.color }} />
        {current.label}
      </button>
      {open && (
        <div className="theme-dropdown">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-option${theme === t.id ? ' active' : ''}`}
              onClick={() => { onChange(t.id); setOpen(false) }}
            >
              <span className="theme-swatch" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bridge Modal ─────────────────────────────────────────────────────────────

interface BridgeModalProps {
  senderEvm:     string
  recipientEvm:  string
  initialAmount?: string
  onClose:       () => void
  onStatus:      (msg: string) => void
}

function BridgeModal({ senderEvm, recipientEvm, initialAmount = '10', onClose, onStatus }: BridgeModalProps) {
  const [amount, setAmount]       = useState(initialAmount)
  const [quote, setQuote]         = useState<BridgeEstimation | null>(null)
  const [quoting, setQuoting]     = useState(false)
  const [bridging, setBridging]   = useState(false)
  const [step, setStep]           = useState<string>('')
  const [error, setError]         = useState<string>('')

  useEffect(() => {
    setAmount(initialAmount)
    setQuote(null)
    setStep('')
    setError('')
  }, [initialAmount])

  async function handleQuote() {
    if (!amount || parseFloat(amount) <= 0) return
    setQuoting(true); setError(''); setQuote(null)
    try {
      const q = await fetchBridgeQuote(amount, recipientEvm)
      setQuote(q)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setQuoting(false)
    }
  }

  async function handleBridge() {
    if (!amount || parseFloat(amount) <= 0) return
    setBridging(true); setError(''); setStep('')
    try {
      const result = await executeBridge(amount, senderEvm, recipientEvm, msg => {
        setStep(msg)
        onStatus(msg)
      })
      onStatus(`🌉 Bridge submitted! USDT arriving on Injective shortly.
Approve tx: ${result.approveTxHash}
Bridge tx:  ${result.bridgeTxHash}
Order ID:   ${result.orderId}`)
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      onStatus(`Bridge failed: ${msg}`)
    } finally {
      setBridging(false)
    }
  }

  const fixFeeEth = quote ? (Number(quote.fixFeeWei) / 1e18).toFixed(4) : '~0.001'

  return (
    <div className="bridge-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bridge-modal">
        <div className="bridge-header">
          <span className="bridge-title">🌉 Bridge Funds</span>
          <button className="bridge-close" onClick={onClose}>✕</button>
        </div>

        <div className="bridge-row">
          <label className="bridge-label">From</label>
          <div className="bridge-chain-row">
            <span className="bridge-chain">Arbitrum</span>
            <span className="bridge-token">USDC</span>
          </div>
        </div>

        <div className="bridge-row">
          <label className="bridge-label">Amount</label>
          <div className="bridge-amount-row">
            <input
              className="bridge-input"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuote(null) }}
              placeholder="0.00"
            />
            <span className="bridge-unit">USDC</span>
          </div>
        </div>

        <div className="bridge-arrow">↓</div>

        <div className="bridge-row">
          <label className="bridge-label">To</label>
          <div className="bridge-chain-row">
            <span className="bridge-chain">Injective</span>
            <span className="bridge-token">USDT</span>
          </div>
        </div>

        {quote && (
          <div className="bridge-quote">
            <div className="bridge-quote-row">
              <span>You receive</span>
              <span className="bridge-quote-val">{quote.dstAmount} USDT</span>
            </div>
            <div className="bridge-quote-row">
              <span>Protocol fee</span>
              <span>{(Number(quote.protocolFee) / 1e6).toFixed(4)} USDC</span>
            </div>
            <div className="bridge-quote-row">
              <span>ETH fix fee</span>
              <span>{fixFeeEth} ETH</span>
            </div>
          </div>
        )}

        {step && !error && (
          <p className="bridge-step">{step}</p>
        )}

        {error && (
          <p className="bridge-error">{error}</p>
        )}

        <div className="bridge-actions">
          <button
            className="btn-bridge-quote"
            onClick={handleQuote}
            disabled={quoting || bridging || !amount}
          >
            {quoting ? 'Quoting…' : 'Get Quote'}
          </button>
          <button
            className="btn-bridge-send"
            onClick={handleBridge}
            disabled={bridging || !amount}
          >
            {bridging ? '…' : 'Bridge →'}
          </button>
        </div>

        <p className="bridge-note">
          Needs ETH on Arbitrum for gas + fix fee ({fixFeeEth} ETH).
          ETA: ~2 min.
        </p>
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('ep-theme') as Theme) || 'cyber'
  )
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [autoSign, setAutoSign] = useState(false)
  const [autoSignBusy, setAutoSignBusy] = useState(false)
  const [yolo, setYolo] = useState(false)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [bridgeInitialAmount, setBridgeInitialAmount] = useState('10')
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingClarification, setPendingClarification] = useState<Partial<ParsedIntent> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ep-theme', theme)
  }, [theme])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return onAccountsChanged((injAddr) => {
      if (!injAddr) {
        setWallet(null)
        setMessages(prev => [...prev, systemMsg('Wallet disconnected.')])
      } else {
        setWallet(w => w ? { ...w, injAddress: injAddr } : null)
      }
    })
  }, [])

  const pushAgent = useCallback((content: string, card?: CardData) => {
    setMessages(prev => [...prev, agentMsg(content, card)])
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────

  function handleDisconnect() {
    disableAutoSign()
    setAutoSign(false)
    setYolo(false)
    setWallet(null)
    setMessages(prev => [...prev, systemMsg('Wallet disconnected.')])
  }

  function handleClearHistory() {
    setMessages([WELCOME])
    setPendingClarification(null)
  }

  function openBridge(amount?: number) {
    setBridgeInitialAmount(amount && amount > 0 ? String(amount) : '10')
    setBridgeOpen(true)
  }

  async function handleAutoSign() {
    if (!wallet) return
    if (autoSign) {
      disableAutoSign()
      setAutoSign(false)
      setYolo(false)
      setMessages(prev => [...prev, systemMsg('AutoSign disabled.')])
      return
    }
    setAutoSignBusy(true)
    try {
      await enableAutoSign(
        wallet.injAddress,
        wallet.ethAddress,
        msg => setMessages(prev => [...prev, systemMsg(msg)]),
      )
      setAutoSign(true)
    } catch (e) {
      setMessages(prev => [...prev, agentMsg(`AutoSign setup failed: ${(e as Error).message}`)])
    } finally {
      setAutoSignBusy(false)
    }
  }

  async function handleConnect() {
    if (!isMetaMaskAvailable()) {
      setMessages(prev => [...prev, agentMsg('MetaMask not detected. Install it at metamask.io and reload.')])
      return
    }
    setConnecting(true)
    try {
      const info = await connectMetaMask()
      setWallet(info)
      setMessages(prev => [
        ...prev,
        systemMsg(`Connected: ${info.injAddress.slice(0, 14)}…`),
        agentMsg(`Connected! Your Injective address:\n\`${info.injAddress}\`\n\nWhat would you like to trade?`),
      ])
    } catch (e) {
      setMessages(prev => [...prev, agentMsg(`Connection failed: ${(e as Error).message}`)])
    } finally {
      setConnecting(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, userMsg(text)])
    setLoading(true)
    try {
      await processMessage(text)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // ─── NLP routing ─────────────────────────────────────────────────────────

  async function processMessage(text: string) {
    if (pendingClarification) {
      await handleClarification(text)
      return
    }
    const result = parse(text)
    if (result.intent.kind === 'unknown') {
      pushAgent("I didn't quite understand that. Try:\n• \"long $100 INJ at 5x\"\n• \"short BTC $50 3x\"\n• \"close my ETH position\"\n• \"show balances\"\n• \"price of BTC\"\n• \"bridge $10 from Arbitrum\"")
      return
    }
    if (result.missing.length > 0) {
      setPendingClarification(result.intent)
      pushAgent(formatMissing(result.missing))
      return
    }
    await executeIntent(result.intent)
  }

  async function handleClarification(text: string) {
    const fresh = parse(text)
    const base = { ...pendingClarification } as Record<string, unknown>

    if (fresh.intent.kind === 'trade' && base.kind === 'trade') {
      const fi = fresh.intent as { symbol?: string; amount?: number; qty?: number; leverage?: number }
      if (fi.symbol)   base.symbol   = fi.symbol
      if (fi.amount)   base.amount   = fi.amount
      if (fi.qty)      base.qty      = fi.qty
      if (fi.leverage) base.leverage = fi.leverage
    } else if (fresh.intent.kind !== 'unknown') {
      setPendingClarification(null)
      await executeIntent(fresh.intent)
      return
    } else if (base.kind === 'trade') {
      // Unknown parse — try to extract a single bare clarification value:
      //   "5x" or "10x"  → leverage
      //   "5" or "100"   → USDT amount
      //   "INJ" / "BTC"  → symbol
      const t = text.trim()
      const levOnly = /^(\d+(?:\.\d+)?)\s*[xX×]$/.exec(t)
      const numOnly = /^(\d+(?:\.\d+)?)$/.exec(t)
      const tokOnly = /^(btc|bitcoin|eth|ethereum|inj|injective|sol|solana|atom|cosmos|bnb|bonk|tia|sei|pyth|link|avax|op|arb|doge|pepe|wif|sui|apt|near)$/i.exec(t)
      const tokenAliases: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', injective: 'INJ', solana: 'SOL', cosmos: 'ATOM' }
      if      (levOnly) base.leverage = parseFloat(levOnly[1])
      else if (numOnly) base.amount   = parseFloat(numOnly[1])
      if (tokOnly) base.symbol = tokenAliases[tokOnly[1].toLowerCase()] ?? tokOnly[1].toUpperCase()
    } else if (base.kind === 'bridge') {
      const amount = parsePositiveAmount(text)
      if (amount > 0) base.amount = amount
    }

    const stillMissing: string[] = []
    if (base.kind === 'trade') {
      if (!base.symbol)               stillMissing.push('which token?')
      if (!base.amount && !base.qty)  stillMissing.push('how much? (e.g. $50 or 10 INJ)')
      if (!base.leverage)             stillMissing.push('what leverage? (e.g. 5x)')
    } else if (base.kind === 'close') {
      if (!base.symbol) stillMissing.push('which market to close?')
    } else if (base.kind === 'bridge') {
      if (!base.amount) stillMissing.push('how much to bridge? (e.g. $10 or 50 USDC)')
    }

    if (stillMissing.length > 0) {
      setPendingClarification(base as Partial<ParsedIntent>)
      pushAgent(formatMissing(stillMissing))
    } else {
      setPendingClarification(null)
      await executeIntent(base as ParsedIntent)
    }
  }

  async function executeIntent(intent: ParsedIntent) {
    if (!wallet) { pushAgent('Please connect MetaMask first.'); return }

    switch (intent.kind) {
      case 'balances': {
        pushAgent('Fetching balances…')
        try {
          const data = await getBalances(wallet.injAddress)
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content === 'Fetching balances…')
              copy[copy.length - 1] = agentMsg('Your balances:', { type: 'balances', data })
            return copy
          })
        } catch (e) { pushAgent(`Error fetching balances: ${(e as Error).message}`) }
        break
      }
      case 'positions': {
        pushAgent('Fetching positions…')
        try {
          const data = await getPositions(wallet.injAddress)
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content === 'Fetching positions…')
              copy[copy.length - 1] = agentMsg('Your open positions:', { type: 'positions', data })
            return copy
          })
        } catch (e) { pushAgent(`Error fetching positions: ${(e as Error).message}`) }
        break
      }
      case 'price': {
        if (!intent.symbol) { pushAgent('Which token would you like a price for?'); return }
        pushAgent(`Getting ${intent.symbol} price…`)
        try {
          const price = await getMarketPrice(intent.symbol)
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content.startsWith('Getting'))
              copy[copy.length - 1] = agentMsg('', { type: 'price', symbol: intent.symbol, price })
            return copy
          })
        } catch (e) { pushAgent(`Couldn't get price: ${(e as Error).message}`) }
        break
      }
      case 'markets': {
        pushAgent('Loading markets…')
        try {
          const data = await listMarkets()
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content === 'Loading markets…')
              copy[copy.length - 1] = agentMsg(`${data.length} perpetual markets available:`, { type: 'markets', data })
            return copy
          })
        } catch (e) { pushAgent(`Error loading markets: ${(e as Error).message}`) }
        break
      }
      case 'trade': await handleTradeIntent(intent); break
      case 'close': await handleCloseIntent(intent); break
      case 'bridge': {
        openBridge(intent.amount)
        break
      }
    }
  }

  // ─── Trade open ───────────────────────────────────────────────────────────

  async function handleTradeIntent(intent: Extract<ParsedIntent, { kind: 'trade' }>) {
    let market
    try {
      market = await resolveMarket(intent.symbol)
    } catch {
      pushAgent(`No perpetual market found for ${intent.symbol}. Try BTC, ETH, or INJ.`)
      return
    }

    const price = await getMarketPrice(intent.symbol).catch(() => '?')
    let notional = intent.amount
    if (!notional && intent.qty && price !== '?') {
      notional = parseFloat((intent.qty * parseFloat(price)).toFixed(4))
    }
    if (!notional || notional <= 0) {
      pushAgent(`Couldn't determine trade size — price unavailable. Try specifying a USDT amount, e.g. "$10 of ${intent.symbol}".`)
      return
    }
    const sizeDesc = intent.qty && !intent.amount
      ? `${intent.qty} ${intent.symbol} (~$${notional})`
      : `$${notional} USDT`
    const margin = (notional / intent.leverage).toFixed(2)
    const summary = [
      `Direction : ${intent.side.toUpperCase()}`,
      `Market    : ${market.ticker}`,
      `Notional  : ${sizeDesc}`,
      `Leverage  : ${intent.leverage}x`,
      `Margin req: ~$${margin} USDT`,
      `Spot price: $${price}`,
    ].join('\n')

    const pendingTrade: PendingTrade = { ...intent, amount: notional }

    // Yolo mode: autosign is active and confirmation skipped — fire immediately.
    if (autoSign && yolo) {
      await executeTrade(pendingTrade)
      return
    }

    setMessages(prev => [...prev, agentMsg('Please confirm this trade:', {
      type: 'confirm',
      summary,
      onConfirm: () => executeTrade(pendingTrade),
      onCancel: () => {
        setMessages(p => p.filter(m => m.card?.type !== 'confirm'))
        pushAgent('Trade cancelled.')
      },
    })])
  }

  async function executeTrade(trade: PendingTrade) {
    if (!wallet) return
    setMessages(prev => prev.filter(m => m.card?.type !== 'confirm'))
    pushAgent(`Submitting ${trade.side} order for ${trade.symbol}…${autoSign ? '' : ' (MetaMask will prompt)'}`)
    try {
      const market = await resolveMarket(trade.symbol)
      const result = await openTrade({
        injAddress: wallet.injAddress,
        ethAddress: wallet.ethAddress,
        market,
        side: trade.side,
        notionalUsdt: trade.amount,
        leverage: trade.leverage,
      })
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last.content.startsWith('Submitting'))
          copy[copy.length - 1] = agentMsg(`${trade.side.toUpperCase()} order submitted!`, {
            type: 'tx', txHash: result.txHash,
            label: `${trade.side} ${trade.symbol} $${trade.amount} @ ${trade.leverage}x`,
          })
        return copy
      })
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last.content.startsWith('Submitting'))
          copy[copy.length - 1] = agentMsg(`Trade failed: ${(e as Error).message}`)
        return copy
      })
    }
  }

  // ─── Trade close ──────────────────────────────────────────────────────────

  async function handleCloseIntent(intent: Extract<ParsedIntent, { kind: 'close' }>) {
    if (!wallet) return
    pushAgent(`Looking up your ${intent.symbol} position…`)
    let positions: PositionInfo[] = []
    try {
      positions = await getPositions(wallet.injAddress)
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = agentMsg(`Couldn't load positions: ${(e as Error).message}`)
        return copy
      })
      return
    }

    const pos = positions.find(p => p.symbol.toUpperCase() === intent.symbol.toUpperCase())
    if (!pos) {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = agentMsg(`No open ${intent.symbol} position found.`)
        return copy
      })
      return
    }

    const pnl = parseFloat(pos.pnl)
    const summary = [
      `Direction : ${pos.side.toUpperCase()}`,
      `Market    : ${pos.ticker}`,
      `Quantity  : ${pos.quantity}`,
      `Entry     : $${pos.entryPrice}`,
      `Mark      : $${pos.markPrice}`,
      `Est. PnL  : ${pnl >= 0 ? '+' : ''}${pos.pnl} (${pos.pnlPct}%)`,
    ].join('\n')

    // Yolo mode: autosign is active, skip confirm and fire immediately.
    if (autoSign && yolo) {
      setMessages(prev => prev.filter(m => !m.content.startsWith('Looking up')))
      await executeClose(pos)
      return
    }

    setMessages(prev => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (last.content.startsWith('Looking up'))
        copy[copy.length - 1] = agentMsg('Please confirm closing this position:', {
          type: 'confirm',
          summary,
          onConfirm: () => executeClose(pos),
          onCancel: () => {
            setMessages(p => p.filter(m => m.card?.type !== 'confirm'))
            pushAgent('Close cancelled.')
          },
        })
      return copy
    })
  }

  async function executeClose(pos: PositionInfo) {
    if (!wallet) return
    setMessages(prev => prev.filter(m => m.card?.type !== 'confirm'))
    pushAgent(`Closing ${pos.symbol} position…${autoSign ? '' : ' (MetaMask will prompt)'}`)
    try {
      const market = await resolveMarket(pos.symbol)
      const result = await closeTrade({
        injAddress: wallet.injAddress,
        ethAddress: wallet.ethAddress,
        market,
        side: pos.side,
        quantity: pos.quantity,
      })
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last.content.startsWith('Closing'))
          copy[copy.length - 1] = agentMsg('Position closed!', {
            type: 'tx', txHash: result.txHash, label: `Close ${pos.symbol} ${pos.side}`,
          })
        return copy
      })
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last.content.startsWith('Closing'))
          copy[copy.length - 1] = agentMsg(`Close failed: ${(e as Error).message}`)
        return copy
      })
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">EASYPERPS</span>
          <span className="network-badge">Mainnet</span>
          <span className="powered-by">Powered by Injective</span>
        </div>

        <div className="header-right">
          <button className="btn-clear" onClick={handleClearHistory} data-tooltip="Clear chat history">
            ⌫ Clear
          </button>

          <ThemePicker theme={theme} onChange={setTheme} />

          {wallet ? (
            <div className="wallet-area">
              <span className="wallet-address">
                <span className="wallet-dot" />
                {wallet.injAddress.slice(0, 10)}…{wallet.injAddress.slice(-4)}
              </span>
              <button
                className={`btn-autosign${autoSign ? ' active' : ''}`}
                onClick={handleAutoSign}
                disabled={autoSignBusy}
                data-tooltip={autoSignBusy ? undefined : (autoSign ? 'AutoSign active — click to disable' : 'Enable AutoSign')}
              >
                {autoSignBusy ? '…' : '⚡'}
              </button>
              {autoSign && (
                <button
                  className={`btn-yolo${yolo ? ' active' : ''}`}
                  onClick={() => {
                    const next = !yolo
                    setYolo(next)
                    setMessages(prev => [...prev, systemMsg(
                      next
                        ? '🎰 Yolo mode enabled — trades fire instantly, no confirmation.'
                        : 'Yolo mode disabled — confirmation required before trades.'
                    )])
                  }}
                  data-tooltip={yolo ? 'Yolo mode on — click to disable' : 'Enable Yolo — skip confirmations'}
                >
                  🎰
                </button>
              )}
              <button
                className="btn-bridge"
                onClick={() => openBridge()}
                data-tooltip="Bridge funds from Arbitrum to Injective"
              >
                🌉
              </button>
              <button className="btn-disconnect" onClick={handleDisconnect} data-tooltip="Disconnect wallet">
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-connect" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="chat">
        {messages.map(msg => (
          <div key={msg.id} className={`msg msg-${msg.role}`}>
            {msg.role === 'agent' && <span className="msg-icon">◈</span>}
            <div className="msg-body">
              {msg.content && <p className="msg-text">{msg.content}</p>}
              {msg.card && <RenderCard card={msg.card} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg msg-agent">
            <span className="msg-icon">◈</span>
            <div className="msg-body">
              <span className="typing"><span /><span /><span /></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="input-bar">
        <input
          ref={inputRef}
          className="chat-input"
          placeholder={
            wallet
              ? 'long $50 INJ at 5x  ·  close my BTC  ·  bridge $10  ·  show positions'
              : 'connect wallet to start trading…'
          }
          value={input}
          disabled={!wallet || loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
        />
        <button
          className="btn btn-send"
          onClick={handleSend}
          disabled={!wallet || loading || !input.trim()}
        >
          ↑
        </button>
      </footer>

      {bridgeOpen && wallet && (
        <BridgeModal
          senderEvm={wallet.ethAddress}
          recipientEvm={wallet.ethAddress}
          initialAmount={bridgeInitialAmount}
          onClose={() => setBridgeOpen(false)}
          onStatus={msg => setMessages(prev => [...prev, systemMsg(msg)])}
        />
      )}
    </div>
  )
}
