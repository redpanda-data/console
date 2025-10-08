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

import { fireEvent, renderWithRouter, screen, waitFor } from 'test-utils';

import { HostSelector } from './host-selector';

const mockNavigate = vi.fn();
const mockSearchParams = new URLSearchParams();
const MULTIPLE_HOSTS_PATTERN = /principal has ACLs configured for multiple hosts/i;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams],
  };
});

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

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Rendering', () => {
    test('should render card with title, description, and all host rows', () => {
      renderWithRouter(<HostSelector {...defaultProps} />);

      // Verify title
      expect(screen.getByText('Multiple Hosts Found')).toBeVisible();

      // Verify principal name and description
      expect(screen.getByTestId('host-selector-principal-name')).toBeVisible();
      expect(screen.getByTestId('host-selector-principal-name')).toHaveTextContent('test-user');
      expect(screen.getByTestId('host-selector-description')).toBeVisible();
      expect(screen.getByTestId('host-selector-description')).toHaveTextContent(MULTIPLE_HOSTS_PATTERN);

      // Verify all host values are visible
      expect(screen.getByText('192.168.1.1')).toBeVisible();
      expect(screen.getByText('192.168.1.2')).toBeVisible();
      expect(screen.getByText('192.168.1.3')).toBeVisible();

      // Verify each host has a row using testIds
      expect(screen.getByTestId('host-selector-row-192.168.1.1')).toBeVisible();
      expect(screen.getByTestId('host-selector-row-192.168.1.2')).toBeVisible();
      expect(screen.getByTestId('host-selector-row-192.168.1.3')).toBeVisible();
    });
  });

  describe('Table structure', () => {
    test('should render table headers and display principal name and host value in each row', () => {
      renderWithRouter(<HostSelector {...defaultProps} />);

      // Verify table headers
      expect(screen.getByText('Principal')).toBeVisible();
      expect(screen.getByText('Host')).toBeVisible();

      // Check that each host has a corresponding principal name and host value with testIds
      for (const host of defaultProps.hosts) {
        const hostValue = host.sharedConfig.host;
        expect(screen.getByTestId(`host-selector-principal-${hostValue}`)).toBeVisible();
        expect(screen.getByTestId(`host-selector-principal-${hostValue}`)).toHaveTextContent('test-user');
        expect(screen.getByTestId(`host-selector-host-${hostValue}`)).toBeVisible();
        expect(screen.getByTestId(`host-selector-host-${hostValue}`)).toHaveTextContent(hostValue);
      }
    });
  });

  describe('Navigation', () => {
    test('should navigate with correct query parameter when clicking a host row', async () => {
      renderWithRouter(<HostSelector {...defaultProps} />);

      const firstRow = screen.getByTestId('host-selector-row-192.168.1.1');
      fireEvent.click(firstRow);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/security/acls/test-user/details?host=192.168.1.1');
      });
    });

    test('should navigate to different URLs when clicking different hosts', async () => {
      renderWithRouter(<HostSelector {...defaultProps} />);

      // Click first host
      const firstRow = screen.getByTestId('host-selector-row-192.168.1.1');
      fireEvent.click(firstRow);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/security/acls/test-user/details?host=192.168.1.1');
      });

      // Click second host
      const secondRow = screen.getByTestId('host-selector-row-192.168.1.2');
      fireEvent.click(secondRow);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/security/acls/test-user/details?host=192.168.1.2');
      });
    });

    test('should properly encode host values with special characters', async () => {
      const propsWithSpecialChars = {
        ...defaultProps,
        hosts: [
          { sharedConfig: { principal: 'test-user', host: 'host@example.com' }, rules: [] },
          { sharedConfig: { principal: 'test-user', host: '*.domain.com' }, rules: [] },
          { sharedConfig: { principal: 'test-user', host: 'host with spaces' }, rules: [] },
        ],
      };

      renderWithRouter(<HostSelector {...propsWithSpecialChars} />);

      const row = screen.getByTestId('host-selector-row-host@example.com');
      fireEvent.click(row);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/security/acls/test-user/details?host=host%40example.com');
      });
    });

    test('should use provided baseUrl correctly', async () => {
      const customBaseUrl = '/security/roles/my-role/details';
      const customProps = {
        ...defaultProps,
        baseUrl: customBaseUrl,
      };

      renderWithRouter(<HostSelector {...customProps} />);

      const row = screen.getByTestId('host-selector-row-192.168.1.1');
      fireEvent.click(row);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/security/roles/my-role/details?host=192.168.1.1');
      });
    });
  });

  describe('Edge cases', () => {
    test('should render with single host', () => {
      const singleHostProps = {
        ...defaultProps,
        hosts: [{ sharedConfig: { principal: 'test-user', host: '192.168.1.1' }, rules: [] }],
      };

      renderWithRouter(<HostSelector {...singleHostProps} />);

      expect(screen.getByTestId('host-selector-row-192.168.1.1')).toBeVisible();
      expect(screen.getByTestId('host-selector-host-192.168.1.1')).toHaveTextContent('192.168.1.1');
    });

    test('should render with many hosts', () => {
      const manyHostsProps = {
        ...defaultProps,
        hosts: Array.from({ length: 10 }, (_, i) => ({
          sharedConfig: { principal: 'test-user', host: `192.168.1.${i + 1}` },
          rules: [],
        })),
      };

      renderWithRouter(<HostSelector {...manyHostsProps} />);

      // Verify first and last host are present
      expect(screen.getByTestId('host-selector-row-192.168.1.1')).toBeVisible();
      expect(screen.getByTestId('host-selector-row-192.168.1.10')).toBeVisible();

      // Verify all 10 rows exist
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByTestId(`host-selector-row-192.168.1.${i}`)).toBeVisible();
      }
    });
  });
});
