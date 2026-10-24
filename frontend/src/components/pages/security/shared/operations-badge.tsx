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

import clsx from 'clsx';

import {
  formatLabel,
  getIdFromRule,
  getOperationsForResourceType,
  getPluralResourceName,
  getResourceName,
  type OperationType,
  type Rule,
} from './acl-model';

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
  const colorClasses = isAllow ? 'bg-success-wash text-success' : 'bg-destructive-wash text-destructive';

  return (
    <span
      className={clsx('inline-flex items-center rounded-full px-2 py-1 text-body-sm font-medium', colorClasses)}
      data-testid={testId}
    >
      {children}
    </span>
  );
};

const getRuleResourceText = (rule: Rule) => {
  if (rule.resourceType === 'cluster' || rule.resourceType === 'schemaRegistry') {
    return getResourceName(rule.resourceType);
  }
  if (rule.selectorType === 'any') {
    return `All ${getPluralResourceName(rule.resourceType)}`;
  }
  const matchType = rule.selectorType === 'literal' ? 'matching' : 'starting with';
  return `${getPluralResourceName(rule.resourceType)} ${matchType}: "${rule.selectorValue}"`;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Whether every operation the resource type supports is set, and all to the same permission. */
const getUniformPermission = (rule: Rule, operations: { value: OperationType }[]) => {
  const coversAllOperations =
    operations.length > 0 &&
    Object.entries(getOperationsForResourceType(rule.resourceType)).length === operations.length;
  return {
    allAllow: coversAllOperations && operations.every((op) => op.value === 'allow'),
    allDeny: coversAllOperations && operations.every((op) => op.value === 'deny'),
  };
};

export const OperationsBadge = ({ rule, showResourceDescription = true }: OperationsBadgesProps) => {
  const enabledOperations = Object.entries(rule.operations).map(([op, value]: [string, OperationType]) => ({
    name: formatLabel(op),
    originName: op,
    value,
  }));
  const { allAllow, allDeny } = getUniformPermission(rule, enabledOperations);
  const showSummary = allAllow || allDeny;
  const resourceText = showResourceDescription ? capitalize(getRuleResourceText(rule)) : '';

  return (
    <div className="space-y-3">
      {Boolean(showResourceDescription) && <div className="font-medium text-strong">{resourceText}</div>}
      <div>
        {enabledOperations.length === 0 ? (
          <span className="text-body-sm text-disabled italic">No operations configured</span>
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
