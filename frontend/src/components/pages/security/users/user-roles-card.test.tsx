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

import { renderWithFileRoutes, screen } from 'test-utils';

import { UserRolesCard } from './user-roles-card';

const mockRoles = [
  {
    principalType: 'RedpandaRole',
    principalName: 'admin',
  },
  {
    principalType: 'RedpandaRole',
    principalName: 'viewer',
  },
];

describe('UserRolesCard', () => {
  test('should render empty state when no roles provided', () => {
    renderWithFileRoutes(<UserRolesCard roles={[]} />);

    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('No roles assigned')).toBeInTheDocument();
  });

  test('should render Assign Role combobox in empty state when userName is provided', () => {
    renderWithFileRoutes(<UserRolesCard roles={[]} userName="test-user" />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('should not render Assign Role button in empty state when onChangeRoles is not provided', () => {
    renderWithFileRoutes(<UserRolesCard roles={[]} />);

    expect(screen.queryByTestId('assign-role-button')).not.toBeInTheDocument();
  });

  test('should render roles table with role names and action buttons', () => {
    renderWithFileRoutes(<UserRolesCard roles={mockRoles} />);

    // Role names
    expect(screen.getByTestId('role-name-admin')).toHaveTextContent('admin');
    expect(screen.getByTestId('role-name-viewer')).toHaveTextContent('viewer');

    // Action buttons per row
    expect(screen.getByTestId('view-role-admin')).toBeInTheDocument();
    expect(screen.getByTestId('view-role-viewer')).toBeInTheDocument();
  });

  test('should render Assign Role combobox when roles exist and userName is provided', () => {
    renderWithFileRoutes(<UserRolesCard roles={mockRoles} userName="test-user" />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
