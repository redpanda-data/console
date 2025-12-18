/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  formatLabel,
  getIdFromRule,
  getOperationsForResourceType,
  getPluralResourceName,
  getResourceName,
  type OperationType,
  type Rule,
} from './acl.model';

type OperationsBadgesProps = {
  rule: Rule;
  showResourceDescription?: boolean;
};

type PermissionBadgeProps = {
  isAllow: boolean;
  children: React.ReactNode;
  testId?: string;
};

const PermissionBadge = ({ isAllow, children, testId }: PermissionBadgeProps) => {
  const colorClasses = isAllow ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${colorClasses}`}
      data-testid={testId}
    >
      {children}
    </span>
  );
};

export const OperationsBadge = ({ rule, showResourceDescription = true }: OperationsBadgesProps) => {
  const enabledOperations = Object.entries(rule.operations).map(([op, value]: [string, OperationType]) => ({
    name: formatLabel(op),
    originName: op,
    value,
  }));

  // Check if all operations have the same permission
  const availableRules = Object.entries(getOperationsForResourceType(rule.resourceType)).length;
  const allAllow =
    enabledOperations.length > 0 &&
    availableRules === enabledOperations.length &&
    enabledOperations.every((op) => op.value === 'allow');
  const allDeny =
    enabledOperations.length > 0 &&
    availableRules === enabledOperations.length &&
    enabledOperations.every((op) => op.value === 'deny');
  const showSummary = allAllow || allDeny;

  // Generate resource description text
  let resourceText = '';
  if (showResourceDescription) {
    if (rule.resourceType === 'cluster' || rule.resourceType === 'schemaRegistry') {
      resourceText = getResourceName(rule.resourceType);
    } else if (rule.selectorType === 'any') {
      resourceText = `All ${getPluralResourceName(rule.resourceType)}`;
    } else {
      const matchType = rule.selectorType === 'literal' ? 'matching' : 'starting with';
      resourceText = `${getPluralResourceName(rule.resourceType)} ${matchType}: "${rule.selectorValue}"`;
    }
    resourceText = resourceText.charAt(0).toUpperCase() + resourceText.slice(1);
  }

  return (
    <div className="space-y-3">
      {Boolean(showResourceDescription) && <div className="font-medium text-gray-900">{resourceText}</div>}
      <div>
        {enabledOperations.length === 0 ? (
          <span className="text-gray-400 text-xs italic">No operations configured</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {showSummary ? (
              <PermissionBadge isAllow={allAllow}>{allAllow ? 'Allow all' : 'Deny all'}</PermissionBadge>
            ) : (
              enabledOperations.map((op) => (
                <PermissionBadge
                  isAllow={op.value === 'allow'}
                  key={op.name}
                  testId={`detail-item-op-${getIdFromRule(rule, op.originName, op.value)}`}
                >
                  {op.name}: {op.value}
                </PermissionBadge>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
