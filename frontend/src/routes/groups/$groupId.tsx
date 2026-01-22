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

import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { useCallback } from 'react';
import { z } from 'zod';

import GroupDetails from '../../components/pages/consumers/group-details';

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
  withLag: fallback(z.coerce.boolean().optional(), false),
});

export type GroupSearchParams = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/groups/$groupId')({
  staticData: {
    title: 'Consumer Group Details',
  },
  validateSearch: zodValidator(searchSchema),
  component: GroupDetailsWrapper,
});

function GroupDetailsWrapper() {
  const { groupId } = useParams({ from: '/groups/$groupId' });
  const search = useSearch({ from: '/groups/$groupId' });
  const navigate = useNavigate({ from: '/groups/$groupId' });

  const onSearchChange = useCallback(
    (updates: Partial<GroupSearchParams>) => {
      navigate({
        search: (prev) => ({
          ...prev,
          ...updates,
          // Remove undefined/empty values from URL
          q: updates.q === '' ? undefined : (updates.q ?? prev.q),
          withLag: updates.withLag === false ? undefined : (updates.withLag ?? prev.withLag),
        }),
        replace: true,
      });
    },
    [navigate]
  );

  return (
    <GroupDetails
      groupId={groupId}
      matchedPath={`/groups/${groupId}`}
      onSearchChange={onSearchChange}
      search={search}
    />
  );
}
