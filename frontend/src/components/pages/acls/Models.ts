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

import { comparer, observable } from 'mobx';
import { api } from '../../../state/backendApi';
import type {
  AclStrOperation,
  AclStrPermission,
  AclStrResourcePatternType,
  AclStrResourceType,
} from '../../../state/restInterfaces';

export type PrincipalType = 'User' | 'RedpandaRole';
export type AclFlat = {
  // AclResource
  resourceType: AclStrResourceType;
  resourceName: string;
  resourcePatternType: AclStrResourcePatternType;

  // AclRule
  principal: string;
  host: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
};

export type AclPrincipalGroup = {
  principalType: PrincipalType;
  // This can only ever be a literal, or match anything (star in that case). No prefix or postfix matching
  principalName: string | '*';

  host: string;

  topicAcls: TopicACLs[];
  consumerGroupAcls: ConsumerGroupACLs[];
  transactionalIdAcls: TransactionalIdACLs[];
  clusterAcls: ClusterACLs;

  sourceEntries: AclFlat[];
};

export type TopicACLs = {
  patternType: AclStrResourcePatternType;
  selector: string;
  all: AclStrPermission;

  permissions: {
    Alter: AclStrPermission;
    AlterConfigs: AclStrPermission;
    Create: AclStrPermission;
    Delete: AclStrPermission;
    Describe: AclStrPermission;
    DescribeConfigs: AclStrPermission;
    Read: AclStrPermission;
    Write: AclStrPermission;
  };
};

export type ConsumerGroupACLs = {
  patternType: AclStrResourcePatternType;
  selector: string;
  all: AclStrPermission;

  permissions: {
    Delete: AclStrPermission;
    Describe: AclStrPermission;
    Read: AclStrPermission;
  };
};

export type TransactionalIdACLs = {
  patternType: AclStrResourcePatternType;
  selector: string;
  all: AclStrPermission;

  permissions: {
    Describe: AclStrPermission;
    Write: AclStrPermission;
  };
};

export type ClusterACLs = {
  all: AclStrPermission;

  permissions: {
    Alter: AclStrPermission;
    AlterConfigs: AclStrPermission;
    ClusterAction: AclStrPermission;
    Create: AclStrPermission;
    Describe: AclStrPermission;
    DescribeConfigs: AclStrPermission;
  };
};

export type ResourceACLs = TopicACLs | ConsumerGroupACLs | TransactionalIdACLs | ClusterACLs;

export function createEmptyTopicAcl(): TopicACLs {
  return {
    selector: '*',
    patternType: 'Any',
    all: 'Any',
    permissions: {
      Alter: 'Any',
      AlterConfigs: 'Any',
      Create: 'Any',
      DescribeConfigs: 'Any',
      Write: 'Any',
      Read: 'Any',
      Delete: 'Any',
      Describe: 'Any',
    },
  };
}

export function createEmptyConsumerGroupAcl(): ConsumerGroupACLs {
  return {
    selector: '*',
    patternType: 'Any',
    all: 'Any',
    permissions: {
      Read: 'Any',
      Delete: 'Any',
      Describe: 'Any',
    },
  };
}

export function createEmptyTransactionalIdAcl(): TransactionalIdACLs {
  return {
    selector: '*',
    patternType: 'Any',
    all: 'Any',
    permissions: {
      Describe: 'Any',
      Write: 'Any',
    },
  };
}

export function createEmptyClusterAcl(): ClusterACLs {
  return {
    all: 'Any',
    permissions: {
      Alter: 'Any',
      AlterConfigs: 'Any',
      ClusterAction: 'Any',
      Create: 'Any',
      Describe: 'Any',
      DescribeConfigs: 'Any',
    },
  };
}

function modelPatternTypeToUIType(resourcePatternType: AclStrResourcePatternType, resourceName: string) {
  if (resourcePatternType === 'Literal' && resourceName === '*') return 'Any';

  return resourcePatternType;
}

