import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Samira } from '../../src/samira';
import { REGIONS } from '../../src/constants';
import {
  createE2ESamira,
  directRiotOnly,
  E2E_ACCOUNT,
  waitForRateLimit,
} from '../e2e-utils';

describe('Spectator Service E2E', () => {
  let samira: Samira;

  beforeAll(() => {
    samira = createE2ESamira(REGIONS.NA1);
  });

  beforeEach(async () => {
    await waitForRateLimit(samira.getRegionalClient());
  });

  describe('getActiveGameByPuuid', () => {
    it('should expose active-game lookup but not removed featured-games lookup', () => {
      expect(typeof samira.spectator.getActiveGameByPuuid).toBe('function');
      expect((samira.spectator as any).getFeaturedGames).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    directRiotOnly('should handle unauthorized access', async () => {
      // Create a Samira instance with invalid API key
      const invalidSamira = new Samira({
        apiKey: 'invalid-api-key',
        region: REGIONS.KR,
      });

      const result = await invalidSamira.spectator.getActiveGameByPuuid(E2E_ACCOUNT.puuid);

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(401);
        expect(result.value.statusText).toContain('Unauthorized');
      }
    });
  });
});
