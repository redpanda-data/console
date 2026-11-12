import type { AclResource, ConfigEntry, GetAclsRequest } from '../state/rest-interfaces';
import type { GroupDescription } from '../types/consumer-groups';
import type { ClusterConnectors } from '../types/kafka-connect';
import { arraySum } from '../utils/array-utils';
import { objToKv } from '../utils/tsx-utils';
import { isPresent } from '../utils/type-guards';

export function addFrontendFieldsForConnectCluster(cluster: ClusterConnectors) {
  const allowedActions = cluster.allowedActions ?? ['all'];
  const allowAll = allowedActions.includes('all');

  cluster.canViewCluster = allowAll || allowedActions.includes('viewConnectCluster');
  cluster.canEditCluster = allowAll || allowedActions.includes('editConnectCluster');
  cluster.canDeleteCluster = allowAll || allowedActions.includes('deleteConnectCluster');

  for (const connector of cluster.connectors) {
    if (isPresent(connector.config)) {
      connector.jsonConfig = JSON.stringify(connector.config, undefined, 4);
    } else {
      connector.jsonConfig = '';
    }
  }
}

export function addFrontendFieldsForConsumerGroup(g: GroupDescription) {
  g.lagSum = arraySum(g.topicOffsets, (o) => o.summedLag);
  if (g.allowedActions) {
    if (g.allowedActions.includes('all')) {
      // All perms
    } else {
      // Not all perms, set helper props
      g.noEditPerms = !g.allowedActions?.includes('editConsumerGroup');
      g.noDeletePerms = !g.allowedActions?.includes('deleteConsumerGroup');
    }
  }
  g.isInUse = g.state.toLowerCase() !== 'empty';
}

// 1. add 'type' to each synonym, so when expanding a config entry (to view its synonyms), we can still see the type
// 2. remove redundant synonym entries (those that have the same source as the root config entry)
export function prepareSynonyms(configEntries: ConfigEntry[]) {
  if (!Array.isArray(configEntries)) {
    return;
  }

  for (const e of configEntries) {
    if (e.synonyms === undefined) {
      continue;
    }

    // add 'type' from root object
    for (const s of e.synonyms) {
      s.type = e.type;
    }
  }
}

export function normalizeAcls(acls: AclResource[]) {
  function upperFirst(str: string): string {
    if (!str) {
      return str;
    }
    const lower = str.toLowerCase();
    const first = lower[0];
    const result = first.toUpperCase() + lower.slice(1);
    return result;
  }

  const specialCaseMap = {
    TRANSACTIONAL_ID: 'TransactionalID',
  } as {
    [key: string]: string;
  };
  function normalizeStringEnum(str: string): string {
    if (!str) {
      return str;
    }
    if (specialCaseMap[str]) {
      return specialCaseMap[str];
    }

    const parts = str.split('_');
    for (let i = 0; i < parts.length; i++) {
      parts[i] = upperFirst(parts[i].toLowerCase());
    }
    const result = parts.join('');
    return result;
  }

  for (const e of acls) {
    e.resourceType = normalizeStringEnum(e.resourceType);
    e.resourcePatternType = normalizeStringEnum(e.resourcePatternType);

    for (const acl of e.acls) {
      acl.operation = normalizeStringEnum(acl.operation);
      acl.permissionType = normalizeStringEnum(acl.permissionType);
    }
  }
}

export function aclRequestToQuery(request: GetAclsRequest): string {
  const filters = objToKv(request)
    .filter((kv) => Boolean(kv.value))
    .map((x) => [x.key, String(x.value)]);

  const searchParams = new URLSearchParams(filters);
  return searchParams.toString();
}
