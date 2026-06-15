import { useState, useRef, useEffect, useCallback } from 'react'
import { connectMetaMask, isMetaMaskAvailable, onAccountsChanged } from './wallet'
import type { WalletInfo } from './wallet'
import { applyClarification, parse, formatMissing } from './nlp'
import type { ParsedIntent, PendingIntent } from './nlp'
import { getMarketPrice, getBalances, getPositions, resolveMarket, listMarkets } from './injective'
import type { PositionInfo, BalanceInfo, PerpMarket } from './injective'
import { openTrade, closeTrade } from './tx'
import type { TxResult } from './tx'
import type { RfqGatewayProgressEvent } from './rfqGateway'
import { enableAutoSign, disableAutoSign, isAutoSignActive } from './autosign'
import {
  DEFAULT_SOURCE_CHAIN_ID,
  SOURCE_CHAINS,
  executeBridge,
  fetchBridgeQuote,
  fetchSourceUsdcBalance,
  getBridgeSourceChain,
  isValidBridgeAmount,
  MAX_BRIDGE_USDC,
} from './bridge'
import type { BridgeEstimation } from './bridge'
import { Decimal } from 'decimal.js'
import { startAppVersionMonitor } from './version'
import './App.css'

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
  amount: string
  leverage: string
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

const RFQ_STATUS_PREFIXES = [
  'Requesting RFQ',
  'Preparing RFQ',
  'Matching RFQ',
  'Refreshing RFQ',
  'Signing RFQ',
  'Broadcasting RFQ',
  'RFQ matched',
  'RFQ settlement',
]

const QUICK_COMMANDS = [
  'long $50 INJ at 5x',
  'short $10 ETH at 2x',
  'show balances',
  'bridge $10 from base',
]

const DEALER_TICKER_PHRASES = [
  'HOT RFQ DEALS',
  'MAINNET MADNESS',
  'NO BACKEND',
  'FAST QUOTES',
  'NOT FINANCIAL ADVICE',
  'NATIVE USDC',
  'ASK ABOUT BRIDGING',
  'CCTP CASH EXPRESS',
  'AUTO SIGN SPECIAL',
  'YOLO BUTTON ENERGY',
  'ORDER BOOK OPTIONAL',
  'SETTLE LIKE A PRO',
  'BRIDGE FROM BASE',
  'ETH OPTIMISM ARB',
  'SPREADS SO NICE',
  'POWERED BY INJECTIVE',
  'DEALER DESK OPEN',
  'USDC ONLY ZONE',
]

const DEALER_TICKER_LANES = [0, 1]

function isRfqStatusMessage(content: string): boolean {
  return RFQ_STATUS_PREFIXES.some(prefix => content.startsWith(prefix))
}

const WELCOME = agentMsg(
  'MAINNET MADNESS!\n\nBest deals on Injective perps, quoted through RFQ and settled in native USDC.\n\nTry:\n• "long $50 INJ at 5x"\n• "2x short $10 of ETH"\n• "close my BTC position"\n• "show balances"\n• "price of INJ"\n• "bridge $10 from Base to Injective"'
)

// ─── Cards ───────────────────────────────────────────────────────────────────

function BalancesCard({ data }: { data: BalanceInfo[] }) {
  if (data.length === 0) return <p className="card-empty">No USDC balance found.</p>
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
  if (data.length === 0) return null
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
  const url = `https://tcx.inj.so/tx/${encodeURIComponent(txHash)}?network=mainnet&mode=all`
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

// ─── Bridge Modal ─────────────────────────────────────────────────────────────

interface BridgeModalProps {
  senderEvm:     string
  recipientEvm:  string
  initialAmount?: string
  initialSource?: string
  onClose:       () => void
  onStatus:      (msg: string) => void
}

type SourceBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; amount: string }
  | { status: 'error' }

