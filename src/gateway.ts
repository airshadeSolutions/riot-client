import { ENDPOINTS } from './constants';
import type { Account, CurrentGame, LeagueEntry, MatchHistoryOptions, Summoner } from './types';

/**
 * A failed gateway call. `status` is 0 for network/timeout errors. `429`
 * carries `retryAfterSeconds` when the gateway sent a `Retry-After` header —
 * callers back off and retry; the client itself never self-throttles or
 * auto-retries (the gateway owns rate limiting).
 */
export interface GatewayFailure {
  ok: false;
  status: number;
  message: string;
  retryAfterSeconds?: number;
}

export type GatewayResult<T> = { ok: true; data: T } | GatewayFailure;

export interface RiotGatewayClientConfig {
  /**
   * Base URL of the riot-gateway in PATH mode. Requests go to
   * `${baseUrl}/${routingValue}/<riot-path>`; the gateway injects the real
   * Riot API key, so none is sent from here.
   */
  baseUrl: string;
  /** Sent as `x-airshade-service`, identifying the caller to the gateway. */
  serviceName: string;
  /** `'high'` sends `x-priority: high` for the gateway priority queue. */
  priority?: 'high' | 'normal';
  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>;
  /** Per-request timeout in ms. Defaults to 10000. */
  timeoutMs?: number;
}

type QueryParams = Record<string, string | number | undefined>;

/**
 * Thin transport to the riot-gateway. Its only job is to forward requests in
 * PATH mode and hand back the raw JSON payload unmodified — no API key, no
 * client-side rate limiting, no schema validation, no retries.
 */
export class RiotGatewayClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: RiotGatewayClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.headers = {
      accept: 'application/json',
      'x-airshade-service': config.serviceName,
      ...(config.priority === 'high' ? { 'x-priority': 'high' } : {}),
      ...config.defaultHeaders,
    };
  }

  /**
   * Forward a GET to `${baseUrl}/${routingValue}${path}`. `routingValue` is the
   * gateway path prefix — a platform (`euw1`) for platform-routed endpoints or a
   * cluster (`europe`) for regional ones. The payload is returned untouched.
   */
  async get<T>(
    routingValue: string,
    path: string,
    params?: QueryParams,
  ): Promise<GatewayResult<T>> {
    const url = new URL(`${this.baseUrl}/${routingValue}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers, signal: controller.signal });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        message: aborted ? `Request timed out after ${this.timeoutMs}ms` : errorMessage(error),
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        message: body.slice(0, 300) || response.statusText,
        ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
      };
    }

    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, status: 502, message: 'Invalid JSON from gateway' };
    }
  }

  // --- Thin endpoint helpers (raw passthrough, no validation) ---------------
  // Big payloads default to `unknown`; bring your own type via the generic.

  /** account-v1 — regional routing (cluster). */
  getAccountByPuuid<T = Account>(cluster: string, puuid: string): Promise<GatewayResult<T>> {
    return this.get<T>(cluster, ENDPOINTS.ACCOUNT_BY_PUUID.replace('{puuid}', enc(puuid)));
  }

  getAccountByRiotId<T = Account>(
    cluster: string,
    gameName: string,
    tagLine: string,
  ): Promise<GatewayResult<T>> {
    return this.get<T>(
      cluster,
      ENDPOINTS.ACCOUNT_BY_RIOT_ID.replace('{gameName}', enc(gameName)).replace(
        '{tagLine}',
        enc(tagLine),
      ),
    );
  }

  /** summoner-v4 — platform routing. */
  getSummonerByPuuid<T = Summoner>(platform: string, puuid: string): Promise<GatewayResult<T>> {
    return this.get<T>(
      platform,
      ENDPOINTS.SUMMONER_BY_PUUID.replace('{encryptedPUUID}', enc(puuid)),
    );
  }

  /** league-v4 — platform routing. */
  getLeagueEntriesByPuuid<T = LeagueEntry[]>(
    platform: string,
    puuid: string,
  ): Promise<GatewayResult<T>> {
    return this.get<T>(
      platform,
      ENDPOINTS.LEAGUE_ENTRIES_BY_PUUID.replace('{encryptedPUUID}', enc(puuid)),
    );
  }

  /** league-exp-v4 — platform routing, paginated. */
  getLeagueExpEntries<T = LeagueEntry[]>(
    platform: string,
    queue: string,
    tier: string,
    division: string,
    page = 1,
  ): Promise<GatewayResult<T>> {
    const path = ENDPOINTS.LEAGUE_EXP_ENTRIES.replace('{queue}', enc(queue))
      .replace('{tier}', enc(tier))
      .replace('{division}', enc(division));
    return this.get<T>(platform, path, { page });
  }

  /** match-v5 ids — regional routing (cluster). */
  getMatchIds<T = string[]>(
    cluster: string,
    puuid: string,
    options: MatchHistoryOptions = {},
  ): Promise<GatewayResult<T>> {
    return this.get<T>(cluster, ENDPOINTS.MATCHES_BY_PUUID.replace('{puuid}', enc(puuid)), {
      ...options,
    });
  }

  /** match-v5 — regional routing (cluster). */
  getMatch<T = unknown>(cluster: string, matchId: string): Promise<GatewayResult<T>> {
    return this.get<T>(cluster, ENDPOINTS.MATCH_BY_ID.replace('{matchId}', enc(matchId)));
  }

  /** match-v5 timeline — regional routing (cluster). */
  getMatchTimeline<T = unknown>(cluster: string, matchId: string): Promise<GatewayResult<T>> {
    return this.get<T>(cluster, ENDPOINTS.MATCH_TIMELINE_BY_ID.replace('{matchId}', enc(matchId)));
  }

  /** spectator-v5 — platform routing. */
  getActiveGameByPuuid<T = CurrentGame>(
    platform: string,
    puuid: string,
  ): Promise<GatewayResult<T>> {
    return this.get<T>(
      platform,
      ENDPOINTS.CURRENT_GAME_BY_SUMMONER.replace('{encryptedPUUID}', enc(puuid)),
    );
  }
}

const enc = encodeURIComponent;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'fetch failed';
}
