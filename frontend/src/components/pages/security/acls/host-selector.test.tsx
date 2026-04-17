/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import userEvent from '@testing-library/user-event';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { HostSelector } from './host-selector';

describe('HostSelector', () => {
  const defaultProps = {
    principalName: 'test-user',
    hosts: [
      { sharedConfig: { principal: 'test-user', host: '192.168.1.1' }, rules: [] },
      { sharedConfig: { principal: 'test-user', host: '192.168.1.2' }, rules: [] },
      { sharedConfig: { principal: 'test-user', host: '192.168.1.3' }, rules: [] },
    ],
    baseUrl: '/security/acls/test-user/details',
  };

  describe('Navigation', () => {
    test('should navigate with correct query parameter when clicking a host row', async () => {
      const user = userEvent.setup();
      const { router } = renderWithFileRoutes(<HostSelector {...defaultProps} />);

      const firstRow = screen.getByTestId('host-selector-row-192.168.1.1');
      await user.click(firstRow);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/security/acls/test-user/details');
        expect(router.state.location.search).toEqual({ host: '192.168.1.1' });
      });
    });

    test('should navigate to different URLs when clicking different hosts', async () => {
      const user = userEvent.setup();
      const { router } = renderWithFileRoutes(<HostSelector {...defaultProps} />);

      // Click first host
      const firstRow = screen.getByTestId('host-selector-row-192.168.1.1');
      await user.click(firstRow);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/security/acls/test-user/details');
        expect(router.state.location.search).toEqual({ host: '192.168.1.1' });
      });

      // Click second host
      const secondRow = screen.getByTestId('host-selector-row-192.168.1.2');
      await user.click(secondRow);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/security/acls/test-user/details');
        expect(router.state.location.search).toEqual({ host: '192.168.1.2' });
      });
    });

    test('should properly handle host values with special characters', async () => {
      const propsWithSpecialChars = {
        ...defaultProps,
        hosts: [
          { sharedConfig: { principal: 'test-user', host: 'host@example.com' }, rules: [] },
          { sharedConfig: { principal: 'test-user', host: '*.domain.com' }, rules: [] },
          { sharedConfig: { principal: 'test-user', host: 'host with spaces' }, rules: [] },
        ],
      };

      const user = userEvent.setup();
      const { router } = renderWithFileRoutes(<HostSelector {...propsWithSpecialChars} />);

      const row = screen.getByTestId('host-selector-row-host@example.com');
      await user.click(row);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/security/acls/test-user/details');
        expect(router.state.location.search).toEqual({ host: 'host@example.com' });
      });
    });

    test('should use provided baseUrl correctly', async () => {
      const customBaseUrl = '/security/roles/my-role/details';
      const customProps = {
        ...defaultProps,
        baseUrl: customBaseUrl,
      };

      const user = userEvent.setup();
      const { router } = renderWithFileRoutes(<HostSelector {...customProps} />);

      const row = screen.getByTestId('host-selector-row-192.168.1.1');
      await user.click(row);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/security/roles/my-role/details');
        expect(router.state.location.search).toEqual({ host: '192.168.1.1' });
      });
    });
  });
});
