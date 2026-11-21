# Deep Sea CTF

Deep Sea CTF is a community-driven capture-the-flag game where players solve cybersecurity challenges arranged by ocean depth and track solves on a live scoreboard.

**Live:** [deep-sea-ctf.app.space](https://deep-sea-ctf.app.space)

## Try it

1. Sign in to join the crew.
2. Open the [challenge board](https://deep-sea-ctf.app.space/home) or [challenge library](https://deep-sea-ctf.app.space/library).
3. Pick a released challenge and inspect its clues and files.
4. Submit the flag in the format requested by the challenge (for example, `ocean{...}`).
5. Earn points for correct solves and follow the live [scoreboard](https://deep-sea-ctf.app.space/scoreboard).

## Design decisions

- **HMAC flags:** Expected flags are stored as keyed HMAC verifiers and checked server-side; plaintext flags and verifiers are not sent to players.
- **Rate limit:** Each player gets five attempts per challenge in a rolling 60-second window.
- **Owner review:** Community challenges stay private until the app owner approves them.
- **Uploads:** Up to three attachments per challenge, 2 MB each, limited to PNG, JPG, WAV, TXT, CSV, or LOG with content checks. Downloads require sign-in and use attachment, `nosniff`, and CSP sandbox headers.
- **No malware scanner:** No scanner is configured, and file type checks cannot prove a file is safe. Attachments are not previewed; treat them as untrusted and open them in a VM or sandbox.

## More details

Challenges are organized into four depth bands: **10 m**, **200 m**, **1,000 m**, and **4,000 m**. The home board has a sonar view and a list view; use **Reactivate Sonar** to check for newly released challenges.

## Create a challenge

Sign in and open [Create a Challenge](https://deep-sea-ctf.app.space/submit-challenge). Provide a title, category, depth, challenge description, flag, solution write-up, and optionally up to three files. Attachments are limited to 2 MB each and PNG, JPG, WAV, TXT, CSV, or LOG. The server validates the submission and stores it as **pending**; it is not visible in the library until approved.

The app owner reviews submissions in the [Admin page](https://deep-sea-ctf.app.space/admin), can inspect the write-up and download attachments, and approves with a point value or rejects the submission. Approved challenges and their attachments become available to signed-in players. Authors can see their submission status and add files while a challenge is pending. Write-ups remain private to the author and owner until approval, then become available to players after they solve the challenge.

Attachments are stored in DeepSpace app-scoped R2 storage with random keys. The Worker checks file extensions and contents, limits uploads to five per user per minute, and serves files only as authenticated downloads with `Content-Disposition: attachment`, `nosniff`, and CSP sandbox headers. Files are not previewed in the app. **Files are submitted by other players. Open them in a VM or sandbox.**

## Pages

| Page | URL | Access |
| --- | --- | --- |
| Landing page | `/` | Public |
| Operations board and sonar | `/home` | Sign-in required |
| Searchable challenge library | `/library` | Sign-in required |
| Challenge details and flag submission | `/challenges/:id` | Sign-in required |
| Scoreboard | `/scoreboard` | Sign-in required |
| Create a challenge | `/submit-challenge` | Sign-in required |
| Challenge administration and review | `/admin` | App owner only |

## Run locally

### Requirements

- Node.js `22.15` or later in the `22.x` line, `24.x`, or `26.x` (see [`package.json`](./package.json))
- npm `11.6` or later
- A DeepSpace account to sign in to the app and deploy it

### Install and start

```sh
npm ci
npm run dev
```

The DeepSpace CLI starts the local Vite and Worker development environment and prints the local URL. Sign in to the app to test protected pages and player actions. To authenticate the CLI for deployment, run:

```sh
npm run login
```

### Environment and secrets

The Worker uses one private runtime setting for challenge verification:

- `CTF_FLAG_HMAC_KEY` — required to create challenges and verify submitted flags.
This value must remain server-side. Do not put it in frontend code, commit it, or paste it into documentation. Manage app secrets through the DeepSpace secrets store; the CLI generates the ignored `.dev.vars` file for local development. Do not commit `.dev.vars`.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development |
| `npm run build` | Create the production build |
| `npm run type-check` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint |
| `npm run validate` | Run TypeScript checks and unit tests |
| `npm run test:unit` | Run unit tests with Vitest |
| `npm test` | Run the DeepSpace app test runner |
| `npm run test:smoke` | Run the smoke test suite |
| `npm run test:api` | Run the API test suite |
| `npm run test:e2e` | Run the end-to-end test suite |
| `npm run deploy` | Build and deploy the app |

## Deploy

Authenticate the DeepSpace CLI if needed, then deploy from the project directory:

```sh
npm run login
npm run deploy
```

The live app is hosted at [deep-sea-ctf.app.space](https://deep-sea-ctf.app.space). Deployments preserve the app's stored records. This app uses GitHub as its source repository: deployment ships the current local working tree, but does **not** commit or push changes to GitHub. Use ordinary Git to commit and push repository changes separately.

## Built with

- **DeepSpace SDK** for app authentication, server actions, record storage, and real-time data synchronization.
- **DeepSpace R2 file storage** via the Worker `appFiles` helper for private challenge attachments.
- **Cloudflare Workers** with **Hono** for server-side routes and challenge-verification logic.
- **React**, **React Router**, **Vite**, and **Tailwind CSS** for the web app.
- **Vitest** and **Playwright** for unit, API, smoke, and end-to-end testing.

The CTF uses DeepSpace records and server actions rather than exposing challenge secrets to the browser. Expected flags are stored as keyed HMAC verifiers; the flag itself is not returned by the challenge-list or challenge-detail actions. The owner-only admin actions handle challenge creation, publication, and community review.

No third-party integrations are enabled; the game does not require external integrations.

## Project map

| Path | Responsibility |
| --- | --- |
| [`worker.ts`](./worker.ts) | Worker assembly, Durable Object bindings, and route registration |
| [`src/pages/`](./src/pages) | File-based React pages |
| [`src/config/`](./src/config) | Shared app configuration, including landing-page SEO |
| [`src/styles/`](./src/styles) | Global Tailwind styles and theme tokens |
| [`src/actions/`](./src/actions) | Server-side challenge, flag-submission, and admin actions |
| [`src/server/`](./src/server) | HTTP, action, and realtime Worker routes |
| [`src/schemas/`](./src/schemas) | DeepSpace collection schemas and access permissions |
| [`src/lib/flag-mac.ts`](./src/lib/flag-mac.ts) | Keyed flag-verifier helper |
| [`src/lib/stale-chunk-recovery.ts`](./src/lib/stale-chunk-recovery.ts) | One-time recovery when a deployed route chunk is stale |
| [`src/integrations.ts`](./src/integrations.ts) | Explicit integration and billing configuration |
| [`tests/`](./tests) | Browser-based smoke, API, and collaboration tests |

## Current scope

The core experience covers signed-in challenge discovery and solving, server-side flag verification, live scoring, and owner-reviewed community submissions. Production testing of a complete community-challenge submission and approval with separate player accounts should be done in a safe test environment rather than by adding test challenges to the live board.
