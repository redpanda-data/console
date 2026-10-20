import { test as base } from '../shared/e2e';

const ports = JSON.parse(process.env.E2E_PORTS_OVERRIDE ?? '{}') as Record<string, number>;
export const test = base.extend<{ shadowBackendURL: string }>({
  shadowBackendURL: process.env.REACT_APP_SHADOW_ORIGIN ?? `http://localhost:${ports.backendDest ?? 3101}`,
});

export { expect } from '../shared/e2e';