function collectTopicAcls(acls: AclFlat[]): TopicACLs[] {
  const topics = acls
    .filter((x) => x.resourceType === 'Topic')
    .groupInto((x) => `${x.resourcePatternType}: ${x.resourceName}`);

  const topicAcls: TopicACLs[] = [];
  for (const { items } of topics) {
    const first = items[0];
    const selector = first.resourceName;

    const topicOperations = [
      'Alter',
      'AlterConfigs',
      'Create',
      'Delete',
      'Describe',
      'DescribeConfigs',
      'Read',
      'Write',
    ] as const;

    const topicPermissions: { [key in (typeof topicOperations)[number]]: AclStrPermission } = {
      Alter: 'Any',
      AlterConfigs: 'Any',
      Create: 'Any',
      Delete: 'Any',
      Describe: 'Any',
      DescribeConfigs: 'Any',
      Read: 'Any',
      Write: 'Any',
    };

    for (const op of topicOperations) {
      const entryForOp = items.find((x) => x.operation === op);
      if (entryForOp) {
        topicPermissions[op] = entryForOp.permissionType;
      }
    }

    let all: AclStrPermission = 'Any';
    const allEntry = items.find((x) => x.operation === 'All');
    if (allEntry && allEntry.permissionType === 'Allow') all = 'Allow';
    if (allEntry && allEntry.permissionType === 'Deny') all = 'Deny';

    const topicAcl: TopicACLs = {
      patternType: modelPatternTypeToUIType(first.resourcePatternType, selector),
      selector,
      permissions: topicPermissions,
      all,
    };

    topicAcls.push(topicAcl);
  }

  return topicAcls;
}

function collectConsumerGroupAcls(acls: AclFlat[]): ConsumerGroupACLs[] {
  const consumerGroups = acls
    .filter((x) => x.resourceType === 'Group')
    .groupInto((x) => `${x.resourcePatternType}: ${x.resourceName}`);

  const consumerGroupAcls: ConsumerGroupACLs[] = [];
  for (const { items } of consumerGroups) {
    const first = items[0];
    const selector = first.resourceName;

    const groupOperations = ['Delete', 'Describe', 'Read'] as const;

    const groupPermissions: { [key in (typeof groupOperations)[number]]: AclStrPermission } = {
      Delete: 'Any',
      Describe: 'Any',
      Read: 'Any',
    };

    for (const op of groupOperations) {
      const entryForOp = items.find((x) => x.operation === op);
      if (entryForOp) {
        groupPermissions[op] = entryForOp.permissionType;
      }
    }

    let all: AclStrPermission = 'Any';
    const allEntry = items.find((x) => x.operation === 'All');
    if (allEntry && allEntry.permissionType === 'Allow') all = 'Allow';
    if (allEntry && allEntry.permissionType === 'Deny') all = 'Deny';

    const groupAcl: ConsumerGroupACLs = {
      patternType: modelPatternTypeToUIType(first.resourcePatternType, selector),
      selector,
      permissions: groupPermissions,
      all,
    };

    consumerGroupAcls.push(groupAcl);
  }

  return consumerGroupAcls;
}

function collectTransactionalIdAcls(acls: AclFlat[]): TransactionalIdACLs[] {
  const transactionalIds = acls
    .filter((x) => x.resourceType === 'TransactionalID')
    .groupInto((x) => `${x.resourcePatternType}: ${x.resourceName}`);

  const transactionalIdAcls: TransactionalIdACLs[] = [];
  for (const { items } of transactionalIds) {
    const first = items[0];
    const selector = first.resourceName;

    const transactionalIdOperations = ['Describe', 'Write'] as const;

    const transactionalIdPermissions: { [key in (typeof transactionalIdOperations)[number]]: AclStrPermission } = {
      Describe: 'Any',
      Write: 'Any',
    };

    for (const op of transactionalIdOperations) {
      const entryForOp = items.find((x) => x.operation === op);
      if (entryForOp) {
        transactionalIdPermissions[op] = entryForOp.permissionType;
      }
    }

    let all: AclStrPermission = 'Any';
    const allEntry = items.find((x) => x.operation === 'All');
    if (allEntry && allEntry.permissionType === 'Allow') all = 'Allow';
    if (allEntry && allEntry.permissionType === 'Deny') all = 'Deny';

    const groupAcl: TransactionalIdACLs = {
      patternType: modelPatternTypeToUIType(first.resourcePatternType, selector),
      selector,
      permissions: transactionalIdPermissions,
      all,
    };

    transactionalIdAcls.push(groupAcl);
  }

  return transactionalIdAcls;
}

