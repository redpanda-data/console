import type { AclDetail } from 'components/pages/acls/new-acl/acl.model';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type ListACLsResponse_Resource,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { describe, expect, it } from 'vitest';

import {
  buildPrincipalAutocompleteOptions,
  buildResourceOptionsByType,
  buildUserAclsMap,
  compareDisplayText,
  flattenAclDetails,
  sortAclEntries,
  sortByName,
  sortByPrincipal,
} from './security-acl-utils';

describe('security-acl-utils sorting', () => {
  it('sorts display text case-insensitively and numerically', () => {
    const values = ['role-10', 'Role-2', 'role-1'];

    expect([...values].sort(compareDisplayText)).toEqual(['role-1', 'Role-2', 'role-10']);
  });

  it('uses a raw-string fallback when visible labels compare equally', () => {
    const values = ['alice', 'ALICE', 'Alice'];

    expect([...values].sort(compareDisplayText)).toEqual(['ALICE', 'Alice', 'alice']);
  });

  it('sorts name-based collections alphabetically', () => {
    const roles = [{ name: 'role-10' }, { name: 'Role-2' }, { name: 'role-1' }];

    expect(sortByName(roles).map((role) => role.name)).toEqual(['role-1', 'Role-2', 'role-10']);
  });

  it('sorts principal-based collections alphabetically', () => {
    const principals = [{ principal: 'User:zeta' }, { principal: 'OIDC:alpha' }, { principal: 'User:beta' }];

    expect(sortByPrincipal(principals).map((principal) => principal.principal)).toEqual([
      'OIDC:alpha',
      'User:beta',
      'User:zeta',
    ]);
  });

  it('preserves resourcePatternType for literal, prefix, and any selector types', () => {
    const details: AclDetail[] = [
      {
        sharedConfig: { principal: 'User:test', host: '*' },
        rules: [
          {
            id: 1,
            resourceType: 'topic',
            mode: 'custom',
            selectorType: 'literal',
            selectorValue: 'my-topic',
            operations: { READ: 'allow' },
          },
          {
            id: 2,
            resourceType: 'topic',
            mode: 'custom',
            selectorType: 'prefix',
            selectorValue: 'events.',
            operations: { WRITE: 'allow' },
          },
          {
            id: 3,
            resourceType: 'consumerGroup',
            mode: 'custom',
            selectorType: 'any',
            selectorValue: '*',
            operations: { READ: 'allow' },
          },
        ],
      },
    ];

    const entries = flattenAclDetails(details);

    expect(entries).toHaveLength(3);

    const literal = entries.find((e) => e.resourceName === 'my-topic');
    expect(literal?.resourcePatternType).toBe(ACL_ResourcePatternType.LITERAL);

    const prefixed = entries.find((e) => e.resourceName === 'events.');
    expect(prefixed?.resourcePatternType).toBe(ACL_ResourcePatternType.PREFIXED);

    const any = entries.find((e) => e.resourceType === 'Group');
    expect(any?.resourcePatternType).toBe(ACL_ResourcePatternType.LITERAL);
  });

  it('sorts ACL rows by the displayed tuple, including wildcard and inherited metadata', () => {
    const entries = [
      {
        host: '*',
        operation: 'Read',
        permission: 'Allow',
        principal: 'User:zeta',
        resourceName: 'topic-10',
        resourceType: 'Topic',
      },
      {
        host: '*',
        operation: 'All',
        permission: 'Allow',
        resourceName: 'kafka-cluster',
        resourceType: 'Cluster',
      },
      {
        host: '*',
        operation: 'Read',
        permission: 'Allow',
        roleName: 'role-10',
        resourceName: '*',
        resourceType: 'Group',
      },
      {
        host: '*',
        operation: 'Read',
        permission: 'Allow',
        roleName: 'role-2',
        resourceName: '*',
        resourceType: 'Group',
      },
      {
        host: '*',
        operation: 'Read',
        permission: 'Allow',
        principal: 'User:alpha',
        resourceName: 'topic-2',
        resourceType: 'Topic',
      },
    ];

    expect(
      sortAclEntries(entries).map((entry) => ({
        principal: entry.principal,
        resourceName: entry.resourceName,
        resourceType: entry.resourceType,
        roleName: entry.roleName,
      }))
    ).toEqual([
      {
        principal: undefined,
        resourceName: 'kafka-cluster',
        resourceType: 'Cluster',
        roleName: undefined,
      },
      {
        principal: undefined,
        resourceName: '*',
        resourceType: 'Group',
        roleName: 'role-2',
      },
      {
        principal: undefined,
        resourceName: '*',
        resourceType: 'Group',
        roleName: 'role-10',
      },
      {
        principal: 'User:alpha',
        resourceName: 'topic-2',
        resourceType: 'Topic',
        roleName: undefined,
      },
      {
        principal: 'User:zeta',
        resourceName: 'topic-10',
        resourceType: 'Topic',
        roleName: undefined,
      },
    ]);
  });

  it('builds principal autocomplete options from users, roles, live principals, and the User: helper', () => {
    expect(
      buildPrincipalAutocompleteOptions({
        principals: ['Group:team-a', 'User:zoe', 'Group:team-a'],
        roles: ['role-10', 'role-2'],
        users: ['bob', 'alice'],
      }).map((option) => option.value)
    ).toEqual([
      'Group:team-a',
      'RedpandaRole:role-2',
      'RedpandaRole:role-10',
      'User:',
      'User:alice',
      'User:bob',
      'User:zoe',
    ]);
  });

  it('excludes already assigned principals from principal autocomplete options', () => {
    expect(
      buildPrincipalAutocompleteOptions({
        excludePrincipals: ['User:alice', 'Group:team-a'],
        principals: ['User:alice', 'Group:team-a', 'Group:team-b'],
        users: ['alice', 'bob'],
      }).map((option) => option.value)
    ).toEqual(['Group:team-b', 'User:', 'User:bob']);
  });

  it('groups resource autocomplete options by displayed resource type', () => {
    const optionsByType = buildResourceOptionsByType([
      { resourceName: 'topic-2', resourceType: ACL_ResourceType.TOPIC },
      { resourceName: 'topic-10', resourceType: ACL_ResourceType.TOPIC },
      { resourceName: 'group-a', resourceType: ACL_ResourceType.GROUP },
      { resourceName: 'txn-1', resourceType: ACL_ResourceType.TRANSACTIONAL_ID },
      { resourceName: 'kafka-cluster', resourceType: ACL_ResourceType.CLUSTER },
      { resourceName: 'topic-2', resourceType: ACL_ResourceType.TOPIC },
    ]);

    expect(optionsByType.Topic?.map((option) => option.value)).toEqual(['topic-2', 'topic-10']);
    expect(optionsByType.Group?.map((option) => option.value)).toEqual(['group-a']);
    expect(optionsByType.TransactionalId?.map((option) => option.value)).toEqual(['txn-1']);
    expect(optionsByType.Cluster?.map((option) => option.value)).toEqual(['kafka-cluster']);
  });
});

