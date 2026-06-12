import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { RateLimiter } from './rateLimiter';
import { Either, left, right } from '../types/either';
import { ENDPOINTS, type Platform, type Region } from '../constants';

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerTwoMinutes: number;
}

export interface HttpClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  /**
   * Built-in client-side rate limiter. Pass `false` to disable it entirely
   * (e.g. when requests go through a gateway that owns rate limiting).
   * Defaults to `{ requestsPerSecond: 20, requestsPerTwoMinutes: 100 }`.
   */
  rateLimit?: false | RateLimitConfig | undefined;
  /**
   * Whether to transparently retry once on an upstream 429 (honoring
   * Retry-After). Defaults to `true`. Set `false` behind a gateway that already
   * handles queuing/retries, to avoid double retries.
   */
  retryOn429?: boolean | undefined;
  /**
   * Default priority for every request from this client. When `'high'`, a
   * `x-priority: high` header is sent (used by the riot-gateway priority queue).
   */
  priority?: 'high' | 'normal' | undefined;
  /** Extra headers merged into every request from this client. */
  defaultHeaders?: Record<string, string> | undefined;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ApiError {
  status: number;
  statusText: string;
  message: string;
  details?: any;
  headers?: Record<string, string>;
}

export class HttpClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter | null;
  private config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;

    // Rate limiter is optional — `rateLimit: false` disables it entirely.
    this.rateLimiter =
      config.rateLimit === false
        ? null
        : new RateLimiter(config.rateLimit ?? { requestsPerSecond: 20, requestsPerTwoMinutes: 100 });

    const headers: Record<string, string> = {
      'X-Riot-Token': config.apiKey ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.defaultHeaders,
    };
    if (config.priority === 'high') {
      headers['x-priority'] = 'high';
    }

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
      headers,
    });

    // Add request interceptor for rate limiting (skipped when disabled)
    if (this.rateLimiter) {
      const limiter = this.rateLimiter;
      this.client.interceptors.request.use(
        async (config) => {
          await limiter.waitForNextRequest();
          limiter.recordRequest();
          return config;
        },
        (error) => {
          return Promise.reject(error);
        },
      );
    }

    // Add response interceptor for error handling
    const retryOn429 = config.retryOn429 ?? true;
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        if (retryOn429 && error.response?.status === 429) {
          // Rate limit exceeded, wait and retry
          const retryAfter = error.response.headers['retry-after'];
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Retry the request
          if (error.config) {
            return this.client.request(error.config);
          }
        }

        return Promise.reject(this.formatError(error));
      },
    );
  }

  /**
   * Make a GET request
   */
  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<ApiError, ApiResponse<T>>> {
    try {
      const response = await this.client.get<T>(url, config);
      return right(this.formatResponse(response));
    } catch (error) {
      // Check if error is already an ApiError (from response interceptor)
      if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
        return left(error as ApiError);
      }
      // Otherwise, format the Axios error
      return left(this.formatError(error as AxiosError));
    }
  }

  /**
   * Make a GET request with retry logic
   */
  async requestWithRetry<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<ApiError, ApiResponse<T>>> {
    let lastError: ApiError;
    const maxRetries = this.config.retries || 3;
    const retryDelay = this.config.retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.get<T>(url, config);

      if (result.isRight()) {
        return result;
      }

      lastError = result.value;

      // Don't retry on client errors (4xx) except rate limiting
      if (lastError.status >= 400 && lastError.status < 500 && lastError.status !== 429) {
        return result;
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
    }

    return left(lastError!);
  }

  /**
   * Update the API key
   */
  updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.client.defaults.headers['X-Riot-Token'] = apiKey;
  }

  /**
   * Update the base URL
   */
  updateBaseURL(baseURL: string): void {
    this.config.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Get rate limiter status. Returns null when the limiter is disabled.
   */
  getRateLimitStatus() {
    return this.rateLimiter ? this.rateLimiter.getStatus() : null;
  }

  /**
   * Reset rate limiter. No-op when the limiter is disabled.
   */
  resetRateLimiter(): void {
    this.rateLimiter?.reset();
  }

  /**
   * Format axios response to our standard format
   */
  private formatResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
    };
  }

  /**
   * Format axios error to our standard format
   */
  private formatError(error: AxiosError): ApiError {
    if (error.response) {
      const responseData = error.response.data as any;

      // Handle nested status structure from Riot Games API
      let status = error.response.status;
      let statusText = error.response.statusText;
      let message = this.getErrorMessage(status);

      if (responseData?.status) {
        // Check if status is an object with status_code (Riot Games API format)
        if (typeof responseData.status === 'object' && responseData.status.status_code) {
          status = responseData.status.status_code;
          message = responseData.status.message || message;
        } else if (typeof responseData.status === 'number') {
          // Direct status number
          status = responseData.status;
        }
      }

      // Use response data values if available
      if (typeof responseData === 'string' && responseData.trim()) {
        message = responseData;
      }
      if (responseData?.statusText) {
        statusText = responseData.statusText;
      }
      if (responseData?.message && typeof responseData.message === 'string') {
        message = responseData.message;
      }

      return {
        status,
        statusText,
        message,
        details: error.response.data,
        headers: error.response.headers as Record<string, string>,
      };
    } else if (error.request) {
      // Request was made but no response received
      return {
        status: 0,
        statusText: 'No Response',
        message: 'No response received from server',
        details: error.request,
      };
    } else {
      // Something else happened
      return {
        status: 0,
        statusText: 'Request Error',
        message: error.message || 'An error occurred while setting up the request',
        details: error,
      };
    }
  }

  /**
   * Get user-friendly error messages for common HTTP status codes
   */
  private getErrorMessage(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request - Invalid parameters provided';
      case 401:
        return 'Unauthorized - Invalid API key';
      case 403:
        return 'Forbidden - API key does not have access to this endpoint';
      case 404:
        return 'Not Found - The requested resource was not found';
      case 429:
        return 'Too Many Requests - Rate limit exceeded';
      case 500:
        return 'Internal Server Error - Riot Games server error';
      case 502:
        return 'Bad Gateway - Riot Games server is down';
      case 503:
        return 'Service Unavailable - Riot Games service is temporarily unavailable';
      case 504:
        return 'Gateway Timeout - Riot Games server timeout';
      default:
        return `HTTP Error ${status}`;
    }
  }
}