function collectClusterAcls(acls: AclFlat[]): ClusterACLs {
  const flatClusterAcls = acls.filter((x) => x.resourceType === 'Cluster');

  const clusterOperations = [
    'Alter',
    'AlterConfigs',
    'ClusterAction',
    'Create',
    'Describe',
    'DescribeConfigs',
  ] as const;

  const clusterPermissions: { [key in (typeof clusterOperations)[number]]: AclStrPermission } = {
    Alter: 'Any',
    AlterConfigs: 'Any',
    ClusterAction: 'Any',
    Create: 'Any',
    Describe: 'Any',
    DescribeConfigs: 'Any',
  };

  for (const op of clusterOperations) {
    const entryForOp = flatClusterAcls.find((x) => x.operation === op);
    if (entryForOp) {
      clusterPermissions[op] = entryForOp.permissionType;
    }
  }

  let all: AclStrPermission = 'Any';
  const allEntry = flatClusterAcls.find((x) => x.operation === 'All');
  if (allEntry && allEntry.permissionType === 'Allow') all = 'Allow';
  if (allEntry && allEntry.permissionType === 'Deny') all = 'Deny';

  const clusterAcls: ClusterACLs = {
    permissions: clusterPermissions,
    all,
  };

  return clusterAcls;
}

export const principalGroupsView = observable(
  {
    get flatAcls() {
      const acls = api.ACLs;
      if (!acls || !acls.aclResources || acls.aclResources.length === 0) return [];

      const flattened: AclFlat[] = [];
      for (const res of acls.aclResources) {
        for (const rule of res.acls) {
          const flattenedEntry: AclFlat = {
            resourceType: res.resourceType,
            resourceName: res.resourceName,
            resourcePatternType: res.resourcePatternType,

            principal: rule.principal,
            host: rule.host,
            operation: rule.operation,
            permissionType: rule.permissionType,
          };

          flattened.push(flattenedEntry);
        }
      }

      return observable(flattened);
    },

    get principalGroups(): AclPrincipalGroup[] {
      const flat = this.flatAcls;

      const g = flat.groupInto((f) => {
        const groupingKey = `${f.principal ?? 'Any'} ${f.host ?? 'Any'}`;
        return groupingKey;
      });

      const result: AclPrincipalGroup[] = [];

      for (const { items } of g) {
        const { principal, host } = items[0];

        let principalType: PrincipalType;
        let principalName: string;
        if (principal.includes(':')) {
          const split = principal.split(':', 2);
          principalType = split[0] as PrincipalType;
          principalName = split[1];
        } else {
          principalType = 'User';
          principalName = principal;
        }

        const principalGroup: AclPrincipalGroup = {
          principalType,
          principalName,
          host,

          topicAcls: collectTopicAcls(items),
          consumerGroupAcls: collectConsumerGroupAcls(items),
          clusterAcls: collectClusterAcls(items),
          transactionalIdAcls: collectTransactionalIdAcls(items),

          sourceEntries: items,
        };
        result.push(principalGroup);
      }

      // Add service accounts that exist but have no associated acl rules
      const serviceAccounts = api.serviceAccounts?.users;
      if (serviceAccounts) {
        for (const acc of serviceAccounts) {
          if (!result.any((g) => g.principalName === acc)) {
            // Doesn't have a group yet, create one
            result.push({
              principalType: 'User',
              host: '',
              principalName: acc,
              topicAcls: [createEmptyTopicAcl()],
              consumerGroupAcls: [createEmptyConsumerGroupAcl()],
              transactionalIdAcls: [createEmptyTransactionalIdAcl()],
              clusterAcls: createEmptyClusterAcl(),
              sourceEntries: [],
            });
          }
        }
      }

      return observable(result);
    },
  },
  undefined,
  {
    equals: comparer.structural,
  },
);

