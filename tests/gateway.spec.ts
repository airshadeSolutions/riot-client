import { describe, it, expect, vi } from 'vitest';
import { RiotGatewayClient } from '../src/gateway';
import { regionToPlatform } from '../src/constants';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.headers ?? new Headers(),
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response;
}

function client() {
  return new RiotGatewayClient({ baseUrl: 'http://gw:8001/', serviceName: 'riot-test' });
}

describe('RiotGatewayClient', () => {
  it('builds PATH-mode URLs and sends the service header, no API key', async () => {
    fetchMock.mockResolvedValue(jsonResponse(['EUW1_1']));

    const res = await client().getMatchIds('europe', 'puuid-1', { count: 5, queue: 420 });

    expect(res).toEqual({ ok: true, data: ['EUW1_1'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'http://gw:8001/europe/lol/match/v5/matches/by-puuid/puuid-1/ids?count=5&queue=420',
    );
    expect(init.headers['x-airshade-service']).toBe('riot-test');
    expect(init.headers).not.toHaveProperty('X-Riot-Token');
  });

  it('omits undefined query params', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await client().getMatchIds('europe', 'p', { count: 10, queue: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://gw:8001/europe/lol/match/v5/matches/by-puuid/p/ids?count=10',
    );
  });

  it('url-encodes path segments', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await client().getMatch('europe', 'EUW1/evil');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://gw:8001/europe/lol/match/v5/matches/EUW1%2Fevil',
    );
  });

  it('sends x-priority: high only when configured', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const hi = new RiotGatewayClient({ baseUrl: 'http://gw', serviceName: 's', priority: 'high' });
    await hi.getMatch('europe', 'm');
    expect(fetchMock.mock.calls[0][1].headers['x-priority']).toBe('high');
  });

  it('surfaces 429 with retryAfterSeconds from Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse('rate limited', {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '7' }),
      }),
    );

    const res = await client().getMatch('europe', 'm');
    expect(res).toEqual({ ok: false, status: 429, message: 'rate limited', retryAfterSeconds: 7 });
  });

  it('returns a failure (not throw) on network errors', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });
    const res = await client().getMatch('europe', 'm');
    expect(res).toEqual({ ok: false, status: 0, message: 'ECONNREFUSED' });
  });

  it('reports invalid JSON as 502', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response);

    const res = await client().getMatch('europe', 'm');
    expect(res).toEqual({ ok: false, status: 502, message: 'Invalid JSON from gateway' });
  });
});

describe('regionToPlatform', () => {
  it('maps platforms to clusters', () => {
    expect(regionToPlatform('euw1')).toBe('europe');
    expect(regionToPlatform('na1')).toBe('americas');
    expect(regionToPlatform('kr')).toBe('asia');
    expect(regionToPlatform('oc1')).toBe('sea');
  });
});
