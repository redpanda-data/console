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

    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ACL' })).toBeInTheDocument();
  });

  test('should render empty state when acls is undefined', () => {
    renderWithFileRoutes(<UserAclsCard acls={undefined} />);

    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
  });

  test('should render ACL table grouped by principal and host', () => {
    renderWithFileRoutes(<UserAclsCard acls={mockAcls} />);

    // Table headers
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Hosts' })).toBeInTheDocument();

    // Two rows, one per ACL group (principal+host)
    expect(screen.getAllByText('User:test-user')).toHaveLength(2);

    // Host values
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
  });
});
