# @airshade/riot-client

A **thin transport to the [riot-gateway](https://github.com/airshadeSolutions)**. Its only job is to
forward Riot API requests to the gateway in PATH mode and hand back the raw JSON payload, unmodified.

It deliberately does **not**:

- hold a Riot API key (the gateway injects it),
- rate-limit on the client side (the gateway owns rate limiting),
- validate or reshape responses (payloads pass through untouched),
- retry automatically (429s are surfaced so the caller can back off).

Zero runtime dependencies — built on the global `fetch` (Node ≥ 18).

## Usage

```ts
import { RiotGatewayClient, regionToPlatform } from '@airshade/riot-client';

const client = new RiotGatewayClient({
  baseUrl: 'http://localhost:8001', // riot-gateway in PATH mode
  serviceName: 'riot-crawler', // sent as x-airshade-service
});

// Cluster-routed (match-v5, account-v1)
const ids = await client.getMatchIds('europe', puuid, { count: 20, queue: 420 });
if (ids.ok) console.log(ids.data); // string[]

const match = await client.getMatch('europe', 'EUW1_123'); // raw JSON (unknown)

// Platform-routed (summoner-v4, league-v4, spectator-v5)
const entries = await client.getLeagueExpEntries('euw1', 'RANKED_SOLO_5x5', 'DIAMOND', 'I', 1);
```

`euw1` → `europe` mapping for cluster-routed calls is available via `regionToPlatform`.

## Result shape

Every call resolves to a `GatewayResult<T>` — it never throws:

```ts
type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; retryAfterSeconds?: number };
```

- `status: 0` → network error or timeout.
- `status: 429` with `retryAfterSeconds` → gateway rate limit; back off and retry. The client never
  retries on its own.

## Bring your own types

The convenience helpers return lightweight, hand-written types (`Account`, `Summoner`, `LeagueEntry`,
`CurrentGame`) that are **not** validated at runtime. Large payloads (`getMatch`, `getMatchTimeline`)
default to `unknown`. Supply a type via the generic when you need a richer shape:

```ts
const match = await client.getMatch<MyMatchDto>('europe', matchId);
```

Or drop to the generic transport for any endpoint:

```ts
await client.get<MyDto>('euw1', '/lol/status/v4/platform-data');
```

## Config

| Option           | Default | Description                                         |
| ---------------- | ------- | --------------------------------------------------- |
| `baseUrl`        | —       | Gateway base URL (PATH mode).                       |
| `serviceName`    | —       | Sent as `x-airshade-service`.                       |
| `priority`       | —       | `'high'` sends `x-priority: high`.                  |
| `defaultHeaders` | —       | Extra headers merged into every request.            |
| `timeoutMs`      | `10000` | Per-request timeout; abort surfaces as `status: 0`. |

## Scripts

```sh
npm run build   # tsc -> dist/
npm test        # vitest
```
