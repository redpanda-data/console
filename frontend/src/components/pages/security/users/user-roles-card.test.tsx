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
    expect(screen.getByText('No permissions assigned to this user.')).toBeInTheDocument();
  });

  test('should render Assign Role button in empty state when onChangeRoles is provided', () => {
    const mockOnChangeRoles = vi.fn();
    renderWithFileRoutes(<UserRolesCard onChangeRoles={mockOnChangeRoles} roles={[]} />);

    expect(screen.getByTestId('assign-role-button')).toBeInTheDocument();
  });

  test('should not render Assign Role button in empty state when onChangeRoles is not provided', () => {
    renderWithFileRoutes(<UserRolesCard roles={[]} />);

    expect(screen.queryByTestId('assign-role-button')).not.toBeInTheDocument();
  });

  test('should render roles table with role names', () => {
    renderWithFileRoutes(<UserRolesCard roles={mockRoles} />);

    expect(screen.getByTestId('role-name-admin')).toHaveTextContent('admin');
    expect(screen.getByTestId('role-name-viewer')).toHaveTextContent('viewer');
  });

  test('should render action buttons for each role', () => {
    renderWithFileRoutes(<UserRolesCard roles={mockRoles} />);

    expect(screen.getByTestId('view-role-admin')).toBeInTheDocument();
    expect(screen.getByTestId('view-role-viewer')).toBeInTheDocument();
  });

  test('should render table headers', () => {
    renderWithFileRoutes(<UserRolesCard roles={mockRoles} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('should render Change Role button when roles exist and onChangeRoles is provided', () => {
    const mockOnChangeRoles = vi.fn();
    renderWithFileRoutes(<UserRolesCard onChangeRoles={mockOnChangeRoles} roles={mockRoles} />);

    expect(screen.getByTestId('change-role-button')).toBeInTheDocument();
  });
});
