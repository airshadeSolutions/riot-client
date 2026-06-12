import { it } from 'vitest';
import { Samira } from '../src/samira';
import { REGIONS, type Region } from '../src/constants';
import type { HttpClient } from '../src/utils/httpClient';

export const E2E_USE_GATEWAY = process.env.RIOT_E2E_USE_GATEWAY !== 'false';
export const E2E_GATEWAY_URL =
  process.env.RIOT_GATEWAY_URL ?? process.env.RIOT_E2E_GATEWAY_URL ?? 'http://localhost:8001';

export const E2E_ACCOUNT = {
  gameName: 'Dave Mustaine',
  tagLine: 'trash',
  puuid: 'M9ifdEIR3q4020DCwmTtl08fslksj6W-_q3MzJm2tsMvLpwVmAT_ZtZYQQ7-torPq4jTok2mQCNHOw',
  region: REGIONS.BR1,
  matchId: 'BR1_3245657922',
} as const;

export const directRiotOnly = E2E_USE_GATEWAY ? it.skip : it;
export const gatewayUnsupported = E2E_USE_GATEWAY ? it.skip : it;

export function createE2ESamira(region: Region = E2E_ACCOUNT.region): Samira {
  return new Samira({
    apiKey: process.env.RIOT_API_KEY ?? 'gateway-e2e-key',
    region,
    ...(E2E_USE_GATEWAY
      ? {
          baseUrl: E2E_GATEWAY_URL,
          rateLimit: false as const,
          retryOn429: false,
          defaultHeaders: { 'x-airshade-service': 'riot-client-e2e' },
        }
      : {}),
  });
}

export async function waitForRateLimit(client: HttpClient): Promise<void> {
  const status = client.getRateLimitStatus();

  if (!status) {
    return;
  }

  if (!status.canMakeRequest) {
    await new Promise((resolve) => setTimeout(resolve, status.delayUntilNext + 100));
  }

  if (status.requestsInWindow >= 80) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
