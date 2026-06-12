# @airshade/riot-client

TypeScript Riot API client for Airshade. This package is a hard fork of
`samira` by Gabriel-Passoss, adapted for Airshade's `riot-gateway`, lossless
match ingestion, and configurable client-side rate limiting.

The client can talk directly to Riot or route every request through
`riot-gateway` in PATH mode:

```text
{gatewayBaseUrl}/{routingValue}/{riot-path}
```

For data pipelines, match responses can be fetched in raw mode so Riot payloads
reach storage without schema stripping.

## Install

From GitHub:

```sh
npm install git+https://github.com/airshadeSolutions/riot-client.git
```

If published to npm:

```sh
npm install @airshade/riot-client
```

## Quick Start

```ts
import { Samira, REGIONS } from '@airshade/riot-client';

const riot = new Samira({
  apiKey: process.env.RIOT_API_KEY!,
  region: REGIONS.EUW1,
});

const account = await riot.account.getAccountByRiotId('GameName', 'EUW');

if (account.isRight()) {
  console.log(account.value.puuid);
} else {
  console.error(account.value.status, account.value.message);
}
```

All service methods return `Either<ApiError, T>`:

```ts
const result = await riot.summoner.getSummonerByPuuid('puuid');

if (result.isRight()) {
  // result.value is the successful response
} else {
  // result.value is ApiError
}
```

## Gateway Mode

When `baseUrl` is set, requests are routed through `riot-gateway`. The gateway
is expected to inject the real Riot API key, so the local `apiKey` can be a
placeholder.

```ts
import { Samira, REGIONS } from '@airshade/riot-client';

const riot = new Samira({
  apiKey: 'gateway-injects-key',
  region: REGIONS.EUW1,
  baseUrl: 'http://localhost:8001',
  rateLimit: false,
  retryOn429: false,
  defaultHeaders: {
    'x-airshade-service': 'my-service',
  },
});
```

Recommended gateway settings:

- `rateLimit: false`: do not double-limit. Let `riot-gateway` own Riot quotas.
- `retryOn429: false`: let the caller react to gateway `429` and `Retry-After`.
- `defaultHeaders`: identify the internal service for gateway logs and stats.
- `priority: 'high'`: optional, sends `x-priority: high` for gateway priority queues.

Routing examples in gateway mode:

- Account and Match APIs use regional routing such as `europe`.
- Summoner, League, Spectator, and League-Exp use platform routing such as `euw1`.

The `Samira` constructor chooses the correct route family from the configured
platform.

## Direct Riot Mode

Without `baseUrl`, the client calls Riot hosts directly and sends `X-Riot-Token`.

```ts
const riot = new Samira({
  apiKey: process.env.RIOT_API_KEY!,
  region: REGIONS.NA1,
  rateLimit: {
    requestsPerSecond: 20,
    requestsPerTwoMinutes: 100,
  },
});
```

By default, direct mode uses the built-in rate limiter and retries once on `429`
after honoring `Retry-After`.

## Services

### Account

```ts
await riot.account.getAccountByRiotId('GameName', 'TagLine');
await riot.account.getAccountByPuuid('puuid');
```

### Summoner

```ts
await riot.summoner.getSummonerByPuuid('puuid');
```

### League

```ts
await riot.league.getEntriesByPuuid('puuid');

// league-exp-v4, useful for rank-stratified crawling
await riot.league.getLeagueExpEntries('RANKED_SOLO_5x5', 'DIAMOND', 'I', 1);
await riot.league.getEntries('RANKED_FLEX_SR', 'EMERALD', 'II', 3);
```

### Match

```ts
await riot.match.getMatchHistoryByPUUID('puuid', {
  type: 'ranked',
  count: 20,
  queue: 420,
});

await riot.match.getMatchById('EUW1_1234567890');
await riot.match.getMatchesByIds(['EUW1_1234567890', 'EUW1_1234567891']);
await riot.match.getRecentMatches('puuid', 20);
await riot.match.getMatchesInTimeRange('puuid', 1700000000, 1700500000);
await riot.match.getMatchesByQueue('puuid', 420);
```

