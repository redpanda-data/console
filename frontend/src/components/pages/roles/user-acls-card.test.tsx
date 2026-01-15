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

import { UserAclsCard } from './user-acls-card';
import type { AclDetail } from '../acls/new-acl/acl.model';

const mockAcls: AclDetail[] = [
  {
    sharedConfig: {
      principal: 'User:test-user',
      host: '*',
    },
    rules: [
      {
        id: 1,
        resourceType: 'topic',
        mode: 'custom',
        selectorType: 'literal',
        selectorValue: 'test-topic',
        operations: {
          READ: 'allow',
          WRITE: 'allow',
        },
      },
    ],
  },
  {
    sharedConfig: {
      principal: 'User:test-user',
      host: '192.168.1.1',
    },
    rules: [
      {
        id: 2,
        resourceType: 'cluster',
        mode: 'custom',
        selectorType: 'any',
        selectorValue: '',
        operations: {
          DESCRIBE: 'allow',
        },
      },
    ],
  },
];

describe('UserAclsCard', () => {
  test('should render empty state when no ACLs provided', () => {
    renderWithFileRoutes(<UserAclsCard acls={[]} />);

    expect(screen.getByText('ACLs (0)')).toBeInTheDocument();
    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ACL' })).toBeInTheDocument();
  });

  test('should render empty state when acls is undefined', () => {
    renderWithFileRoutes(<UserAclsCard acls={undefined} />);

    expect(screen.getByText('ACLs (0)')).toBeInTheDocument();
    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ACL' })).toBeInTheDocument();
  });

  test('should render ACL table with correct count', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    expect(screen.getByText('ACLs (2)')).toBeInTheDocument();
  });

  test('should render ACL rows with principal and host', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    expect(screen.getByTestId('acl-principal-User:test-user-*')).toHaveTextContent('User:test-user');
    expect(screen.getByTestId('acl-principal-User:test-user-192.168.1.1')).toHaveTextContent('User:test-user');
    expect(screen.getByTestId('acl-host-*')).toHaveTextContent('*');
    expect(screen.getByTestId('acl-host-192.168.1.1')).toHaveTextContent('192.168.1.1');
  });

  test('should render action buttons for each ACL', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    // Check toggle buttons
    expect(screen.getByTestId('toggle-acl-User:test-user-*')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-acl-User:test-user-192.168.1.1')).toBeInTheDocument();

    // Check edit buttons
    expect(screen.getByTestId('edit-acl-User:test-user-*')).toBeInTheDocument();
    expect(screen.getByTestId('edit-acl-User:test-user-192.168.1.1')).toBeInTheDocument();
  });

  test('should render table headers', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Hosts')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
