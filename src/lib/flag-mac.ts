export async function flagMac(flag: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(flag))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
