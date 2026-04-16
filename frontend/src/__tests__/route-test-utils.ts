/**
 * Shared mock factories for TanStack Router + ConnectRPC route tests.
 *
 * Ported from apps/adp-ui to give console tests one place to stub
 * `createFileRoute`, `Link`, and common connect-query helpers without
 * repeating the same boilerplate across every route integration spec.
 *
 * Usage — pass the return value of a factory straight into `vi.mock`:
 *
 *   vi.mock('@tanstack/react-router', () => mockRouterForListRoute());
 *   vi.mock('@connectrpc/connect-query', () => mockConnectQuery());
 */
import React from 'react';
import { vi } from 'vitest';

// ── Router mocks ────────────────────────────────────────────────────

/** Link stub shared across all router mock variants. */
function StubLink({ children, to, ...props }: { children: React.ReactNode; to: string }) {
  return React.createElement('a', { href: to, ...props }, children);
}

/**
 * Router mock for **index** (list) routes.
 * Provides `createFileRoute` (passthrough) and `Link`.
 */
export function mockRouterForListRoute() {
  return {
    createFileRoute: () => (opts: Record<string, unknown>) => opts,
    Link: StubLink,
  };
}

// ── Connect-query mocks ─────────────────────────────────────────────

/**
 * Standard `@connectrpc/connect-query` mock for list routes that use
 * `callUnaryMethod` and `createConnectQueryKey`.
 */
export function mockConnectQuery() {
  return {
    callUnaryMethod: vi.fn(),
    createConnectQueryKey: vi.fn(() => ['mock-key']),
  };
}

/**
 * Extract the component from a mocked TanStack Router route. `vi.mock`
 * swaps the real type at runtime, so we reach in defensively and throw
 * a helpful error if the mock shape is wrong.
 */
export function getRouteComponent(route: unknown): React.ComponentType {
  const r = route as { component?: React.ComponentType };
  if (!r.component) {
    throw new Error('Route mock missing component');
  }
  return r.component;
}
