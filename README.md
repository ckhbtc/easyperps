# EasyPerps

A natural-language frontend for trading [Injective](https://injective.com) perpetual futures from your MetaMask wallet.

Type what you want. Confirm. Sign. Done.

```
> long 10 INJ with 5x leverage
> close my BTC position
> bridge 100 USDC from arbitrum
> show positions
```

Live at **[easyperps.com](https://easyperps.com)**.

## What it does

- **MetaMask-native trading.** Connect MetaMask, sign trades with EIP-712 — no separate wallet, no seed phrase to manage.
- **Natural-language intent.** Type a trade in plain English; the parser extracts side, symbol, notional, and leverage. Always confirms before signing.
- **AuthZ auto-sign sessions.** Generate an ephemeral key, grant it a scoped trading authorization on-chain, then trade for the rest of the session without per-trade MetaMask popups. Auto-revokes on expiry.
- **Native USDC bridging.** Bridge Arbitrum USDC into native Injective USDC via Circle CCTP V2. The app burns on Arbitrum, waits for Circle attestation, then mints on Injective EVM from MetaMask.
- **Read-only by default.** Markets, prices, balances, and positions all load without signing anything.

## Stack

- React 19 + TypeScript + Vite
- [`@injectivelabs/sdk-ts`](https://github.com/InjectiveLabs/injective-ts) for chain interaction (IndexerGrpc APIs, EIP-712, AuthZ)
- [`ethers`](https://docs.ethers.org) for MetaMask interop
- Pure client-side — no backend, no analytics, no tracking

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run lint
```

Requires Node 20+ and a browser with MetaMask installed.

## Deploy

The app is a fully static SPA. Build and serve `dist/` from any static host (nginx, Vercel, Cloudflare Pages, S3+CloudFront). The production site at easyperps.com is just `dist/` behind nginx.

## Project layout

```
src/
├── App.tsx          # chat UI, theme, message rendering
├── nlp.ts           # natural-language → trade intent parser
├── wallet.ts        # MetaMask connect + Injective address derivation
├── injective.ts     # read-only chain queries (markets, prices, positions, balances)
├── tx.ts            # EIP-712 signing + Injective tx broadcast
├── autosign.ts      # AuthZ session-key flow (grant, broadcast, revoke)
└── bridge.ts        # Circle CCTP V2: Arbitrum USDC → native Injective USDC
```

## Caveats

- Mainnet only. There is no testnet toggle in the UI today.
- Market orders only at the chat layer (limit orders are exposed at the SDK layer but not yet in the NLP parser).
- Slippage is real. The order is built with conservative oracle-derived prices but you can still get filled at a worse rate in fast markets.
- Liquidation prices shown in the position card are estimates — actual liquidation depends on mark price, oracle ticks, and funding.

## License

MIT — see [LICENSE](LICENSE).

This is unofficial software. Not affiliated with Injective Labs. Trade at your own risk.
