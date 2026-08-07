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

import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { render, screen } from 'test-utils';

import { ConfigurationShadowing } from './configuration-shadowing';
import { type UnifiedShadowLink, UnifiedShadowLinkState } from '../../model';

const buildShadowLink = (configurations?: UnifiedShadowLink['configurations']): UnifiedShadowLink => ({
  name: 'test-link',
  id: 'uid-1',
  state: UnifiedShadowLinkState.ACTIVE,
  configurations,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
});

describe('ConfigurationShadowing', () => {
  test('should render the role replication section with resource-aware filter labels', () => {
    const shadowLink = buildShadowLink({
      roleSyncOptions: {
        roleNameFilters: [{ name: 'my-role', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      },
    });

    render(<ConfigurationShadowing shadowLink={shadowLink} />);

    expect(screen.getByTestId('role-replication-card')).toBeInTheDocument();
    expect(screen.getByText('Role replication')).toBeInTheDocument();
    expect(screen.getByText('Include specific roles')).toBeInTheDocument();
    expect(screen.getByText('my-role')).toBeInTheDocument();
  });

  test('should show the empty message when role sync has no filters', () => {
    const shadowLink = buildShadowLink({
      roleSyncOptions: { roleNameFilters: [] },
    });

    render(<ConfigurationShadowing shadowLink={shadowLink} />);

    expect(screen.getByTestId('no-role-replication')).toHaveTextContent('No role filters configured');
  });

  test('should hide the role replication section when role sync options are unavailable', () => {
    const shadowLink = buildShadowLink({});

    render(<ConfigurationShadowing shadowLink={shadowLink} />);

    expect(screen.queryByTestId('role-replication-card')).not.toBeInTheDocument();
  });
});
