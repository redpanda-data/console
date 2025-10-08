/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import { observable } from 'mobx';
import React from 'react';

import AclList from './acl-list';
import type {
  AclStrOperation,
  AclStrPermission,
  AclStrResourceType,
  GetAclOverviewResponse,
} from '../../../../state/rest-interfaces';

describe('AclList', () => {
  test('renders an empty table when no data is present', () => {
    const store = observable({
      isAuthorizerEnabled: true,
      aclResources: [],
    });

    render(<AclList acl={store} />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  test('a table with one entry', () => {
    const store = observable({
      isAuthorizerEnabled: true,
      aclResources: [
        {
          resourceType: 'Topic' as AclStrResourceType,
          resourceName: 'Test Topic',
          resourcePatternType: 'Unknown',
          acls: [
            {
              principal: 'test principal',
              host: '*',
              operation: 'All' as AclStrOperation,
              permissionType: 'Allow' as AclStrPermission,
            },
          ],
        },
      ],
    } as GetAclOverviewResponse);

    render(<AclList acl={store} />);

    expect(screen.getByText('Topic')).toBeInTheDocument();
    expect(screen.getByText('Test Topic')).toBeInTheDocument();
    expect(screen.getByText('test principal')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Allow')).toBeInTheDocument();
  });

  test('informs user about missing permission to view ACLs', () => {
    render(<AclList acl={null} />);
    expect(screen.getByText('You do not have the necessary permissions to view ACLs')).toBeInTheDocument();
  });

  test('informs user about missing authorizer config in Kafka cluster', () => {
    const store = observable({
      isAuthorizerEnabled: false,
      aclResources: [],
    });

    render(<AclList acl={store} />);
    expect(screen.getByText("There's no authorizer configured in your Kafka cluster")).toBeInTheDocument();
  });
});
