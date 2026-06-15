import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { connectMetaMask, disconnectMetaMask } from '../src/wallet.js'

const testEthAddress = '0x0000000000000000000000000000000000000001'

type RequestCall = { method: string; params?: unknown[] }

function setEthereum(request: (args: RequestCall) => Promise<unknown>) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
    ethereum: {
      isMetaMask: true,
      request,
      on() {},
      removeListener() {},
    },
    } as unknown as Window,
  })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('MetaMask wallet connection', () => {
  it('asks MetaMask for account selection before reading accounts', async () => {
    const calls: RequestCall[] = []
    setEthereum(async (args) => {
      calls.push(args)
      if (args.method === 'wallet_requestPermissions') return []
      if (args.method === 'eth_requestAccounts') return [testEthAddress]
      throw new Error(`unexpected method ${args.method}`)
    })

    const wallet = await connectMetaMask()

    assert.equal(wallet.ethAddress, testEthAddress)
    assert.equal(calls[0]?.method, 'wallet_requestPermissions')
    assert.deepEqual(calls[0]?.params, [{ eth_accounts: {} }])
    assert.equal(calls[1]?.method, 'eth_requestAccounts')
  })

  it('falls back to eth_requestAccounts when permissions are unsupported', async () => {
    const calls: string[] = []
    setEthereum(async (args) => {
      calls.push(args.method)
      if (args.method === 'wallet_requestPermissions') {
        throw Object.assign(new Error('unsupported method'), { code: -32601 })
      }
      if (args.method === 'eth_requestAccounts') return [testEthAddress]
      throw new Error(`unexpected method ${args.method}`)
    })

    const wallet = await connectMetaMask()

    assert.equal(wallet.ethAddress, testEthAddress)
    assert.deepEqual(calls, ['wallet_requestPermissions', 'eth_requestAccounts'])
  })

  it('revokes the account permission on disconnect when supported', async () => {
    const calls: RequestCall[] = []
    setEthereum(async (args) => {
      calls.push(args)
      return []
    })

    await disconnectMetaMask()

    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.method, 'wallet_revokePermissions')
    assert.deepEqual(calls[0]?.params, [{ eth_accounts: {} }])
  })
})
