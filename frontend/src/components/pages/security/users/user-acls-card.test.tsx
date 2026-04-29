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
import type { AclDetail } from '../shared/acl-model';

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

    expect(screen.getByText('No ACLs assigned.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add ACL' })).toBeInTheDocument();
  });

  test('should render empty state when acls is undefined', () => {
    renderWithFileRoutes(<UserAclsCard acls={undefined} />);

    expect(screen.getByText('No ACLs assigned.')).toBeInTheDocument();
  });

  test('should render flat ACL table with correct row count and data', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    // Resource types
    expect(screen.getAllByText('Topic')).toHaveLength(2);
    expect(screen.getByText('Cluster')).toBeInTheDocument();

    // Resource names
    expect(screen.getAllByText('test-topic')).toHaveLength(2);
    expect(screen.getByText('kafka-cluster')).toBeInTheDocument();

    // Operations
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText('Describe')).toBeInTheDocument();

    // Permissions
    expect(screen.getAllByText('Allow')).toHaveLength(3);

    // Hosts
    expect(screen.getAllByText('*')).toHaveLength(2);
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
  });
});
