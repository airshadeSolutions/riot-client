import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Samira } from '../../src/samira';
import { REGIONS } from '../../src/constants';
import { createE2ESamira, directRiotOnly, E2E_ACCOUNT, waitForRateLimit } from '../e2e-utils';

describe('Account Service E2E', () => {
  let samira: Samira;

  beforeAll(() => {
    samira = createE2ESamira(E2E_ACCOUNT.region);
  });

  beforeEach(async () => {
    await waitForRateLimit(samira.getPlatformClient());
  });

  describe('getAccountByRiotId', () => {
    it('should fetch account by Riot ID successfully', async () => {
      const { gameName, tagLine } = E2E_ACCOUNT;

      const result = await samira.account.getAccountByRiotId(gameName, tagLine);

      expect(result.isRight()).toBe(true);
      if (result.isRight()) {
        const account = result.value as any;
        expect(account).toBeDefined();
        expect(account.puuid).toBeDefined();
        expect(account.gameName).toBe(gameName);
        expect(account.tagLine).toBe(tagLine);
        expect(typeof account.puuid).toBe('string');
        expect(account.puuid.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid Riot ID gracefully', async () => {
      const gameName = E2E_ACCOUNT.gameName;
      const tagLine = 'trasg';

      const result = await samira.account.getAccountByRiotId(gameName, tagLine);

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(404);
        expect(result.value.message).toContain('Data not found');
      }
    });
  });

  describe('getAccountByPUUID', () => {
    it('should fetch account by PUUID successfully', async () => {
      const { puuid } = E2E_ACCOUNT;

      const result = await samira.account.getAccountByPuuid(puuid);

      expect(result.isRight()).toBe(true);
      if (result.isRight()) {
        const account = result.value;
        expect(account.puuid).toBe(puuid);
      }
    });

    it('should handle invalid PUUID gracefully', async () => {
      const invalidPUUID =
        'ZrXebR0htvpXhiz8D75UGNtYhcCNRqXIAO4kGieSfwJbihV1PKTjTd2sP1CsgqClaL-vw812L7h7as';

      const result = await samira.account.getAccountByPuuid(invalidPUUID);

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(400);
        expect(result.value.message).toContain('Bad Request');
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
        region: REGIONS.BR1,
      });

      const result = await invalidSamira.account.getAccountByRiotId('Dave Mustaine', 'trash');

      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) {
        expect(result.value.status).toBe(401);
        expect(result.value.statusText).toContain('Unauthorized');
      }
    });
  });
});