/**
 * Extra options threaded from SamiraConfig into the platform/regional clients.
 * When `gatewayBaseUrl` is set, requests are routed in PATH mode through it:
 * `${gatewayBaseUrl}/${platform}/<riot-path>` instead of the direct Riot host.
 */
export interface ClientRoutingOptions {
  gatewayBaseUrl?: string | undefined;
  rateLimit?: false | RateLimitConfig | undefined;
  retryOn429?: boolean | undefined;
  priority?: 'high' | 'normal' | undefined;
  defaultHeaders?: Record<string, string> | undefined;
}

function resolveBaseURL(routingValue: string, gatewayBaseUrl?: string): string {
  return gatewayBaseUrl
    ? `${gatewayBaseUrl.replace(/\/$/, '')}/${routingValue}`
    : `https://${routingValue}.api.riotgames.com`;
}

/**
 * Create an HTTP client for a specific platform
 */
export function createPlatformClient(
  platform: Platform,
  apiKey: string,
  opts: ClientRoutingOptions = {},
): HttpClient {
  return new HttpClient({
    baseURL: resolveBaseURL(platform, opts.gatewayBaseUrl),
    apiKey,
    rateLimit: opts.rateLimit,
    retryOn429: opts.retryOn429,
    priority: opts.priority,
    defaultHeaders: opts.defaultHeaders,
  });
}

/**
 * Create an HTTP client for regional routing
 */
export function createRegionalClient(
  region: Region,
  apiKey: string,
  opts: ClientRoutingOptions = {},
): HttpClient {
  return new HttpClient({
    baseURL: resolveBaseURL(region, opts.gatewayBaseUrl),
    apiKey,
    rateLimit: opts.rateLimit,
    retryOn429: opts.retryOn429,
    priority: opts.priority,
    defaultHeaders: opts.defaultHeaders,
  });
}

export function createDataDragonClient(): HttpClient {
  return new HttpClient({
    baseURL: ENDPOINTS.DATA_DRAGON,
  });
}
