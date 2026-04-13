import {
  type AclDetail,
  getGRPCResourcePatternType,
  getResourceNameValue,
} from 'components/pages/security/shared/acl-model';
import type { ComboboxOption } from 'components/redpanda-ui/components/combobox';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type ListACLsResponse_Resource,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';

import type { ACLEntry } from './acl-editor';

/**
 * Numeric-aware, case-insensitive collator used throughout so "topic-10" sorts
 * after "topic-2" in every list rendered to the user.
 */
const displayTextCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
  usage: 'sort',
});

/**
 * Maps form-model resource type strings (used in `AclDetail` rules) to the
 * display labels shown in the ACL editor. Kept separate from the protobuf
 * enum map because the form model uses its own string identifiers.
 */
const resourceTypeLabels: Record<string, string> = {
  cluster: 'Cluster',
  consumerGroup: 'Group',
  schemaRegistry: 'SchemaRegistry',
  subject: 'Subject',
  topic: 'Topic',
  transactionalId: 'TransactionalId',
};

/**
 * Maps form-model operation strings (upper-snake from react-hook-form) to the
 * display labels rendered in the ACL editor table.
 */
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

/**
 * Minimal shape required for stable multi-key ACL sorting. Generic so both
 * `ACLEntry` (editor) and `UserAcl` (users tab) can share the same comparator.
 */
type SortableAclEntry = Pick<ACLEntry, 'operation' | 'permission' | 'resourceName' | 'resourceType'> & {
  host?: string;
  principal?: string;
  roleName?: string;
};

type ResourceOptionSource = {
  resourceName?: string;
  resourceType?: ACL_ResourceType | string;
};

/** Combobox options for ACL resource creation, pre-grouped by resource type. */
export type ResourceOptionsByType = Partial<
  Record<'Cluster' | 'Group' | 'Topic' | 'TransactionalId', ComboboxOption[]>
>;

/** Flat view-model for a single ACL row displayed in the Users tab. */
export type UserAcl = {
  resourceType: string;
  resourceName: string;
  operation: string;
  permission: string;
};

/**
 * Compares two display strings using numeric-aware, case-insensitive collation,
 * falling back to a raw string tiebreaker when the collator considers them
 * equal. The tiebreaker keeps "ALICE" / "Alice" / "alice" in a stable order
 * instead of treating them as identical.
 *
 * @param a - First string to compare.
 * @param b - Second string to compare.
 * @returns Negative, zero, or positive number suitable for use in `Array.sort`.
 */
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

/**
 * Sorts any collection that has a `name` field using {@link compareDisplayText}.
 *
 * @param items - Collection to sort.
 * @returns New sorted array; the original is not mutated.
 */
export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareDisplayText(a.name, b.name));
}

/**
 * Sorts any collection that has a `principal` field using {@link compareDisplayText}.
 *
 * @param items - Collection to sort.
 * @returns New sorted array; the original is not mutated.
 */
export function sortByPrincipal<T extends PrincipalItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareDisplayText(a.principal, b.principal));
}

/**
 * Sorts ACL rows by the tuple (resourceType, resourceName, operation,
 * permission, host, roleName, principal) so the table order is deterministic
 * regardless of API response ordering.
 *
 * @param entries - ACL rows to sort.
 * @returns New sorted array; the original is not mutated.
 */
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

/**
 * Converts a de-duplicated set of string values into sorted combobox options.
 *
 * @param values - Iterable of unique string values.
 * @returns Sorted array of `{label, value}` pairs.
 */
function toComboboxOptions(values: Iterable<string>): ComboboxOption[] {
  return [...values].sort(compareDisplayText).map((value) => ({
    label: value,
    value,
  }));
}

/**
 * Translates a resource type to its UI display label.
 *
 * @remarks
 * Accepts both the protobuf enum (from API responses) and the form-model
 * string (from `AclDetail` rules) so callers don't need two separate helpers.
 * Returns `undefined` for types not shown in the ACL editor (e.g. `ANY`).
 *
 * @param resourceType - Protobuf enum value or form-model string.
 * @returns Display label, or `undefined` if the type is not editor-visible.
 */
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

/**
 * Builds the sorted list of principal options for the ACL editor combobox.
 *
 * @remarks
 * Merges live principals from existing ACLs, known users, and Redpanda roles
 * into a single de-duplicated list so the user can pick from what already
 * exists or type a new value. The `User:` prefix entry is included by default
 * as a typing prompt.
 *
 * @returns Sorted, de-duplicated combobox options with `excludePrincipals` removed.
 */
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

/**
 * Groups resource names by their display type for the ACL editor resource
 * combobox. Callers pass the raw API resource list; this function filters to
 * the four types the editor supports and de-duplicates names within each group.
 *
 * @param resources - Raw API resource list.
 * @returns Options keyed by display type; unsupported types are omitted.
 */
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

/**
 * Converts the react-hook-form `AclDetail` tree into the flat `ACLEntry` rows
 * consumed by the ACL editor table and the delete/create mutations. The
 * form model uses string keys and human-readable operation names; this
 * function translates those to the display labels and protobuf pattern types
 * expected downstream.
 *
 * @param details - Form-model ACL details, typically from `useFormContext`.
 * @returns Sorted flat array of `ACLEntry` rows, or `[]` if input is absent.
 */
