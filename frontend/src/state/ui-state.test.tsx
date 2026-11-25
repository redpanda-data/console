import { afterEach, describe, expect, test } from '@rstest/core';

import { uiState, useUIStateStore } from './ui-state';

const initialState = useUIStateStore.getState();

afterEach(() => useUIStateStore.setState(initialState, true));

describe('legacy UI state view', () => {
  test('reads fresh state and routes direct writes through store actions', () => {
    useUIStateStore.getState().setLoginError('Initial error');
    expect(uiState.loginError).toBe('Initial error');
    uiState.loginError = null;
    expect(useUIStateStore.getState().loginError).toBeNull();
  });

  test('routes navigation and server metadata writes through store actions', () => {
    uiState.pageTitle = 'Topics';
    expect(useUIStateStore.getState()._pageTitle).toBe('Topics');
    uiState.pageBreadcrumbs = [{ title: 'Topics', linkTo: '/topics' }];
    expect(useUIStateStore.getState().pageBreadcrumbs).toStrictEqual([{ title: 'Topics', linkTo: '/topics' }]);
    uiState.backLink = { title: 'Back', linkTo: '/' };
    expect(useUIStateStore.getState().backLink).toStrictEqual({ title: 'Back', linkTo: '/' });
    uiState.serverBuildTimestamp = 123;
    expect(useUIStateStore.getState().serverBuildTimestamp).toBe(123);
  });

  test('ignores unknown and read-only writes without exposing store action keys', () => {
    const selectedClusterName = uiState.selectedClusterName;
    expect(Reflect.set(uiState, 'selectedClusterName', 'other')).toBe(true);
    expect(uiState.selectedClusterName).toBe(selectedClusterName);
    expect(Reflect.set(uiState, 'unexpected', 'ignored')).toBe(true);
    expect(Reflect.get(uiState, 'unexpected')).toBeUndefined();
    expect(Object.keys(uiState)).toStrictEqual([]);
  });
});
