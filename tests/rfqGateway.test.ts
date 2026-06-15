import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CosmosTxV1Beta1TxPb,
  PrivateKey,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '@injectivelabs/sdk-ts'
import {
  buildEasyPerpsRfqCid,
  buildRfqGatewayPrepareRequest,
  executeRfqGatewayAutoSign,
  getPreparedQuoteExpiryReport,
  getPreparedTxSignatureIndexes,
  assertPreparedQuoteFreshness,
  signPreparedAutoSignTxRaw,
  type RfqPreparedAutoSign,
} from '../src/rfqGateway.js'
import type { AutoSignSession } from '../src/autosign.js'
import { MsgExec as AuthzMsgExecPb } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/authz/v1beta1/tx_pb.js'
import { MsgExecuteContractCompat as WasmxMsgExecuteContractCompatPb } from '@injectivelabs/core-proto-ts-v2/generated/injective/wasmx/v1/tx_pb.js'

function wrappedPubKey(raw: Uint8Array): Uint8Array {
  return new Uint8Array([0x0a, raw.length, ...raw])
}

function makePreparedTxRaw({
  autosignPubKey,
  feePayerPubKey,
  autosignIndex,
  messages = [],
}: {
  autosignPubKey: Uint8Array
  feePayerPubKey: Uint8Array
  autosignIndex: number
  messages?: Array<{ typeUrl: string; value: Uint8Array }>
}) {
  const signerPubKeys = autosignIndex === 0
    ? [autosignPubKey, feePayerPubKey]
    : [feePayerPubKey, autosignPubKey]
  const authInfo = CosmosTxV1Beta1TxPb.AuthInfo.create({
    signerInfos: signerPubKeys.map(value => ({
      publicKey: {
        typeUrl: '/cosmos.crypto.secp256k1.PubKey',
        value: wrappedPubKey(value),
      },
      sequence: 0n,
    })),
  })
  const body = CosmosTxV1Beta1TxPb.TxBody.create({ messages })
  return CosmosTxV1Beta1TxPb.TxRaw.create({
    bodyBytes: CosmosTxV1Beta1TxPb.TxBody.toBinary(body),
    authInfoBytes: CosmosTxV1Beta1TxPb.AuthInfo.toBinary(authInfo),
    signatures: [],
  })
}

function makePreparedAcceptQuoteTxRaw({
  autosignPubKey,
  feePayerPubKey,
  autosignIndex,
  quoteExpiries,
}: {
  autosignPubKey: Uint8Array
  feePayerPubKey: Uint8Array
  autosignIndex: number
  quoteExpiries: number[]
}) {
  const acceptQuote = {
    accept_quote: {
      rfq_id: 42,
      market_id: '0xmarket',
      direction: 'short',
      margin: '0',
      quantity: '0.00038',
      worst_price: '60586',
      quotes: quoteExpiries.map((expiry, index) => ({
        maker: `inj1maker${index}`,
        price: '63755',
        quantity: '0.00038',
        margin: '0',
        expiry: { ts: expiry },
        signature: 'sig',
        sign_mode: 'v2',
      })),
      cid: 'test-cid',
    },
  }
  const executeCompat = WasmxMsgExecuteContractCompatPb.create({
    sender: 'inj1granter',
    contract: 'inj12stwq95jet57edcu4a65r48r46s9rzrs938n8k',
    msg: JSON.stringify(acceptQuote),
    funds: '',
  })
  const exec = AuthzMsgExecPb.create({
    grantee: 'inj1grantee',
    msgs: [{
      typeUrl: '/injective.wasmx.v1.MsgExecuteContractCompat',
      value: WasmxMsgExecuteContractCompatPb.toBinary(executeCompat),
    }],
  })
  return makePreparedTxRaw({
    autosignPubKey,
    feePayerPubKey,
    autosignIndex,
    messages: [{
      typeUrl: '/cosmos.authz.v1beta1.MsgExec',
      value: AuthzMsgExecPb.toBinary(exec),
    }],
  })
}

function makePreparedAutoSign(tx: Uint8Array): RfqPreparedAutoSign {
  return {
    tx,
    feePayer: 'inj1fee',
    signMode: 'direct',
    rfqId: 42,
    pubKeyType: 'secp256k1',
    feePayerSig: `0x${'11'.repeat(64)}`,
    quotesWaitMs: 10,
    expiredQuotesCount: 0,
    autosignAccountNumber: 123,
    feePayerAccountNumber: 456,
    autosignAccountSequence: 7,
    feePayerAccountSequence: 8,
    quotes: [{
      maker: 'inj1maker',
      price: '10',
      margin: '5',
      quantity: '1',
    }],
  }
}