Raw match mode skips Zod parsing and returns the Riot response as `unknown`:

```ts
const raw = await riot.match.getMatchById('EUW1_1234567890', { raw: true });

if (raw.isRight()) {
  // Store raw.value as JSON without schema filtering.
}
```

Timelines are returned raw:

```ts
const timeline = await riot.match.getMatchTimelineById('EUW1_1234567890');
```

### Spectator

```ts
await riot.spectator.getActiveGameByPuuid('puuid');
```

## Match Schema Policy

Riot match payloads drift over time. This fork keeps match parsing permissive:

- Match, metadata, info, team, participant, challenge, mission, and perks schemas
  preserve unknown fields with `.passthrough()`.
- Participant fields are optional so field removals or renames do not fail the
  whole match parse.
- Known newer fields are represented, including `endOfGameResult`, new ping
  counters, integrity flags, `PlayerScore*`, `playerAugment5/6`,
  `positionAssignedByMatchmaking`, `selectedRolePreferences`, and others.
- `getMatchById(matchId, { raw: true })` is available for pipelines that must
  avoid validation entirely.

For large crawl/data-plane workloads, prefer raw mode and store the response
directly. Use parsed matches for application logic where typed access is more
valuable than avoiding validation.

## Data Dragon

`DataDragon` fetches League of Legends static data and can cache common datasets
after `init()`.

```ts
import { DataDragon } from '@airshade/riot-client';

const ddragon = new DataDragon({
  version: 'latest',
  language: 'en_US',
  includeFullUrl: true,
});

await ddragon.init();

const champions = await ddragon.getChampions();
const items = await ddragon.getItems();
const runes = await ddragon.getRunes();
const spells = await ddragon.getSummonerSpells();

const aatrox = ddragon.getChampionResumeById(266);
const boots = ddragon.getItemById(1001);

const championImage = ddragon.getChampionImageUrl(266);
const itemImage = ddragon.getItemImageUrl('1001');
const profileIcon = ddragon.getProfileIconUrl(1);
```

## Lower-Level Clients

You can compose services manually with `HttpClient` when you need explicit
routing or custom transport settings:

```ts
import { HttpClient, MatchService } from '@airshade/riot-client';

const client = new HttpClient({
  baseURL: 'http://localhost:8001/europe',
  apiKey: 'gateway-injects-key',
  rateLimit: false,
  retryOn429: false,
  defaultHeaders: {
    'x-airshade-service': 'analytics-worker',
  },
});

const match = new MatchService(client);
const result = await match.getMatchById('EUW1_1234567890', { raw: true });
```

## Exports

Main exports:

- `Samira`
- `DataDragon`
- Services: `AccountService`, `LeagueService`, `MatchService`,
  `SpectatorService`, `SummonerService`
- Utilities: `HttpClient`, `RateLimiter`
- Types and schemas from `src/types`
- Constants: `REGIONS`, `PLATFORMS`, `REGIONAL_ROUTING`, `ENDPOINTS`,
  `QUEUE_TYPES`, `GAME_MODES`, `MAP_IDS`, `TIER_LEVELS`, `RANK_DIVISIONS`

## Development

```sh
npm install
npm run build
npm test -- --run
```

Useful test subsets:

```sh
npm test -- --run tests/services/new-endpoints.spec.ts
npm test -- --run tests/types.test.ts
```

The package builds to `dist/` and exports only `dist/index.js` and generated
types.

## Attribution and License

This package is an Airshade-maintained hard fork of `samira` by
Gabriel-Passoss.

The original MIT license and copyright notice are preserved in
[`LICENSE`](./LICENSE):

```text
MIT License

Copyright (c) 2025 Gabriel-Passoss
```

Airshade changes are also distributed under the MIT license.
