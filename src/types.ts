/**
 * Lightweight, hand-written response types for the convenience helpers. These
 * are not validated at runtime — the gateway hands back whatever Riot returns,
 * unmodified. They cover the stable, commonly-read fields; pass your own type
 * to any helper's generic when you need the full payload shape.
 *
 * Large payloads (match, timeline, current game) intentionally have no full
 * type here and default to `unknown` — bring your own type at the call site.
 */

export interface MatchHistoryOptions {
  type?: string;
  queue?: number;
  start?: number;
  count?: number;
  startTime?: number;
  endTime?: number;
}

/** riot/account-v1 */
export interface Account {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

/** lol/summoner-v4 */
export interface Summoner {
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

/** lol/league-v4 and lol/league-exp-v4 entries */
export interface LeagueEntry {
  puuid: string;
  leagueId?: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
  inactive?: boolean;
}

/** lol/spectator-v5 — minimal shape; bring your own type for the full payload. */
export interface CurrentGame {
  gameId: number;
  gameType: string;
  gameMode: string;
  mapId: number;
  platformId: string;
}
