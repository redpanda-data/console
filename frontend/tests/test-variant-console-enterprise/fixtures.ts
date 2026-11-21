import { z } from 'zod';

import { test as base } from '../shared/e2e';

const ports = z
  .record(z.string(), z.number().int().min(1).max(65_535))
  .parse(JSON.parse(process.env.E2E_PORTS_OVERRIDE ?? '{}'));
export const test = base.extend<{ shadowBackendURL: string }>({
  shadowBackendURL: process.env.REACT_APP_SHADOW_ORIGIN ?? `http://localhost:${ports.backendDest ?? 3101}`,
});