export function flattenAclDetails(details?: AclDetail[]): ACLEntry[] {
  if (!Array.isArray(details)) {
    return [];
  }
  return sortAclEntries(details.flatMap(detailToEntries));
}

/** @internal Expands a single `AclDetail` into its `ACLEntry` rows. */
function detailToEntries(detail: AclDetail): ACLEntry[] {
  const host = detail.sharedConfig?.host || '*';
  return (detail.rules ?? []).flatMap((rule) => ruleToEntries(rule, host));
}

/** @internal Expands a single rule's operation map into `ACLEntry` rows, skipping `not-set` operations. */
function ruleToEntries(rule: AclDetail['rules'][number], host: string): ACLEntry[] {
  return Object.entries(rule.operations ?? {})
    .filter(([, permission]) => permission !== 'not-set')
    .map(([operation, permission]) => ({
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
        rule.selectorType === 'any' ? ACL_ResourcePatternType.LITERAL : getGRPCResourcePatternType(rule.selectorType),
    }));
}

/**
 * Translates the protobuf `ACL_ResourceType` enum to a display label.
 *
 * @remarks
 * Separate from {@link getAclResourceTypeLabel} because that function only
 * covers the four types the ACL editor supports and returns `undefined` for
 * others. This variant handles all enum values for the Users tab summary view.
 *
 * @param resourceType - Protobuf resource type enum value.
 * @returns Human-readable label, or `'Unknown'` for unrecognised values.
 */
function resourceTypeLabel(resourceType: ACL_ResourceType): string {
  switch (resourceType) {
    case ACL_ResourceType.ANY:
      return 'Any';
    case ACL_ResourceType.TOPIC:
      return 'Topic';
    case ACL_ResourceType.GROUP:
      return 'Group';
    case ACL_ResourceType.CLUSTER:
      return 'Cluster';
    case ACL_ResourceType.TRANSACTIONAL_ID:
      return 'TransactionalId';
    case ACL_ResourceType.DELEGATION_TOKEN:
      return 'DelegationToken';
    case ACL_ResourceType.USER:
      // USER resource type represents Redpanda roles in the ACL system.
      return 'RedpandaRole';
    default:
      return 'Unknown';
  }
}

/**
 * Translates the protobuf `ACL_Operation` enum to a display label for the
 * Users tab ACL summary hover card.
 *
 * @param operation - Protobuf operation enum value.
 * @returns Human-readable label, or `'Unknown'` for unrecognised values.
 */
function operationLabel(operation: ACL_Operation): string {
  switch (operation) {
    case ACL_Operation.ANY:
      return 'Any';
    case ACL_Operation.ALL:
      return 'All';
    case ACL_Operation.READ:
      return 'Read';
    case ACL_Operation.WRITE:
      return 'Write';
    case ACL_Operation.CREATE:
      return 'Create';
    case ACL_Operation.DELETE:
      return 'Delete';
    case ACL_Operation.ALTER:
      return 'Alter';
    case ACL_Operation.DESCRIBE:
      return 'Describe';
    case ACL_Operation.CLUSTER_ACTION:
      return 'ClusterAction';
    case ACL_Operation.DESCRIBE_CONFIGS:
      return 'DescribeConfigs';
    case ACL_Operation.ALTER_CONFIGS:
      return 'AlterConfigs';
    case ACL_Operation.IDEMPOTENT_WRITE:
      return 'IdempotentWrite';
    default:
      return 'Unknown';
  }
}

/**
 * Translates the protobuf `ACL_PermissionType` enum to `'Allow'` or `'Deny'`.
 *
 * @param permissionType - Protobuf permission type enum value.
 * @returns `'Deny'` for `DENY`, `'Allow'` for everything else.
 */
function permissionLabel(permissionType: ACL_PermissionType): string {
  return permissionType === ACL_PermissionType.DENY ? 'Deny' : 'Allow';
}

/**
 * Builds a map of username → sorted `UserAcl` entries from the raw API resource list.
 *
 * @remarks
 * Only `User:` principals are included — role and group principals are not
 * relevant to the Users tab. The result is consumed by `UsersTab` to render
 * the per-user ACL hover card without re-processing the full ACL list on every
 * render.
 *
 * @param resources - Raw `ListACLsResponse` resource list.
 * @returns Map keyed by bare username (without the `User:` prefix).
 */
export function buildUserAclsMap(resources: readonly ListACLsResponse_Resource[]): Map<string, UserAcl[]> {
  const map = new Map<string, UserAcl[]>();

  for (const resource of resources) {
    for (const acl of resource.acls) {
      const principal = acl.principal || '';
      if (!principal.startsWith('User:')) {
        continue;
      }
      const userName = principal.substring(5);
      const entry: UserAcl = {
        resourceType: resourceTypeLabel(resource.resourceType),
        resourceName: resource.resourceName,
        operation: operationLabel(acl.operation),
        permission: permissionLabel(acl.permissionType),
      };
      const existing = map.get(userName);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(userName, [entry]);
      }
    }
  }

  for (const [userName, acls] of map.entries()) {
    map.set(userName, sortAclEntries(acls));
  }

  return map;
}
