import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';

import { appGlobal } from './app-global';
import { api } from './backend-api';
import { uiState } from './ui-state';

const navigate = rs.fn<(to: string, options?: { replace?: boolean }) => void>();

beforeEach(() => {
  navigate.mockClear();
  appGlobal.setNavigate(navigate);
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/before/'] }),
  });
  appGlobal.setLocation(router.latestLocation);
  uiState.pathName = '/before/';
  api.errors = [new Error('Stale API error')];
});

describe('imperative application navigation', () => {
  test('updates the path and clears API errors before pushing', () => {
    appGlobal.historyPush('/after');
    expect(uiState.pathName).toBe('/after');
    expect(api.errors).toStrictEqual([]);
    expect(navigate).toHaveBeenCalledWith('/after');
  });
  test('preserves replace semantics', () => {
    appGlobal.historyReplace('/after');
    expect(uiState.pathName).toBe('/after');
    expect(api.errors).toStrictEqual([]);
    expect(navigate).toHaveBeenCalledWith('/after', { replace: true });
  });
  test('does not clear errors or notify a host for the same normalized path', () => {
    appGlobal.historyPush('/before');
    appGlobal.historyReplace('/before///');
    expect(uiState.pathName).toBe('/before/');
    expect(api.errors).toHaveLength(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
