/**
 * Shared mock factories for TanStack Router + ConnectRPC route tests.
 *
 * Gives Console tests one place to stub
 * `createFileRoute`, `Link`, and common connect-query helpers without
 * repeating the same boilerplate across every route integration spec.
 *
 * Usage — pass the return value of a factory straight into `rs.mock`:
 *
 *   rs.mock('@tanstack/react-router', () => mockRouterForListRoute());
 *   rs.mock('@connectrpc/connect-query', () => mockConnectQuery());
 */

import { rs } from '@rstest/core';
import React from 'react';

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
    callUnaryMethod: rs.fn(),
    createConnectQueryKey: rs.fn(() => ['mock-key']),
  };
}

/**
 * Extract the component from a mocked TanStack Router route. `rs.mock`
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
