import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldReloadForVersion } from '../src/version.js'

describe('app version checks', () => {
  it('reloads only when the deployed version changes', () => {
    assert.equal(shouldReloadForVersion('abc123', { version: 'abc123' }), false)
    assert.equal(shouldReloadForVersion('abc123', { version: 'def456' }), true)
  })

  it('ignores malformed version payloads', () => {
    assert.equal(shouldReloadForVersion('abc123', null), false)
    assert.equal(shouldReloadForVersion('abc123', {}), false)
    assert.equal(shouldReloadForVersion('abc123', { version: '' }), false)
  })
})