function BridgeModal({ senderEvm, recipientEvm, initialAmount = '10', initialSource = 'arbitrum', onClose, onStatus }: BridgeModalProps) {
  const [amount, setAmount]       = useState(initialAmount)
  const [sourceId, setSourceId]   = useState(() => getBridgeSourceChain(initialSource).id)
  const [quote, setQuote]         = useState<BridgeEstimation | null>(null)
  const [quoting, setQuoting]     = useState(false)
  const [bridging, setBridging]   = useState(false)
  const [step, setStep]           = useState<string>('')
  const [error, setError]         = useState<string>('')
  const [sourceBalance, setSourceBalance] = useState<SourceBalanceState>({ status: 'idle' })
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)
  const sourcePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAmount(initialAmount)
    setSourceId(getBridgeSourceChain(initialSource).id)
    setQuote(null)
    setStep('')
    setError('')
    setSourceMenuOpen(false)
  }, [initialAmount, initialSource])

  const source = getBridgeSourceChain(sourceId)
  const validAmount = isValidBridgeAmount(amount)

  useEffect(() => {
    let cancelled = false

    setSourceBalance({ status: 'loading' })
    fetchSourceUsdcBalance(senderEvm, source.id)
      .then(balance => {
        if (!cancelled) setSourceBalance({ status: 'ready', amount: balance })
      })
      .catch(() => {
        if (!cancelled) setSourceBalance({ status: 'error' })
      })

    return () => { cancelled = true }
  }, [senderEvm, source.id])

  useEffect(() => {
    if (!sourceMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!sourcePickerRef.current?.contains(event.target as Node)) {
        setSourceMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSourceMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sourceMenuOpen])

  function selectSource(nextSourceId: number) {
    setSourceId(nextSourceId)
    setQuote(null)
    setStep('')
    setError('')
    setSourceMenuOpen(false)
  }

  async function handleQuote() {
    if (!validAmount) {
      setError(`Enter an amount between 0 and ${MAX_BRIDGE_USDC.toLocaleString()} USDC.`)
      return
    }
    setQuoting(true); setError(''); setQuote(null)
    try {
      const q = await fetchBridgeQuote(amount, recipientEvm, source.id)
      setQuote(q)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setQuoting(false)
    }
  }

  async function handleBridge() {
    if (!validAmount) {
      setError(`Enter an amount between 0 and ${MAX_BRIDGE_USDC.toLocaleString()} USDC.`)
      return
    }
    setBridging(true); setError(''); setStep('')
    try {
      const result = await executeBridge(amount, senderEvm, recipientEvm, msg => {
        setStep(msg)
        onStatus(msg)
      }, source.id)
      const approveLine = result.approveTxHash
        ? `Approve tx: ${result.approveTxHash}`
        : 'Approve tx: skipped, allowance already set'
      onStatus(`🌉 Bridge complete! Native USDC minted on Injective.
${approveLine}
Burn tx:    ${result.burnTxHash}
Mint tx:    ${result.mintTxHash}`)
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      onStatus(`Bridge failed: ${msg}`)
    } finally {
      setBridging(false)
    }
  }

  return (
    <div className="bridge-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bridge-modal">
        <div className="bridge-header">
          <span className="bridge-title">🌉 Bridge Funds</span>
          <button className="bridge-close" onClick={onClose}>✕</button>
        </div>

        <div className="bridge-row">
          <label className="bridge-label">From</label>
          <div className="bridge-chain-row bridge-chain-row-source">
            <div className="bridge-source-picker" ref={sourcePickerRef}>
              <button
                type="button"
                className="bridge-chain bridge-source-trigger"
                aria-haspopup="listbox"
                aria-expanded={sourceMenuOpen}
                disabled={quoting || bridging}
                onClick={() => setSourceMenuOpen(open => !open)}
              >
                <span>{source.shortName}</span>
                <span className="bridge-source-caret" aria-hidden="true">▾</span>
              </button>
              {sourceMenuOpen && (
                <div className="bridge-source-menu" role="listbox" aria-label="Bridge source chain">
                  {SOURCE_CHAINS.map(chain => (
                    <button
                      key={chain.id}
                      type="button"
                      className={chain.id === sourceId ? 'bridge-source-option selected' : 'bridge-source-option'}
                      role="option"
                      aria-selected={chain.id === sourceId}
                      onClick={() => selectSource(chain.id)}
                    >
                      <span>{chain.shortName}</span>
                      {chain.id === sourceId && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="bridge-token">USDC</span>
          </div>
          <p className={`bridge-balance bridge-balance-${sourceBalance.status}`}>
            {sourceBalance.status === 'ready'
              ? `Balance: ${sourceBalance.amount} USDC on ${source.shortName}`
              : sourceBalance.status === 'loading'
                ? `Balance: checking ${source.shortName}...`
                : sourceBalance.status === 'error'
                  ? `Balance unavailable on ${source.shortName}`
                  : '\u00a0'}
          </p>
        </div>

        <div className="bridge-row">
          <label className="bridge-label">Amount</label>
          <div className="bridge-amount-row">
            <input
              className="bridge-input"
              type="number"
              min="0"
              max={MAX_BRIDGE_USDC}
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
            <span className="bridge-token">USDC</span>
          </div>
        </div>

        {quote && (
          <div className="bridge-quote">
            <div className="bridge-quote-row">
              <span>You receive</span>
              <span className="bridge-quote-val">{quote.dstAmount} USDC</span>
            </div>
            <div className="bridge-quote-row">
              <span>Route</span>
              <span>{quote.route}</span>
            </div>
            <div className="bridge-quote-row">
              <span>CCTP fee</span>
              <span>0 USDC, standard finality</span>
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
            disabled={quoting || bridging || !validAmount}
          >
            {quoting ? 'Quoting…' : 'Get Quote'}
          </button>
          <button
            className="btn-bridge-send"
            onClick={handleBridge}
            disabled={bridging || !validAmount}
          >
            {bridging ? '…' : 'Bridge →'}
          </button>
        </div>

        <p className="bridge-note">
          Needs {source.nativeCurrency.symbol} on {source.shortName} for burn gas and INJ on Injective EVM for mint gas.
          Circle attestation usually takes a few minutes.
        </p>
      </div>
    </div>
  )
}

function DealerTicker() {
  return (
    <>
      <div className="dealer-ticker" aria-hidden="true">
        <div className="dealer-ticker-track">
          {DEALER_TICKER_LANES.map(lane => (
            <div className="dealer-ticker-group" key={lane}>
              {DEALER_TICKER_PHRASES.map(phrase => (
                <span key={`${lane}-${phrase}`}>{phrase}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="rainbow-stripe" aria-hidden="true" />
    </>
  )
}

function DealerLogo() {
  return (
    <span className="logo" aria-label="EasyPerps">
      EASY<span>PERPS</span>
    </span>
  )
}

function LandingScreen({ connecting, onConnect }: { connecting: boolean; onConnect: () => void }) {
  return (
    <main className="landing-screen">
      <section className="landing-card" aria-labelledby="landing-title">
        <span className="sticker sticker-red">NO BACKEND</span>
        <span className="sticker sticker-yellow">RFQ POWERED</span>
        <span className="sticker sticker-blue">INJECTIVE MAINNET</span>
        <p className="landing-eyebrow">Welcome to</p>
        <h1 id="landing-title">EASYPERPS</h1>
        <p className="landing-subtitle">RFQ PERPS</p>
        <p className="landing-copy">
          Type the trade, confirm the deal, sign from MetaMask. RFQ quotes, native USDC markets,
          and CCTP bridge support are packed into one very unreasonable trading desk.
        </p>
        <button className="btn btn-connect landing-connect" onClick={onConnect} disabled={connecting}>
          {connecting ? 'CONNECTING...' : 'CONNECT WALLET NOW'}
        </button>
        <div className="landing-badges">
          <span>RFQ</span>
          <span>NATIVE USDC</span>
          <span>CCTP</span>
          <span>AUTOSIGN</span>
          <span>MAINNET</span>
        </div>
      </section>
    </main>
  )
}

function CommandChips({ onSelect }: { onSelect: (command: string) => void }) {
  return (
    <div className="quick-strip" aria-label="Quick commands">
      {QUICK_COMMANDS.map(command => (
        <button key={command} type="button" onClick={() => onSelect(command)}>
          {command.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function DealerRail({ wallet, autoSign, yolo }: { wallet: WalletInfo; autoSign: boolean; yolo: boolean }) {
  return (
    <aside className="dealer-rail" aria-label="Trading status">
      <section className="rail-panel">
        <h2>Finance Desk</h2>
        <div className="wallet-ticket">
          <span>Connected buyer</span>
          <strong>{wallet.injAddress.slice(0, 12)}...{wallet.injAddress.slice(-4)}</strong>
        </div>
        <div className="status-grid">
          <span>RFQ</span><strong>ONLINE</strong>
          <span>AutoSign</span><strong>{autoSign ? 'ON' : 'ASK FIRST'}</strong>
          <span>Yolo</span><strong>{yolo ? 'LIVE' : 'OFF'}</strong>
          <span>Quote asset</span><strong>USDC</strong>
        </div>
      </section>

      <section className="rail-panel">
        <h2>Bridge Lot</h2>
        <div className="source-list">
          {SOURCE_CHAINS.map(chain => (
            <span key={chain.id}>{chain.shortName}</span>
          ))}
        </div>
        <p>Burn native USDC on source. Mint native USDC on Injective EVM.</p>
      </section>

      <section className="rail-panel rail-warning">
        <h2>Dealer Note</h2>
        <p>Perpetuals carry significant risk. Verify size, leverage, and chain before signing.</p>
      </section>
    </aside>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [autoSign, setAutoSign] = useState(false)
  const [autoSignBusy, setAutoSignBusy] = useState(false)
  const [yolo, setYolo] = useState(false)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [bridgeInitialAmount, setBridgeInitialAmount] = useState('10')
  const [bridgeInitialSource, setBridgeInitialSource] = useState(() => getBridgeSourceChain(DEFAULT_SOURCE_CHAIN_ID).slug)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingClarification, setPendingClarification] = useState<PendingIntent | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function focusComposer() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    return startAppVersionMonitor({
      onStale: () => {
        setMessages(prev => [...prev, systemMsg('A newer EasyPerps build is live. Reloading before trading...')])
        window.setTimeout(() => window.location.reload(), 1200)
      },
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return onAccountsChanged((injAddr) => {
      if (!injAddr) {
        setWallet(null)
        setAutoSign(false)
        setYolo(false)
        setMessages(prev => [...prev, systemMsg('Wallet disconnected.')])
      } else {
        setWallet(w => w ? { ...w, injAddress: injAddr } : null)
        setAutoSign(isAutoSignActive(injAddr))
      }
    })
  }, [])

  const pushAgent = useCallback((content: string, card?: CardData) => {
    setMessages(prev => [...prev, agentMsg(content, card)])
  }, [])

  const replaceRfqStatus = useCallback((content: string, card?: CardData) => {
    setMessages(prev => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (last?.role === 'agent' && isRfqStatusMessage(last.content)) {
        copy[copy.length - 1] = agentMsg(content, card)
      } else {
        copy.push(agentMsg(content, card))
      }
      return copy
    })
  }, [])

  function formatMatchedMessage(label: string, event?: RfqGatewayProgressEvent): string {
    const result = event?.phase === 'matched' ? event.result : null
    const price = result?.bestPrice ? ` at $${result.bestPrice}` : ''
    const quoteCount = result?.quotesAccepted
      ? ` from ${result.quotesAccepted} quote${result.quotesAccepted === 1 ? '' : 's'}`
      : ''
    return `RFQ matched: ${label}${price}${quoteCount}. Settlement is confirming...`
  }

  function handleMatchedSettlement({
    result,
    content,
    label,
  }: {
    result: TxResult
    content: string
    label: string
  }) {
    const publishTx = (txHash: string) => {
      pushAgent(content, { type: 'tx', txHash, label })
    }

    if (!result.confirmation) {
      publishTx(result.txHash)
      return
    }

    void result.confirmation
      ?.then(confirmed => publishTx(confirmed.txHash || result.txHash))
      .catch(() => {
        pushAgent('Order reverted, please try again.')
      })
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  function handleDisconnect() {
    disableAutoSign(wallet?.injAddress)
    setAutoSign(false)
    setYolo(false)
    setWallet(null)
    setMessages(prev => [...prev, systemMsg('Wallet disconnected.')])
  }

  function handleClearHistory() {
    setMessages([WELCOME])
    setPendingClarification(null)
  }

  function openBridge(amount?: number, source?: string) {
    setBridgeInitialAmount(amount && amount > 0 ? String(amount) : '10')
    setBridgeInitialSource(getBridgeSourceChain(source ?? DEFAULT_SOURCE_CHAIN_ID).slug)
    setBridgeOpen(true)
  }

  async function handleAutoSign() {
    if (!wallet) return
    if (autoSign) {
      disableAutoSign(wallet.injAddress)
      setAutoSign(false)
      setYolo(false)
      setMessages(prev => [...prev, systemMsg('RFQ AutoSign disabled.')])
      return
    }
    await ensureRfqAutoSign()
  }

  async function ensureRfqAutoSign(reason?: string): Promise<boolean> {
    if (!wallet) return false
    if (isAutoSignActive(wallet.injAddress)) {
      setAutoSign(true)
      return true
    }
    setAutoSignBusy(true)
    if (reason) setMessages(prev => [...prev, systemMsg(reason)])
    try {
      await enableAutoSign(
        wallet.injAddress,
        wallet.ethAddress,
        msg => setMessages(prev => [...prev, systemMsg(msg)]),
      )
      setAutoSign(true)
      return true
    } catch (e) {
      setMessages(prev => [...prev, agentMsg(`RFQ AutoSign setup failed: ${(e as Error).message}`)])
      return false
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
      setAutoSign(isAutoSignActive(info.injAddress))
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
    focusComposer()
    setLoading(true)
    try {
      await processMessage(text)
    } finally {
      setLoading(false)
      focusComposer()
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
    if (!pendingClarification?.kind) return
    const clarification = applyClarification(pendingClarification, text)

    if (clarification.ready) {
      setPendingClarification(null)
      await executeIntent(clarification.intent as ParsedIntent)
    } else {
      setPendingClarification(clarification.intent as PendingIntent)
      pushAgent(formatMissing(clarification.missing))
    }
  }

  async function executeIntent(intent: ParsedIntent) {
    if (!wallet) { pushAgent('Please connect MetaMask first.'); return }

    switch (intent.kind) {
      case 'balances': {
        pushAgent('Fetching USDC balance...')
        try {
          const data = await getBalances(wallet.injAddress)
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content === 'Fetching USDC balance...')
              copy[copy.length - 1] = agentMsg('Your USDC balance:', { type: 'balances', data })
            return copy
          })
        } catch (e) { pushAgent(`Error fetching USDC balance: ${(e as Error).message}`) }
        break
      }
      case 'positions': {
        pushAgent('Fetching positions…')
        try {
          const data = await getPositions(wallet.injAddress)
          setMessages(prev => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.content === 'Fetching positions…') {
              copy[copy.length - 1] = data.length === 0
                ? agentMsg('No open positions.')
                : agentMsg('Your open positions:', { type: 'positions', data })
            }
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
        openBridge(intent.amount, intent.source)
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
    let notional = intent.amount ? new Decimal(intent.amount.toString()) : null
    if (!notional && intent.qty && price !== '?') {
      notional = new Decimal(intent.qty.toString()).mul(new Decimal(price)).toDecimalPlaces(4)
    }
    if (!notional || notional.lte(0)) {
      pushAgent(`Couldn't determine trade size, price unavailable. Try specifying a USDC amount, e.g. "$10 of ${intent.symbol}".`)
      return
    }
    const sizeDesc = intent.qty && !intent.amount
      ? `${intent.qty} ${intent.symbol} (~$${notional.toFixed()})`
      : `$${notional.toFixed()} USDC`
    const leverage = new Decimal(intent.leverage.toString())
    const margin = notional.div(leverage).toDecimalPlaces(2).toFixed()
    const summary = [
      `Direction : ${intent.side.toUpperCase()}`,
      `Market    : ${market.ticker}`,
      'Route     : RFQ quote',
      `Notional  : ${sizeDesc}`,
      `Leverage  : ${intent.leverage}x`,
      `Margin req: ~$${margin} USDC`,
      `Spot price: $${price}`,
    ].join('\n')

    const pendingTrade: PendingTrade = {
      side: intent.side,
      symbol: intent.symbol,
      amount: notional.toFixed(),
      leverage: leverage.toFixed(),
    }

    // Yolo mode: autosign is active and confirmation skipped, fire immediately.
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
    const ready = await ensureRfqAutoSign('RFQ AutoSign authorization is required before trading.')
    if (!ready) return

    pushAgent(`Requesting RFQ quotes for ${trade.side} ${trade.symbol}...`)
    try {
      const market = await resolveMarket(trade.symbol)
      let matched = false
      const matchedLabel = `${trade.side.toUpperCase()} ${trade.symbol}`
      const result = await openTrade({
        injAddress: wallet.injAddress,
        ethAddress: wallet.ethAddress,
        market,
        side: trade.side,
        notionalUsdc: Number(trade.amount),
        leverage: Number(trade.leverage),
        onProgress: (message, event) => {
          if (event?.phase === 'matched') {
            matched = true
            replaceRfqStatus(formatMatchedMessage(matchedLabel, event))
            return
          }
          if (matched && (event?.phase === 'signing' || event?.phase === 'broadcasting' || event?.phase === 'broadcasted')) {
            return
          }
          replaceRfqStatus(message)
        },
      })
      if (!matched) {
        replaceRfqStatus(formatMatchedMessage(matchedLabel))
      }
      handleMatchedSettlement({
        result,
        content: `${trade.side.toUpperCase()} RFQ settlement confirmed.`,
        label: `RFQ ${trade.side} ${trade.symbol} $${trade.amount} @ ${trade.leverage}x`,
      })
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && isRfqStatusMessage(last.content))
          copy[copy.length - 1] = agentMsg(last.content.startsWith('RFQ matched')
            ? 'Order reverted, please try again.'
            : `Trade failed: ${(e as Error).message}`)
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
      'Route     : RFQ close quote',
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
    const ready = await ensureRfqAutoSign('RFQ AutoSign authorization is required before closing positions.')
    if (!ready) return

    pushAgent(`Requesting RFQ close quote for ${pos.symbol}...`)
    try {
      const market = await resolveMarket(pos.symbol)
      let matched = false
      const matchedLabel = `Close ${pos.symbol}`
      const result = await closeTrade({
        injAddress: wallet.injAddress,
        ethAddress: wallet.ethAddress,
        market,
        side: pos.side,
        quantity: pos.quantity,
        onProgress: (message, event) => {
          if (event?.phase === 'matched') {
            matched = true
            replaceRfqStatus(formatMatchedMessage(matchedLabel, event))
            return
          }
          if (matched && (event?.phase === 'signing' || event?.phase === 'broadcasting' || event?.phase === 'broadcasted')) {
            return
          }
          replaceRfqStatus(message)
        },
      })
      if (!matched) {
        replaceRfqStatus(formatMatchedMessage(matchedLabel))
      }
      handleMatchedSettlement({
        result,
        content: 'RFQ close settlement confirmed.',
        label: `RFQ close ${pos.symbol} ${pos.side}`,
      })
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && isRfqStatusMessage(last.content))
          copy[copy.length - 1] = agentMsg(last.content.startsWith('RFQ matched')
            ? 'Order reverted, please try again.'
            : `Close failed: ${(e as Error).message}`)
        return copy
      })
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`app dealer-mode ${wallet ? 'app-connected' : 'app-disconnected'}`}>
      <DealerTicker />

      <header className="header">
        <div className="header-left">
          <DealerLogo />
          <span className="network-badge">Mainnet</span>
          <span className="powered-by">Powered by Injective</span>
        </div>

        <div className="header-right">
          {wallet && (
            <button className="btn-clear" onClick={handleClearHistory} data-tooltip="Clear chat history">
              Clear
            </button>
          )}

          {wallet ? (
            <div className="wallet-area">
              <span className="wallet-address">
                <span className="wallet-dot" />
                {wallet.injAddress.slice(0, 10)}...{wallet.injAddress.slice(-4)}
              </span>
              <button
                className={`btn-autosign${autoSign ? ' active' : ''}`}
                onClick={handleAutoSign}
                disabled={autoSignBusy}
                data-tooltip={autoSignBusy ? undefined : (autoSign ? 'RFQ AutoSign active, click to disable' : 'Enable RFQ AutoSign')}
              >
                {autoSignBusy ? '...' : (autoSign ? 'AUTOSIGN ON' : 'RFQ AUTO')}
              </button>
              {autoSign && (
                <button
                  className={`btn-yolo${yolo ? ' active' : ''}`}
                  onClick={() => {
                    const next = !yolo
                    setYolo(next)
                    setMessages(prev => [...prev, systemMsg(
                      next
                        ? 'Yolo mode enabled, trades fire instantly, no confirmation.'
                        : 'Yolo mode disabled, confirmation required before trades.'
                    )])
                  }}
                  data-tooltip={yolo ? 'Yolo mode on, click to disable' : 'Enable Yolo, skip confirmations'}
                >
                  YOLO
                </button>
              )}
              <button
                className="btn-bridge"
                onClick={() => openBridge()}
                data-tooltip="Bridge native USDC from supported CCTP sources"
              >
                BRIDGE
              </button>
              <button className="btn-disconnect" onClick={handleDisconnect} data-tooltip="Disconnect wallet">
                Walk Away
              </button>
            </div>
          ) : (
            <button className="btn btn-connect" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'CONNECTING...' : 'CONNECT NOW!!!'}
            </button>
          )}
        </div>
      </header>

      {wallet ? (
        <div className="dealer-workspace">
          <section className="chat-panel">
            <div className="chat-strip">EASYPERPS AGENT</div>
            <span className="chat-sticker chat-sticker-rfq">RFQ POWERED</span>
            <span className="chat-sticker chat-sticker-backend">NO BACKEND</span>

            <main className="chat">
              {messages.map(msg => (
                <div key={msg.id} className={`msg msg-${msg.role}`}>
                  {msg.role === 'agent' && <span className="msg-icon">DEAL</span>}
                  <div className="msg-body">
                    {msg.content && <p className="msg-text">{msg.content}</p>}
                    {msg.card && <RenderCard card={msg.card} />}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="msg msg-agent">
                  <span className="msg-icon">RFQ</span>
                  <div className="msg-body">
                    <span className="typing"><span /><span /><span /></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </main>

            <footer className="input-bar">
              <CommandChips onSelect={(command) => {
                setInput(command)
                focusComposer()
              }} />
              <div className="input-row">
                <input
                  ref={inputRef}
                  className="chat-input"
                  placeholder="type your order..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                  }}
                />
                <button
                  className="btn btn-send"
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                >
                  GO
                </button>
              </div>
            </footer>
          </section>

          <DealerRail wallet={wallet} autoSign={autoSign} yolo={yolo} />
        </div>
      ) : (
        <LandingScreen connecting={connecting} onConnect={handleConnect} />
      )}

      {bridgeOpen && wallet && (
        <BridgeModal
          senderEvm={wallet.ethAddress}
          recipientEvm={wallet.ethAddress}
          initialAmount={bridgeInitialAmount}
          initialSource={bridgeInitialSource}
          onClose={() => setBridgeOpen(false)}
          onStatus={msg => setMessages(prev => [...prev, systemMsg(msg)])}
        />
      )}
    </div>
  )
}
