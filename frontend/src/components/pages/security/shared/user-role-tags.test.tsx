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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockRoleMembers, mockListACLsFilter } = rs.hoisted(() => ({
  mockRoleMembers: new Map<string, { name: string; principalType: string }[]>(),
  mockListACLsFilter: { captured: null as { principal: string } | null },
}));

rs.mock('@connectrpc/connect-query', () => ({
  useQuery: (_schema: unknown, input: { filter?: { principal: string } }, _opts: unknown) => {
    if (input?.filter) {
      mockListACLsFilter.captured = input.filter;
    }
    return { data: false };
  },
}));

rs.mock('@tanstack/react-router', () => ({
  // Real navigate() returns a promise that settles once the route commits.
  useNavigate: () => rs.fn(() => Promise.resolve()),
}));

rs.mock('components/redpanda-ui/components/tags', () => ({
  TagsValue: MockTagsValue,
}));

rs.mock('../../../../state/backend-api', () => ({
  rolesApi: {
    get roleMembers() {
      return mockRoleMembers;
    },
  },
}));

rs.mock('../../../../state/supported-features', () => ({
  useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) => selector({ rolesApi: true }),
}));

import { UserRoleTags } from './user-role-tags';

describe('the UserRoleTags', () => {
  beforeEach(() => {
    mockRoleMembers.clear();
    mockListACLsFilter.captured = null;
  });

  test('user principal queries ACLs with User: prefix', () => {
    render(<UserRoleTags userName="alice" />);

    expect(mockListACLsFilter.captured).toEqual(expect.objectContaining({ principal: 'User:alice' }));
  });

  test('group principal queries ACLs with Group: prefix', () => {
    render(<UserRoleTags principalType="Group" userName="engineering" />);

    expect(mockListACLsFilter.captured).toEqual(expect.objectContaining({ principal: 'Group:engineering' }));
  });

  test('user principal shows role memberships for User members', () => {
    mockRoleMembers.set('viewer', [{ name: 'alice', principalType: 'User' }]);

    render(<UserRoleTags userName="alice" />);

    expect(screen.getByText('RedpandaRole:viewer')).toBeInTheDocument();
  });

  test('group principal does NOT show roles that contain a User with the same name', () => {
    // Role has a User member named "engineering" — should NOT match Group:engineering
    mockRoleMembers.set('admin', [{ name: 'engineering', principalType: 'User' }]);

    render(<UserRoleTags principalType="Group" userName="engineering" />);

    expect(screen.queryByText('RedpandaRole:admin')).not.toBeInTheDocument();
  });

  test('group principal shows roles that contain a Group member with matching name', () => {
    // Role has a Group member named "engineering" — SHOULD match
    mockRoleMembers.set('admin', [{ name: 'engineering', principalType: 'Group' }]);

    render(<UserRoleTags principalType="Group" userName="engineering" />);

    expect(screen.getByText('RedpandaRole:admin')).toBeInTheDocument();
  });

  test('defaults principalType to User when not specified', () => {
    mockRoleMembers.set('viewer', [{ name: 'bob', principalType: 'User' }]);

    render(<UserRoleTags userName="bob" />);

    expect(mockListACLsFilter.captured).toEqual(expect.objectContaining({ principal: 'User:bob' }));
    expect(screen.getByText('RedpandaRole:viewer')).toBeInTheDocument();
  });
});

function MockTagsValue({ children, ...props }: { children: ReactNode; [key: string]: unknown }) {
  return (
    <span data-testid="tag" {...props}>
      {children}
    </span>
  );
}
