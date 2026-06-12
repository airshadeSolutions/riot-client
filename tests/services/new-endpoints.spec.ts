import { describe, expect, it } from 'vitest';
import { LeagueService } from '../../src/services/league';
import { MatchService } from '../../src/services/match';
import { right } from '../../src/types/either';

function fakeClient(data: unknown) {
  const calls: string[] = [];

  return {
    calls,
    get: async (url: string) => {
      calls.push(url);
      return right({
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
      });
    },
  };
}

describe('new Riot endpoints', () => {
  it('should fetch league-exp entries by queue, tier, division, and page', async () => {
    const client = fakeClient([
      {
        puuid: 'puuid-1',
        queueType: 'RANKED_SOLO_5x5',
        tier: 'DIAMOND',
        rank: 'I',
        leaguePoints: 75,
        wins: 27,
        losses: 25,
        hotStreak: true,
        veteran: false,
        freshBlood: false,
        inactive: false,
      },
    ]);
    const service = new LeagueService(client as any);

    const result = await service.getLeagueExpEntries('RANKED_SOLO_5x5', 'DIAMOND', 'I', 2);

    expect(result.isRight()).toBe(true);
    expect(client.calls).toEqual(['/lol/league-exp/v4/entries/RANKED_SOLO_5x5/DIAMOND/I?page=2']);
  });

  it('should fetch raw match timelines', async () => {
    const timeline = { metadata: { matchId: 'EUW1_1' }, info: { frames: [] } };
    const client = fakeClient(timeline);
    const service = new MatchService(client as any);

    const result = await service.getMatchTimelineById('EUW1_1');

    expect(result.isRight()).toBe(true);
    expect(result.isRight() ? result.value : undefined).toBe(timeline);
    expect(client.calls).toEqual(['/lol/match/v5/matches/EUW1_1/timeline']);
  });

  it('should return unparsed match data when raw mode is enabled', async () => {
    const rawMatch = { futureTopLevel: true };
    const client = fakeClient(rawMatch);
    const service = new MatchService(client as any);

    const result = await service.getMatchById('EUW1_1', { raw: true });

    expect(result.isRight()).toBe(true);
    expect(result.isRight() ? result.value : undefined).toBe(rawMatch);
    expect(client.calls).toEqual(['/lol/match/v5/matches/EUW1_1']);
  });
});
