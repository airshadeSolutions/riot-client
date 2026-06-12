import { beforeEach, vi } from 'vitest';

// The gateway client uses the global fetch; tests stub it per-case.
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});