/*
 Sooner or later you want to go back from an 'AclPrincipalGroup' to flat ACLs.
 Why? Because you'll need to call the remove/create acl apis and those only work with flat acls.
 Use this method to convert your principal group back to a list of flat acls.
*/
export function unpackPrincipalGroup(group: AclPrincipalGroup): AclFlat[] {
  const flat: AclFlat[] = [];

  const principal = `${group.principalType}:${group.principalName}`;
  const host = group.host || '*';

  for (const topic of group.topicAcls) {
    if (!topic.selector) continue;

    // If the user selects 'Any' in the ui, we need to submit pattern type "Literal" and "*" as resourceName
    const resourcePatternType = topic.patternType === 'Any' ? 'Literal' : topic.patternType;
    const resourceName = topic.selector;

    if (topic.all === 'Allow' || topic.all === 'Deny') {
      const e: AclFlat = {
        principal,
        host,

        resourceType: 'Topic',
        resourcePatternType,
        resourceName,

        operation: 'All',
        permissionType: topic.all,
      };
      flat.push(e);
      continue;
    }

    for (const [key, permission] of Object.entries(topic.permissions)) {
      const operation = key as AclStrOperation;

      if (permission !== 'Allow' && permission !== 'Deny') continue;

      const e: AclFlat = {
        principal,
        host,

        resourceType: 'Topic',
        resourceName,
        resourcePatternType,

        operation: operation,
        permissionType: permission,
      };
      flat.push(e);
    }
  }

  for (const consumerGroup of group.consumerGroupAcls) {
    if (!consumerGroup.selector) continue;

    // If the user selects 'Any' in the ui, we need to submit pattern type "Literal" and "*" as resourceName
    const resourcePatternType = consumerGroup.patternType === 'Any' ? 'Literal' : consumerGroup.patternType;
    const resourceName = consumerGroup.selector;

    if (consumerGroup.all === 'Allow' || consumerGroup.all === 'Deny') {
      const e: AclFlat = {
        principal,
        host,

        resourceType: 'Group',
        resourcePatternType,
        resourceName,

        operation: 'All',
        permissionType: consumerGroup.all,
      };
      flat.push(e);
      continue;
    }

    for (const [key, permission] of Object.entries(consumerGroup.permissions)) {
      const operation = key as AclStrOperation;

      if (permission !== 'Allow' && permission !== 'Deny') continue;

      const e: AclFlat = {
        principal,
        host,

        resourceType: 'Group',
        resourceName,
        resourcePatternType,

        operation: operation,
        permissionType: permission,
      };
      flat.push(e);
    }
  }

  for (const transactionalId of group.transactionalIdAcls) {
    if (!transactionalId.selector) continue;

    // If the user selects 'Any' in the ui, we need to submit pattern type "Literal" and "*" as resourceName
    const resourcePatternType = transactionalId.patternType === 'Any' ? 'Literal' : transactionalId.patternType;
    const resourceName = transactionalId.selector;

    if (transactionalId.all === 'Allow' || transactionalId.all === 'Deny') {
      const e: AclFlat = {
        principal,
        host,

        resourceType: 'TransactionalID',
        resourcePatternType,
        resourceName,

        operation: 'All',
        permissionType: transactionalId.all,
      };
      flat.push(e);
      continue;
    }

    for (const [key, permission] of Object.entries(transactionalId.permissions)) {
      const operation = key as AclStrOperation;

      if (permission !== 'Allow' && permission !== 'Deny') continue;

      const e: AclFlat = {
        principal,
        host,

        resourceType: 'TransactionalID',
        resourceName,
        resourcePatternType,

        operation: operation,
        permissionType: permission,
      };
      flat.push(e);
    }
  }

  if (group.clusterAcls.all === 'Allow' || group.clusterAcls.all === 'Deny') {
    const e: AclFlat = {
      principal,
      host,

      resourceType: 'Cluster',
      resourceName: 'kafka-cluster',
      resourcePatternType: 'Literal',

      operation: 'All',
      permissionType: group.clusterAcls.all,
    };
    flat.push(e);
  } else {
    for (const [key, permission] of Object.entries(group.clusterAcls.permissions)) {
      const operation = key as AclStrOperation;
      if (permission !== 'Allow' && permission !== 'Deny') continue;

      const e: AclFlat = {
        principal,
        host,

        resourceType: 'Cluster',
        resourceName: 'kafka-cluster',
        resourcePatternType: 'Literal',

        operation: operation,
        permissionType: permission,
      };
      flat.push(e);
    }
  }

  return flat;
}
