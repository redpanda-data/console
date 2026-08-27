/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render } from '@testing-library/react';

const mockNavigate = rs.fn();
const mockLocation = { pathname: '/topics', searchStr: '' };
const mockRouter = {};

rs.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useRouter: () => mockRouter,
}));

rs.mock('../../config', () => ({
  config: {
    jwt: undefined as string | undefined,
    clusterId: undefined as string | undefined,
  },
  isEmbedded: rs.fn(() => false),
}));

rs.mock('../../hubspot/hubspot.helper', () => ({
  trackHubspotPage: rs.fn(),
}));

rs.mock('../../state/app-global', () => ({
  appGlobal: {
    setNavigate: rs.fn(),
    setRouter: rs.fn(),
    setLocation: rs.fn(),
  },
}));

rs.mock('../../state/backend-api', () => ({
  api: {
    errors: [],
  },
}));

import { RouterSync } from './router-sync';
import { config, isEmbedded } from '../../config';

describe('RouterSync', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    config.jwt = undefined;
    config.clusterId = undefined;
    mockLocation.pathname = '/topics';
  });

  test('does not dispatch [console] navigated events when not embedded', () => {
    const dispatchSpy = rs.spyOn(window, 'dispatchEvent');
    rs.mocked(isEmbedded).mockReturnValue(false);

    render(<RouterSync />);

    const consoleEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === '[console] navigated'
    );
    expect(consoleEvents).toHaveLength(0);

    dispatchSpy.mockRestore();
  });

  test('does not dispatch [console] navigated events in federated mode (clusterId set)', () => {
    const dispatchSpy = rs.spyOn(window, 'dispatchEvent');
    rs.mocked(isEmbedded).mockReturnValue(true);
    config.clusterId = 'test-cluster-123';
    mockLocation.pathname = '/schema-registry';

    render(<RouterSync />);

    const consoleEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === '[console] navigated'
    );
    expect(consoleEvents).toHaveLength(0);

    dispatchSpy.mockRestore();
  });

  test('dispatches [console] navigated events in embedded non-federated mode', () => {
    const dispatchSpy = rs.spyOn(window, 'dispatchEvent');
    rs.mocked(isEmbedded).mockReturnValue(true);
    config.clusterId = undefined;
    mockLocation.pathname = '/schema-registry';

    render(<RouterSync />);

    const consoleEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === '[console] navigated'
    );
    expect(consoleEvents).toHaveLength(1);
    expect((consoleEvents[0][0] as CustomEvent).detail).toBe('/schema-registry');

    dispatchSpy.mockRestore();
  });
});