describe('RFQ gateway', () => {
  it('tags EasyPerps RFQ requests with an attributable cid by default', () => {
    const { privateKey } = PrivateKey.generate()
    const session: AutoSignSession = {
      privateKeyHex: privateKey.toPrivateKeyHex(),
      granteeAddress: privateKey.toBech32(),
      granterAddress: 'inj1granter',
      expiration: 4_070_908_800,
      evmChainId: 1776,
      scopeVersion: 2,
    }

    const request = buildRfqGatewayPrepareRequest({
      session,
      marketId: '0xmarket',
      accountDetails: null,
      input: {
        direction: 'short',
        margin: '0',
        quantity: '0.00038',
        worstPrice: '60586',
      },
    })

    assert.match(request.cid, /^easyperps-[0-9a-f]{24}$/)
    assert.match(buildEasyPerpsRfqCid(), /^easyperps-[0-9a-f]{24}$/)
  })

  it('finds prepared RFQ signers when gateway wraps pubkeys', () => {
    const { privateKey } = PrivateKey.generate()
    const autosignPubKey = base64ToUint8Array(privateKey.toPublicKey().toBase64())
    const feePayerPubKey = new Uint8Array(33)
    feePayerPubKey[0] = 2
    feePayerPubKey[32] = 9
    const txRaw = makePreparedTxRaw({
      autosignPubKey,
      feePayerPubKey,
      autosignIndex: 1,
    })

    assert.deepEqual(
      getPreparedTxSignatureIndexes(txRaw, {
        autosignPubKeyBase64: privateKey.toPublicKey().toBase64(),
        feePayerPubKeyBase64: uint8ArrayToBase64(feePayerPubKey),
      }),
      { autosignIndex: 1, feePayerIndex: 0, signerCount: 2 },
    )
  })

  it('inserts autosign and fee-payer signatures by decoded signer index', async () => {
    const { privateKey } = PrivateKey.generate()
    const autosignPubKey = base64ToUint8Array(privateKey.toPublicKey().toBase64())
    const feePayerPubKey = new Uint8Array(33)
    feePayerPubKey[0] = 2
    feePayerPubKey[32] = 9
    const txRaw = makePreparedTxRaw({
      autosignPubKey,
      feePayerPubKey,
      autosignIndex: 1,
    })

    const signed = await signPreparedAutoSignTxRaw({
      tx: CosmosTxV1Beta1TxPb.TxRaw.toBinary(txRaw),
      feePayerSig: `0x${'11'.repeat(64)}`,
      privateKeyHex: privateKey.toPrivateKeyHex(),
      accountNumber: 123,
      feePayerPubKey: { key: uint8ArrayToBase64(feePayerPubKey) },
    })

    assert.equal(signed.signatures.length, 2)
    assert.equal(signed.signatures[0].length, 64)
    assert.equal(signed.signatures[0][0], 0x11)
    assert.ok(signed.signatures[1].length > 0)
    assert.notEqual(uint8ArrayToBase64(signed.signatures[1]), uint8ArrayToBase64(signed.signatures[0]))
  })

  it('prepares, signs, broadcasts, and polls an RFQ autosign settlement', async () => {
    const { privateKey } = PrivateKey.generate()
    const autosignPubKey = base64ToUint8Array(privateKey.toPublicKey().toBase64())
    const feePayerPubKey = new Uint8Array(33)
    feePayerPubKey[0] = 2
    feePayerPubKey[32] = 9
    const txRaw = makePreparedTxRaw({
      autosignPubKey,
      feePayerPubKey,
      autosignIndex: 0,
    })
    const prepared = makePreparedAutoSign(CosmosTxV1Beta1TxPb.TxRaw.toBinary(txRaw))
    prepared.feePayerPubKey = { key: uint8ArrayToBase64(feePayerPubKey), type: 'secp256k1' }
    const session: AutoSignSession = {
      privateKeyHex: privateKey.toPrivateKeyHex(),
      granteeAddress: privateKey.toBech32(),
      granterAddress: 'inj1granter',
      expiration: 4_070_908_800,
      evmChainId: 1776,
      scopeVersion: 2,
    }
    let gatewayCalled = false
    let broadcastSignatureCount = 0

    const result = await executeRfqGatewayAutoSign({
      session,
      marketId: '0xmarket',
      accountDetails: null,
      input: {
        direction: 'long',
        margin: '5',
        quantity: '1',
        worstPrice: '11',
      },
      gatewayApi: {
        async fetchPrepareAutoSign(request) {
          gatewayCalled = true
          assert.equal(request.takerAddress, 'inj1granter')
          assert.equal(request.autosignAddress, privateKey.toBech32())
          return prepared
        },
      },
      txApiClient: {
        async broadcast(signedTxRaw) {
          broadcastSignatureCount = signedTxRaw.signatures.length
          return { txHash: 'ABC', code: 0 }
        },
        async fetchTxPoll(txHash) {
          return { txHash, code: 0 }
        },
      },
    })

    assert.equal(gatewayCalled, true)
    assert.equal(broadcastSignatureCount, 2)
    assert.equal(result.txHash, 'ABC')
    assert.equal(result.rfqId, 42)
    assert.equal(result.quotesAccepted, 1)
    assert.equal(result.status, 'confirmed')
  })

  it('inspects prepared settlements and rejects quotes that expire too soon', () => {
    const { privateKey } = PrivateKey.generate()
    const autosignPubKey = base64ToUint8Array(privateKey.toPublicKey().toBase64())
    const feePayerPubKey = new Uint8Array(33)
    feePayerPubKey[0] = 2
    feePayerPubKey[32] = 9
    const nowMs = 1_781_264_968_000
    const txRaw = makePreparedAcceptQuoteTxRaw({
      autosignPubKey,
      feePayerPubKey,
      autosignIndex: 0,
      quoteExpiries: [nowMs + 1_000, nowMs + 6_000],
    })
    const prepared = makePreparedAutoSign(CosmosTxV1Beta1TxPb.TxRaw.toBinary(txRaw))

    const report = getPreparedQuoteExpiryReport(prepared, { nowMs, minTtlMs: 2_500 })
    assert.equal(report.inspected, true)
    assert.equal(report.quoteCount, 2)
    assert.equal(report.timestampQuoteCount, 2)
    assert.equal(report.ok, false)
    assert.equal(report.shortestTtlMs, 1_000)
    assert.throws(
      () => assertPreparedQuoteFreshness(prepared, { nowMs, minTtlMs: 2_500 }),
      /RFQ quotes expire too soon \(1000ms left; need 2500ms\)/,
    )
  })

  it('emits matched progress before broadcast and returns pending confirmation', async () => {
    const { privateKey } = PrivateKey.generate()
    const autosignPubKey = base64ToUint8Array(privateKey.toPublicKey().toBase64())
    const feePayerPubKey = new Uint8Array(33)
    feePayerPubKey[0] = 2
    feePayerPubKey[32] = 9
    const txRaw = makePreparedTxRaw({
      autosignPubKey,
      feePayerPubKey,
      autosignIndex: 0,
    })
    const prepared = makePreparedAutoSign(CosmosTxV1Beta1TxPb.TxRaw.toBinary(txRaw))
    prepared.feePayerPubKey = { key: uint8ArrayToBase64(feePayerPubKey), type: 'secp256k1' }
    const session: AutoSignSession = {
      privateKeyHex: privateKey.toPrivateKeyHex(),
      granteeAddress: privateKey.toBech32(),
      granterAddress: 'inj1granter',
      expiration: 4_070_908_800,
      evmChainId: 1776,
      scopeVersion: 2,
    }
    const phases: string[] = []
    let broadcastStarted = false
    let matchedBeforeBroadcast = false
    let resolveConfirmation!: (value: { txHash: string; code: number }) => void
    const pendingConfirmation = new Promise<{ txHash: string; code: number }>(resolve => {
      resolveConfirmation = resolve
    })

    const result = await executeRfqGatewayAutoSign({
      session,
      marketId: '0xmarket',
      accountDetails: null,
      input: {
        direction: 'long',
        margin: '5',
        quantity: '1',
        worstPrice: '11',
      },
      waitForConfirmation: false,
      gatewayApi: {
        async fetchPrepareAutoSign() {
          return prepared
        },
      },
      txApiClient: {
        async broadcast() {
          broadcastStarted = true
          assert.equal(matchedBeforeBroadcast, true)
          return { txHash: 'ABC', code: 0 }
        },
        async fetchTxPoll(txHash) {
          const confirmed = await pendingConfirmation
          return { txHash, code: confirmed.code }
        },
      },
      onProgress(_message, event) {
        if (!event) return
        phases.push(event.phase)
        if (event.phase === 'matched' && !broadcastStarted) matchedBeforeBroadcast = true
      },
    })

    assert.deepEqual(phases.slice(0, 3), ['preparing', 'matching', 'matched'])
    assert.equal(result.status, 'matched')
    assert.equal(result.settlementPending, true)
    assert.ok(result.confirmation)
    resolveConfirmation({ txHash: 'ABC', code: 0 })
    assert.equal((await result.confirmation).txHash, 'ABC')
  })
})