function makeResource(
  resourceType: ACL_ResourceType,
  resourceName: string,
  acls: { principal: string; operation: ACL_Operation; permissionType: ACL_PermissionType }[]
): ListACLsResponse_Resource {
  return { resourceType, resourceName, acls } as unknown as ListACLsResponse_Resource;
}

describe('buildUserAclsMap', () => {
  it('returns an empty map for no resources', () => {
    expect(buildUserAclsMap([])).toEqual(new Map());
  });

  it('maps a User: principal to its ACL entry', () => {
    const resources = [
      makeResource(ACL_ResourceType.TOPIC, 'my-topic', [
        { principal: 'User:alice', operation: ACL_Operation.READ, permissionType: ACL_PermissionType.ALLOW },
      ]),
    ];

    const map = buildUserAclsMap(resources);

    expect(map.get('alice')).toEqual([
      { resourceType: 'Topic', resourceName: 'my-topic', operation: 'Read', permission: 'Allow' },
    ]);
  });

  it('ignores non-User: principals', () => {
    const resources = [
      makeResource(ACL_ResourceType.TOPIC, 'my-topic', [
        { principal: 'RedpandaRole:admin', operation: ACL_Operation.ALL, permissionType: ACL_PermissionType.ALLOW },
      ]),
    ];

    expect(buildUserAclsMap(resources).size).toBe(0);
  });

  it('groups multiple ACL entries under the same user', () => {
    const resources = [
      makeResource(ACL_ResourceType.TOPIC, 'topic-a', [
        { principal: 'User:bob', operation: ACL_Operation.READ, permissionType: ACL_PermissionType.ALLOW },
      ]),
      makeResource(ACL_ResourceType.GROUP, 'group-a', [
        { principal: 'User:bob', operation: ACL_Operation.READ, permissionType: ACL_PermissionType.DENY },
      ]),
    ];

    const acls = buildUserAclsMap(resources).get('bob');
    expect(acls).toHaveLength(2);
    expect(acls?.map((a) => a.resourceType)).toEqual(['Group', 'Topic']);
  });

  it('sorts ACL entries within each user', () => {
    const resources = [
      makeResource(ACL_ResourceType.TOPIC, 'topic-10', [
        { principal: 'User:alice', operation: ACL_Operation.WRITE, permissionType: ACL_PermissionType.ALLOW },
      ]),
      makeResource(ACL_ResourceType.TOPIC, 'topic-2', [
        { principal: 'User:alice', operation: ACL_Operation.READ, permissionType: ACL_PermissionType.ALLOW },
      ]),
    ];

    const acls = buildUserAclsMap(resources).get('alice');
    expect(acls?.map((a) => a.resourceName)).toEqual(['topic-2', 'topic-10']);
  });

  it('maps enum values to display labels', () => {
    const resources = [
      makeResource(ACL_ResourceType.CLUSTER, 'kafka-cluster', [
        { principal: 'User:alice', operation: ACL_Operation.CLUSTER_ACTION, permissionType: ACL_PermissionType.DENY },
      ]),
    ];

    expect(buildUserAclsMap(resources).get('alice')).toEqual([
      { resourceType: 'Cluster', resourceName: 'kafka-cluster', operation: 'ClusterAction', permission: 'Deny' },
    ]);
  });
});
