import {
  type AclDetail,
  getGRPCResourcePatternType,
  getResourceNameValue,
} from 'components/pages/acls/new-acl/acl.model';
import type { ComboboxOption } from 'components/redpanda-ui/components/combobox';
import { ACL_ResourcePatternType, ACL_ResourceType } from 'protogen/redpanda/api/dataplane/v1/acl_pb';

import type { ACLEntry } from './acl-editor';

const displayTextCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
  usage: 'sort',
});

const resourceTypeLabels: Record<string, string> = {
  cluster: 'Cluster',
  consumerGroup: 'Group',
  schemaRegistry: 'SchemaRegistry',
  subject: 'Subject',
  topic: 'Topic',
  transactionalId: 'TransactionalId',
};

const operationLabels: Record<string, string> = {
  ALTER: 'Alter',
  ALTER_CONFIGS: 'AlterConfigs',
  ALL: 'All',
  CLUSTER_ACTION: 'ClusterAction',
  CREATE: 'Create',
  DELETE: 'Delete',
  DESCRIBE: 'Describe',
  DESCRIBE_CONFIGS: 'DescribeConfigs',
  IDEMPOTENT_WRITE: 'IdempotentWrite',
  READ: 'Read',
  WRITE: 'Write',
};

type NamedItem = { name: string };
type PrincipalItem = { principal: string };
type SortableAclEntry = Pick<ACLEntry, 'operation' | 'permission' | 'resourceName' | 'resourceType'> & {
  host?: string;
  principal?: string;
  roleName?: string;
};
type ResourceOptionSource = {
  resourceName?: string;
  resourceType?: ACL_ResourceType | string;
};

export type ResourceOptionsByType = Partial<
  Record<'Cluster' | 'Group' | 'Topic' | 'TransactionalId', ComboboxOption[]>
>;

export function compareDisplayText(a: string, b: string): number {
  const displayComparison = displayTextCollator.compare(a, b);
  if (displayComparison !== 0) {
    return displayComparison;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareDisplayText(a.name, b.name));
}

export function sortByPrincipal<T extends PrincipalItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareDisplayText(a.principal, b.principal));
}

export function sortAclEntries<T extends SortableAclEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const comparisons = [
      compareDisplayText(a.resourceType, b.resourceType),
      compareDisplayText(a.resourceName, b.resourceName),
      compareDisplayText(a.operation, b.operation),
      compareDisplayText(a.permission, b.permission),
      compareDisplayText(a.host ?? '', b.host ?? ''),
      compareDisplayText(a.roleName ?? '', b.roleName ?? ''),
      compareDisplayText(a.principal ?? '', b.principal ?? ''),
    ];

    return comparisons.find((result) => result !== 0) ?? 0;
  });
}

function toComboboxOptions(values: Iterable<string>): ComboboxOption[] {
  return [...values].sort(compareDisplayText).map((value) => ({
    label: value,
    value,
  }));
}

export function getAclResourceTypeLabel(resourceType: ACL_ResourceType | string | undefined): string | undefined {
  if (resourceType === undefined) {
    return;
  }

  switch (resourceType) {
    case ACL_ResourceType.TOPIC:
    case 'topic':
      return 'Topic';
    case ACL_ResourceType.GROUP:
    case 'consumerGroup':
      return 'Group';
    case ACL_ResourceType.CLUSTER:
    case 'cluster':
      return 'Cluster';
    case ACL_ResourceType.TRANSACTIONAL_ID:
    case 'transactionalId':
      return 'TransactionalId';
    default:
      return;
  }
}

export function buildPrincipalAutocompleteOptions({
  excludePrincipals = [],
  includeUserPrefix = true,
  principals = [],
  roles = [],
  users = [],
}: {
  excludePrincipals?: readonly string[];
  includeUserPrefix?: boolean;
  principals?: readonly string[];
  roles?: readonly string[];
  users?: readonly string[];
}): ComboboxOption[] {
  const values = new Set<string>();
  const excluded = new Set(excludePrincipals);

  if (includeUserPrefix) {
    values.add('User:');
  }

  for (const user of users) {
    if (user) {
      values.add(`User:${user}`);
    }
  }

  for (const role of roles) {
    if (role) {
      values.add(`RedpandaRole:${role}`);
    }
  }

  for (const principal of principals) {
    if (principal) {
      values.add(principal);
    }
  }

  for (const principal of excluded) {
    values.delete(principal);
  }

  return toComboboxOptions(values);
}

export function buildResourceOptionsByType(resources: readonly ResourceOptionSource[]): ResourceOptionsByType {
  const valuesByType = new Map<keyof ResourceOptionsByType, Set<string>>();

  for (const resource of resources) {
    const label = getAclResourceTypeLabel(resource.resourceType);
    if (!(label && resource.resourceName)) {
      continue;
    }

    const existing = valuesByType.get(label as keyof ResourceOptionsByType) ?? new Set<string>();
    existing.add(resource.resourceName);
    valuesByType.set(label as keyof ResourceOptionsByType, existing);
  }

  return {
    Cluster: toComboboxOptions(valuesByType.get('Cluster') ?? []),
    Group: toComboboxOptions(valuesByType.get('Group') ?? []),
    Topic: toComboboxOptions(valuesByType.get('Topic') ?? []),
    TransactionalId: toComboboxOptions(valuesByType.get('TransactionalId') ?? []),
  };
}

export function flattenAclDetails(details?: AclDetail[]): ACLEntry[] {
  if (!(details && Array.isArray(details))) {
    return [];
  }

  const entries: ACLEntry[] = [];

  for (const detail of details) {
    const host = detail.sharedConfig?.host || '*';

    for (const rule of detail.rules ?? []) {
      for (const [operation, permission] of Object.entries(rule.operations ?? {})) {
        if (permission === 'not-set') {
          continue;
        }

        entries.push({
          resourceType:
            getAclResourceTypeLabel(rule.resourceType) ??
            resourceTypeLabels[rule.resourceType] ??
            rule.resourceType ??
            'Unknown',
          resourceName: getResourceNameValue(rule),
          operation: operationLabels[operation] ?? operation,
          permission: permission === 'allow' ? 'Allow' : 'Deny',
          host,
          resourcePatternType:
            rule.selectorType === 'any'
              ? ACL_ResourcePatternType.LITERAL
              : getGRPCResourcePatternType(rule.selectorType),
        });
      }
    }
  }

  return sortAclEntries(entries);
}
