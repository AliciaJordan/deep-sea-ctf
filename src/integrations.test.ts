import { describe, expect, it } from 'vitest'
import { getIntegrationConfig } from './integrations'

describe('integration configuration', () => {
  it('only resolves integrations explicitly configured by the app', () => {
    expect(getIntegrationConfig('google')).toEqual({ billing: 'user' })
    expect(getIntegrationConfig('composio')).toEqual({ billing: 'user' })
    expect(getIntegrationConfig('unlisted')).toBeUndefined()
    expect(getIntegrationConfig('constructor')).toBeUndefined()
  })
})
