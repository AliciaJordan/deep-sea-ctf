import { describe, expect, it } from 'vitest'
import { getIntegrationConfig } from './integrations'

describe('integration configuration', () => {
  it('does not enable third-party integrations by default', () => {
    expect(getIntegrationConfig('google')).toBeUndefined()
    expect(getIntegrationConfig('composio')).toBeUndefined()
    expect(getIntegrationConfig('unlisted')).toBeUndefined()
    expect(getIntegrationConfig('constructor')).toBeUndefined()
  })
})
