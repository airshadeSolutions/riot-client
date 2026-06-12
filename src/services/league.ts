import { z } from 'zod';
import { ENDPOINTS } from '../constants';
import { LeagueEntrySchema, type LeagueEntry } from '../types';
import { left, right, type Either } from '../types/either';
import type { HttpClient, ApiError } from '../utils/httpClient';

export type LeagueExpQueue = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';

export class LeagueService {
  constructor(private readonly httpClient: HttpClient) {}

  async getEntriesByPuuid(puuid: string): Promise<Either<ApiError, LeagueEntry[]>> {
    const url = ENDPOINTS.LEAGUE_ENTRIES_BY_PUUID.replace('{encryptedPUUID}', puuid);
    const response = await this.httpClient.get<LeagueEntry[]>(url);

    if (response.isLeft()) {
      return left(response.value);
    }

    try {
      const entries = z.array(LeagueEntrySchema).parse(response.value.data);
      return right(entries);
    } catch (error) {
      return left({
        status: 400,
        statusText: 'Validation Error',
        message: 'League entries data validation failed',
        details: error,
      });
    }
  }

  async getEntries(
    queue: LeagueExpQueue | string,
    tier: string,
    division: string,
    page: number = 1,
  ): Promise<Either<ApiError, LeagueEntry[]>> {
    return this.getLeagueExpEntries(queue, tier, division, page);
  }

  async getLeagueExpEntries(
    queue: LeagueExpQueue | string,
    tier: string,
    division: string,
    page: number = 1,
  ): Promise<Either<ApiError, LeagueEntry[]>> {
    const params = new URLSearchParams({ page: page.toString() });
    const url = `${ENDPOINTS.LEAGUE_EXP_ENTRIES.replace('{queue}', encodeURIComponent(queue))
      .replace('{tier}', encodeURIComponent(tier))
      .replace('{division}', encodeURIComponent(division))}?${params.toString()}`;
    const response = await this.httpClient.get<LeagueEntry[]>(url);

    if (response.isLeft()) {
      return left(response.value);
    }

    try {
      const entries = z.array(LeagueEntrySchema).parse(response.value.data);
      return right(entries);
    } catch (error) {
      return left({
        status: 400,
        statusText: 'Validation Error',
        message: 'League entries data validation failed',
        details: error,
      });
    }
  }
}
