/**
 * Shared mock factories for Vitest browser mode tests.
 *
 * Mirrors apps/adp-ui/src/__tests__/browser-test-utils.tsx so console
 * visual regression tests follow the same patterns as ADP UI.
 */
import { MotionConfig } from 'motion/react';
import React from 'react';
import { vi } from 'vitest';

function StubLink({ children, to, ...props }: { children: React.ReactNode; to: string }) {
  return React.createElement('a', { href: to, ...props }, children);
}

export function mockRouterForBrowserTest() {
  return {
    createFileRoute:
      (path: string) =>
      <T extends { component?: React.ComponentType }>(opts: T) => ({ ...opts, fullPath: path }),
    Link: StubLink,
    useLocation: () => ({ pathname: '/', search: '', hash: '' }),
    useNavigate: () => vi.fn(),
    getRouteApi: () => ({
      useRouteContext: ({ select }: { select: (ctx: Record<string, unknown>) => unknown }) =>
        select({ gatewayUrl: 'http://localhost:8090' }),
    }),
  };
}

export function mockConnectQuery() {
  return {
    callUnaryMethod: vi.fn(),
    createConnectQueryKey: vi.fn(() => ['mock-key']),
  };
}

/** Extract the component from a mocked TanStack Router route (vi.mock swaps the real type at runtime). */
export function getRouteComponent(route: unknown): React.ComponentType {
  const r = route as { component?: React.ComponentType };
  if (!r.component) {
    throw new Error('Route mock missing component');
  }
  return r.component;
}

/** Wrapper with stable dimensions so screenshots are deterministic regardless of viewport size. */
export function ScreenshotFrame({ children, width = 1200 }: { children: React.ReactNode; width?: number }) {
  return (
    <MotionConfig reducedMotion="always">
      <div data-testid="screenshot-frame" style={{ display: 'inline-block', width, padding: 24 }}>
        {children}
      </div>
    </MotionConfig>
  );
}
