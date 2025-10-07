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

import { BrowserRouter } from 'react-router-dom';
import { render, screen } from 'test-utils';

import { UserRolesCard } from './UserRolesCard';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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
    render(
      <BrowserRouter>
        <UserRolesCard roles={[]} />
      </BrowserRouter>
    );

    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('No permissions assigned to this user.')).toBeInTheDocument();
  });

  test('should render Assign Role button in empty state when onChangeRoles is provided', () => {
    const mockOnChangeRoles = vi.fn();
    render(
      <BrowserRouter>
        <UserRolesCard onChangeRoles={mockOnChangeRoles} roles={[]} />
      </BrowserRouter>
    );

    expect(screen.getByTestId('assign-role-button')).toBeInTheDocument();
  });

  test('should not render Assign Role button in empty state when onChangeRoles is not provided', () => {
    render(
      <BrowserRouter>
        <UserRolesCard roles={[]} />
      </BrowserRouter>
    );

    expect(screen.queryByTestId('assign-role-button')).not.toBeInTheDocument();
  });

  test('should render roles table with role names', () => {
    render(
      <BrowserRouter>
        <UserRolesCard roles={mockRoles} />
      </BrowserRouter>
    );

    expect(screen.getByTestId('role-name-admin')).toHaveTextContent('admin');
    expect(screen.getByTestId('role-name-viewer')).toHaveTextContent('viewer');
  });

  test('should render action buttons for each role', () => {
    render(
      <BrowserRouter>
        <UserRolesCard roles={mockRoles} />
      </BrowserRouter>
    );

    expect(screen.getByTestId('view-role-admin')).toBeInTheDocument();
    expect(screen.getByTestId('view-role-viewer')).toBeInTheDocument();
  });

  test('should render table headers', () => {
    render(
      <BrowserRouter>
        <UserRolesCard roles={mockRoles} />
      </BrowserRouter>
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('should render Change Role button when roles exist and onChangeRoles is provided', () => {
    const mockOnChangeRoles = vi.fn();
    render(
      <BrowserRouter>
        <UserRolesCard onChangeRoles={mockOnChangeRoles} roles={mockRoles} />
      </BrowserRouter>
    );

    expect(screen.getByTestId('change-role-button')).toBeInTheDocument();
  });
});
