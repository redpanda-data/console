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
import type { AclDetail } from '../acls/new-acl/ACL.model';
import { UserAclsCard } from './UserAclsCard';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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
    render(
      <BrowserRouter>
        <UserAclsCard acls={[]} />
      </BrowserRouter>,
    );

    expect(screen.getByText('ACLs (0)')).toBeInTheDocument();
    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ACL' })).toBeInTheDocument();
  });

  test('should render empty state when acls is undefined', () => {
    render(
      <BrowserRouter>
        <UserAclsCard acls={undefined} />
      </BrowserRouter>,
    );

    expect(screen.getByText('ACLs (0)')).toBeInTheDocument();
    expect(screen.getByText('No ACLs assigned to this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ACL' })).toBeInTheDocument();
  });

  test('should render ACL table with correct count', () => {
    render(
      <BrowserRouter>
        <UserAclsCard acls={mockAcls} />
      </BrowserRouter>,
    );

    expect(screen.getByText('ACLs (2)')).toBeInTheDocument();
  });

  test('should render ACL rows with principal and host', () => {
    render(
      <BrowserRouter>
        <UserAclsCard acls={mockAcls} />
      </BrowserRouter>,
    );

    expect(screen.getByTestId('acl-principal-User:test-user-*')).toHaveTextContent('User:test-user');
    expect(screen.getByTestId('acl-principal-User:test-user-192.168.1.1')).toHaveTextContent('User:test-user');
    expect(screen.getByTestId('acl-host-*')).toHaveTextContent('*');
    expect(screen.getByTestId('acl-host-192.168.1.1')).toHaveTextContent('192.168.1.1');
  });

  test('should render action buttons for each ACL', () => {
    render(
      <BrowserRouter>
        <UserAclsCard acls={mockAcls} />
      </BrowserRouter>,
    );

    expect(screen.getByTestId('view-acl-User:test-user-*')).toBeInTheDocument();
    expect(screen.getByTestId('view-acl-User:test-user-192.168.1.1')).toBeInTheDocument();
  });

  test('should render table headers', () => {
    render(
      <BrowserRouter>
        <UserAclsCard acls={mockAcls} />
      </BrowserRouter>,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Hosts')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
