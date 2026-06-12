import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Samira } from '../../src/samira';
import { REGIONS } from '../../src/constants';
import { createE2ESamira, directRiotOnly, E2E_ACCOUNT, waitForRateLimit } from '../e2e-utils';

describe('Match Service E2E', () => {
  let samira: Samira;

  beforeAll(() => {
    samira = createE2ESamira(E2E_ACCOUNT.region);
  });

  beforeEach(async () => {
    await waitForRateLimit(samira.getPlatformClient());
  });

  describe('getMatchById', () => {
    it('should fetch match by match ID successfully', async () => {
      const matchId = E2E_ACCOUNT.matchId;

      const result = await samira.match.getMatchById(matchId);

      expect(result.isRight()).toBe(true);
      if (result.isRight()) {
        const match = result.value as any;
        expect(match).toBeDefined();
        expect(match.metadata).toBeDefined();
        expect(match.metadata.matchId).toBe(matchId);
        expect(match.info).toBeDefined();
        expect(match.info.participants).toBeDefined();
        expect(Array.isArray(match.info.participants)).toBe(true);
        expect(match.info.participants.length).toBe(10);
      }
    });

    it('should handle invalid match ID gracefully', async () => {
      const matchId = 'InvalidMatchId';

      const result = await samira.match.getMatchById(matchId);

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(404);
        expect(result.value.message.toLowerCase()).toMatch(/not found|match file not found/);
      }
    });
  });

  describe('getMatchesByPuuid', () => {
    it('should fetch matches by puuid successfully', async () => {
      const { puuid } = E2E_ACCOUNT;
      const matchesIds = await samira.match.getMatchHistoryByPUUID(puuid, { count: 1 });

      if (matchesIds.isRight()) {
        const result = await samira.match.getMatchesByIds(matchesIds.value);

        if (result.isRight()) {
          const matches = result.value as any;
          expect(matches).toBeDefined();
          expect(matches.length).toBeGreaterThan(0);
        }

        expect(result.isRight()).toBe(true);
      }
    }, 100000);

    it('should handle invalid puuid gracefully', async () => {
      const puuid = 'invalid-puuid';
      const result = await samira.match.getMatchHistoryByPUUID(puuid);

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(400);
        expect(result.value.message).toContain('Bad Request - Exception decrypting invalid-puuid');
      }
    });
  });

  describe('API response validation', () => {
    it('should return properly formatted account data', async () => {
      const { gameName, tagLine } = E2E_ACCOUNT;

      const result = await samira.account.getAccountByRiotId(gameName, tagLine);

      expect(result.isRight()).toBe(true);
      if (result.isRight()) {
        const account = result.value;

        // Validate data structure
        expect(account).toHaveProperty('puuid');
        expect(account).toHaveProperty('gameName');
        expect(account).toHaveProperty('tagLine');

        // Validate data types
        expect(typeof account.puuid).toBe('string');
        expect(typeof account.gameName).toBe('string');
        expect(typeof account.tagLine).toBe('string');

        // Validate data content
        expect(account.puuid.length).toBeGreaterThan(0);
        expect(account.gameName.length).toBeGreaterThan(0);
        expect(account.tagLine.length).toBeGreaterThan(0);

        expect(account.puuid).toMatch(/^[a-zA-Z0-9_-]{70,80}$/);
      }
    });
  });

  describe('Error handling', () => {
    directRiotOnly('should handle unauthorized access', async () => {
      // Create a Samira instance with invalid API key
      const invalidSamira = new Samira({
        apiKey: 'invalid-api-key',
        region: REGIONS.KR,
      });

      const result = await invalidSamira.match.getMatchById('BR1_3130694840');

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(401);
        expect(result.value.statusText).toContain('Unauthorized');
      }
    });
  });
});
