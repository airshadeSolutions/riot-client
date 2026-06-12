// Thin riot-gateway transport — its only job is forwarding Riot requests to the
// gateway in PATH mode and returning the raw payload. No API key, no client-side
// rate limiting, no schema validation, no retries.
export {
  RiotGatewayClient,
  type RiotGatewayClientConfig,
  type GatewayResult,
  type GatewayFailure,
} from './gateway';

// Lightweight response types for the convenience helpers (not runtime-validated).
export * from './types';

// Routing values, endpoint paths and enums.
export * from './constants';
