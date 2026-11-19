import { randomBytes } from 'node:crypto'

const baseUrl = process.env.DEEPSPACE_APP_URL
const token = process.env.DEEPSPACE_ACTION_TOKEN
if (!baseUrl || !token) {
  throw new Error('Set DEEPSPACE_APP_URL and DEEPSPACE_ACTION_TOKEN for the signed-in app owner.')
}
const flags = [0, 1].map(() => `DSCTF{${randomBytes(18).toString('hex')}}`)
const response = await fetch(new URL('/api/actions/seedSampleChallenges', baseUrl), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ flags }),
})
const result = await response.json()
if (!response.ok || !result.success) throw new Error(result.error ?? 'Challenge seeding failed.')
console.log('Created two sample challenges. Store these flags privately:')
for (const flag of flags) console.log(flag)
