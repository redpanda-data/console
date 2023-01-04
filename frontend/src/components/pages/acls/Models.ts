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

import { AclStrOperation, AclStrPermission, AclStrResourcePatternType, AclStrResourceType } from '../../../state/restInterfaces';

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
}

export type AclPrincipalGroup = {
    principalType: string;
    principalName: string;

    host: string;

    topicAcls: TopicACLs[];
    consumerGroupAcls: ConsumerGroupACLs[];
    transactionalIdAcls: TransactionalIdACLs[];
    clusterAcls: ClusterACLs;

    sourceEntries: AclFlat[];
};

export type TopicACLs = {
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
    selector: string;
    all: AclStrPermission;

    permissions: {
        Delete: AclStrPermission;
        Describe: AclStrPermission;
        Read: AclStrPermission;
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

export type TransactionalIdACLs = {
    selector: string;
    all: AclStrPermission;

    permissions: {
        Describe: AclStrPermission;
        Write: AclStrPermission;
    };
};

export type ResourceACLs = TopicACLs | ConsumerGroupACLs | TransactionalIdACLs | ClusterACLs;


export function createEmptyTopicAcl(): TopicACLs {
    return {
        selector: '',
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
        }
    };
}

export function createEmptyConsumerGroupAcl(): ConsumerGroupACLs {
    return {
        selector: '',
        all: 'Any',
        permissions: {
            Read: 'Any',
            Delete: 'Any',
            Describe: 'Any',
        }
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
        }
    };
}

export function createEmptyTransactionalIdAcl(): TransactionalIdACLs {
    return {
        selector: '',
        all: 'Any',
        permissions: {
            Describe: 'Any',
            Write: 'Any',
        }
    };
}


export function collectTopicAcls(acls: AclFlat[]): TopicACLs[] {
    const topics = acls
        .filter(x => x.resourceType == 'Topic')
        .groupInto(x => `${x.resourcePatternType}: ${x.resourceName}`);

    const topicAcls: TopicACLs[] = [];
    for (const { items } of topics) {
        const first = items[0];
        let selector = first.resourceName;
        if (first.resourcePatternType != 'Literal')
            if (first.resourcePatternType == 'Prefixed')
                selector += '*';
            else
                selector += ` (unsupported pattern type "${first.resourcePatternType}")`;

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

        const topicPermissions: { [key in typeof topicOperations[number]]: AclStrPermission } = {
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
            const entryForOp = items.find(x => x.operation === op);
            if (entryForOp) {
                topicPermissions[op] = entryForOp.permissionType;
            }
        }

        let all: AclStrPermission = 'Any';
        const allEntry = items.find(x => x.operation === 'All');
        if (allEntry && allEntry.permissionType == 'Allow')
            all = 'Allow';
        if (allEntry && allEntry.permissionType == 'Deny')
            all = 'Deny';

        const topicAcl: TopicACLs = {
            selector,
            permissions: topicPermissions,
            all,
        };

        topicAcls.push(topicAcl);
    }

    return topicAcls;
};

export function collectConsumerGroupAcls(acls: AclFlat[]): ConsumerGroupACLs[] {
    const consumerGroups = acls
        .filter(x => x.resourceType == 'Group')
        .groupInto(x => `${x.resourcePatternType}: ${x.resourceName}`);

    const consumerGroupAcls: ConsumerGroupACLs[] = [];
    for (const { items } of consumerGroups) {
        const first = items[0];
        let selector = first.resourceName;
        if (first.resourcePatternType != 'Literal')
            if (first.resourcePatternType == 'Prefixed')
                selector += '*';
            else
                selector += ` (unsupported pattern type "${first.resourcePatternType}")`;

        const groupOperations = [
            'Delete',
            'Describe',
            'Read',
        ] as const;

        const groupPermissions: { [key in typeof groupOperations[number]]: AclStrPermission } = {
            Delete: 'Any',
            Describe: 'Any',
            Read: 'Any',
        };

        for (const op of groupOperations) {
            const entryForOp = items.find(x => x.operation === op);
            if (entryForOp) {
                groupPermissions[op] = entryForOp.permissionType;
            }
        }

        let all: AclStrPermission = 'Any';
        const allEntry = items.find(x => x.operation === 'All');
        if (allEntry && allEntry.permissionType == 'Allow')
            all = 'Allow';
        if (allEntry && allEntry.permissionType == 'Deny')
            all = 'Deny';

        const groupAcl: ConsumerGroupACLs = {
            selector,
            permissions: groupPermissions,
            all,
        };

        consumerGroupAcls.push(groupAcl);
    }

    return consumerGroupAcls;
};

export function collectClusterAcls(acls: AclFlat[]): ClusterACLs {
    const flatClusterAcls = acls.filter(x => x.resourceType == 'Cluster');

    const clusterOperations = [
        'Alter',
        'AlterConfigs',
        'ClusterAction',
        'Create',
        'Describe',
        'DescribeConfigs',
    ] as const;

    const clusterPermissions: { [key in typeof clusterOperations[number]]: AclStrPermission } = {
        Alter: 'Any',
        AlterConfigs: 'Any',
        ClusterAction: 'Any',
        Create: 'Any',
        Describe: 'Any',
        DescribeConfigs: 'Any',
    };

    for (const op of clusterOperations) {
        const entryForOp = flatClusterAcls.find(x => x.operation === op);
        if (entryForOp) {
            clusterPermissions[op] = entryForOp.permissionType;
        }
    }

    let all: AclStrPermission = 'Any';
    const allEntry = flatClusterAcls.find(x => x.operation === 'All');
    if (allEntry && allEntry.permissionType == 'Allow')
        all = 'Allow';
    if (allEntry && allEntry.permissionType == 'Deny')
        all = 'Deny';

    const clusterAcls: ClusterACLs = {
        permissions: clusterPermissions,
        all,
    };


    return clusterAcls;
};

