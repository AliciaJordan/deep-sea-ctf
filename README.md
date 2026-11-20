# Deep Sea CTF

Deep Sea CTF is a live, community-driven capture-the-flag game. Players explore cybersecurity challenges arranged by ocean depth, submit flags, and follow solves on a real-time scoreboard. Signed-in players can also submit their own challenges for owner review.

**Play:** [deep-sea-ctf.app.space](https://deep-sea-ctf.app.space)

## How to play

1. Open the [challenge board](https://deep-sea-ctf.app.space/home) or browse the [challenge library](https://deep-sea-ctf.app.space/library). The library can be searched by title, category, and description, and filtered by category or depth.
2. Select a released challenge to read its description and any linked files.
3. Sign in, solve it, and submit the flag in the `ocean{...}` format.
4. Correct submissions add the challenge's points to your score. The board and [scoreboard](https://deep-sea-ctf.app.space/scoreboard) update as solves are recorded.
5. After solving a community challenge, you can read its solution write-up on the challenge page.

Challenges are organized into four depth bands: **10 m**, **200 m**, **1,000 m**, and **4,000 m**. The home board has a sonar view and a list view; use **Reactivate Sonar** to check for newly released challenges.

Each player can submit up to five flag attempts per challenge in a rolling 60-second window. Challenge authors cannot score points on their own challenges.

## Create a challenge

Sign in and open [Create a Challenge](https://deep-sea-ctf.app.space/submit-challenge). Provide a title, category, depth, challenge description, flag, and solution write-up. The server validates the submission and stores it as **pending**; it is not visible in the public library until approved.

The app owner reviews submissions in the [Admin page](https://deep-sea-ctf.app.space/admin), can inspect the write-up, and approves with a point value or rejects the submission. Approved challenges are published to the library and board. Authors can see their submission status. Their write-up is private to them and the owner while pending, then becomes available to other players after they solve the challenge.

## Pages

| Page | URL | Access |
| --- | --- | --- |
| Landing page | `/` | Public |
| Operations board and sonar | `/home` | Public |
| Searchable challenge library | `/library` | Public |
| Challenge details and flag submission | `/challenges/:id` | Sign-in required |
| Scoreboard | `/scoreboard` | Public |
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

The Worker uses two private runtime settings for challenge verification and starter-challenge loading:

- `CTF_FLAG_HMAC_KEY` — required to create challenges and verify submitted flags.
- `CTF_STARTER_FLAGS_B64` — private starter-flag configuration used by the owner-only **Load Starter Challenges** action.

These values must remain server-side. Do not put them in frontend code, commit them, or paste their values into documentation. The app's starter flag configuration is intentionally not included in the repository. Manage app secrets through the DeepSpace secrets store; the CLI generates the ignored `.dev.vars` file for local development. Do not commit `.dev.vars`.

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
- **Cloudflare Workers** with **Hono** for server-side routes and challenge-verification logic.
- **React**, **React Router**, **Vite**, and **Tailwind CSS** for the web app.
- **Vitest** and **Playwright** for unit, API, smoke, and end-to-end testing.

The CTF uses DeepSpace records and server actions rather than exposing challenge secrets to the browser. Expected flags are stored as keyed HMAC verifiers; the flag itself is not returned by the challenge-list or challenge-detail actions. The owner-only admin actions handle challenge creation, publication, starter loading, and community review.

Google and Composio are explicitly configured in the integration proxy, but neither is currently part of the core CTF player workflow. The game does not require either integration.

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

The core experience covers public challenge discovery, signed-in solving, server-side flag verification, live scoring, and owner-reviewed community submissions. Integrations such as Google and Composio are not used in that core flow. Production testing of a complete community-challenge submission and approval with separate player accounts should be done in a safe test environment rather than by adding test challenges to the public board.
