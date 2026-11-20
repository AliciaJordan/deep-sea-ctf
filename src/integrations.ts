import { lookupOwn } from 'deepspace/worker'

/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays when explicitly configured.
 * - 'user': The calling user pays.
 *
 * Only integrations listed here are configured. This app currently uses no
 * external integrations.
 *
 * Integrations not listed here are disabled and fail closed.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean }
> = {
}

export function getIntegrationConfig(name: string) {
  return lookupOwn(integrations, name)
}