export function collectTransactionalIdAcls(acls: AclFlat[]): TransactionalIdACLs[] {
    const transactionalIds = acls
        .filter(x => x.resourceType == 'TransactionalID')
        .groupInto(x => `${x.resourcePatternType}: ${x.resourceName}`);

    const transactionalIdAcls: TransactionalIdACLs[] = [];
    for (const { items } of transactionalIds) {
        const first = items[0];
        let selector = first.resourceName;
        if (first.resourcePatternType != 'Literal')
            if (first.resourcePatternType == 'Prefixed')
                selector += '*';
            else
                selector += ` (unsupported pattern type "${first.resourcePatternType}")`;

        const transactionalIdOperations = [
            'Describe',
            'Write',
        ] as const;

        const transactionalIdPermissions: { [key in typeof transactionalIdOperations[number]]: AclStrPermission } = {
            Describe: 'Any',
            Write: 'Any',
        };

        for (const op of transactionalIdOperations) {
            const entryForOp = items.find(x => x.operation === op);
            if (entryForOp) {
                transactionalIdPermissions[op] = entryForOp.permissionType;
            }
        }

        let all: AclStrPermission = 'Any';
        const allEntry = items.find(x => x.operation === 'All');
        if (allEntry && allEntry.permissionType == 'Allow')
            all = 'Allow';
        if (allEntry && allEntry.permissionType == 'Deny')
            all = 'Deny';

        const groupAcl: TransactionalIdACLs = {
            selector,
            permissions: transactionalIdPermissions,
            all,
        };

        transactionalIdAcls.push(groupAcl);
    }

    return transactionalIdAcls;
};


export function unpackPrincipalGroup(group: AclPrincipalGroup): AclFlat[] {
    const flat: AclFlat[] = [];

    const principal = group.principalType + ':' + group.principalName;
    const host = group.host || '*';

    for (const topic of group.topicAcls) {
        if (!topic.selector) continue;

        const [resourcePatternType, resourceName] = selectorToPatternAndName(topic.selector);

        if (topic.all == 'Allow' || topic.all == 'Deny') {
            const e: AclFlat = {
                principal,
                host,

                resourceType: 'Topic',
                resourcePatternType,
                resourceName,

                operation: 'All',
                permissionType: topic.all
            };
            flat.push(e);
            continue;
        }

        for (const [key, permission] of Object.entries(topic.permissions)) {
            const operation = key as AclStrOperation;

            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal,
                host,

                resourceType: 'Topic',
                resourceName,
                resourcePatternType,

                operation: operation,
                permissionType: permission
            };
            flat.push(e);
        }
    }

    for (const consumerGroup of group.consumerGroupAcls) {
        if (!consumerGroup.selector) continue;

        const [resourcePatternType, resourceName] = selectorToPatternAndName(consumerGroup.selector);

        if (consumerGroup.all == 'Allow' || consumerGroup.all == 'Deny') {
            const e: AclFlat = {
                principal,
                host,

                resourceType: 'Group',
                resourcePatternType,
                resourceName,

                operation: 'All',
                permissionType: consumerGroup.all
            };
            flat.push(e);
            continue;
        }

        for (const [key, permission] of Object.entries(consumerGroup.permissions)) {
            const operation = key as AclStrOperation;

            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal,
                host,

                resourceType: 'Group',
                resourceName,
                resourcePatternType,

                operation: operation,
                permissionType: permission
            };
            flat.push(e);
        }
    }

    for (const transactionalId of group.transactionalIdAcls) {
        if (!transactionalId.selector) continue;

        const [resourcePatternType, resourceName] = selectorToPatternAndName(transactionalId.selector);

        if (transactionalId.all == 'Allow' || transactionalId.all == 'Deny') {
            const e: AclFlat = {
                principal,
                host,

                resourceType: 'TransactionalID',
                resourcePatternType,
                resourceName,

                operation: 'All',
                permissionType: transactionalId.all
            };
            flat.push(e);
            continue;
        }

        for (const [key, permission] of Object.entries(transactionalId.permissions)) {
            const operation = key as AclStrOperation;

            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal,
                host,

                resourceType: 'TransactionalID',
                resourceName,
                resourcePatternType,

                operation: operation,
                permissionType: permission
            };
            flat.push(e);
        }
    }


    if (group.clusterAcls.all == 'Allow' || group.clusterAcls.all == 'Deny') {
        const e: AclFlat = {
            principal,
            host,

            resourceType: 'Cluster',
            resourceName: 'kafka-cluster',
            resourcePatternType: 'Literal',

            operation: 'All',
            permissionType: group.clusterAcls.all
        };
        flat.push(e);
    } else {
        for (const [key, permission] of Object.entries(group.clusterAcls.permissions)) {
            const operation = key as AclStrOperation;
            if (permission != 'Allow' && permission != 'Deny')
                continue;

            const e: AclFlat = {
                principal,
                host,

                resourceType: 'Cluster',
                resourceName: 'kafka-cluster',
                resourcePatternType: 'Literal',

                operation: operation,
                permissionType: permission
            };
            flat.push(e);
        }
    }

    return flat;
}


function selectorToPatternAndName(selector: string): [resourcePatternType: AclStrResourcePatternType, resourceName: string] {
    // Wildcard (special case)
    if (selector == '*')
        return ['Literal', '*'];

    // Prefixed (remove star)
    if (selector.endsWith('*')) {
        const rawName = selector.removeSuffix('*');
        return ['Prefixed', rawName];
    }

    // Literal
    return ['Literal', selector];
}
