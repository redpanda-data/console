import {
  createAllowAllRules,
  createRule,
  getNextRuleResourceType,
  getOperationChange,
  getPermissionModeChange,
  isClusterDisabledForRule,
  isSchemaRegistryDisabledForRule,
  isSubjectDisabledForRule,
} from './acl-rule-editing';
import { describe, expect, test } from 'bun:test';
import {
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  ResourceTypeCluster,
  ResourceTypeSchemaRegistry,
  ResourceTypeSubject,
  ResourceTypeTopic,
} from '../shared/acl-model';

describe('getNextRuleResourceType', () => {
  test('starts with a cluster rule and falls back to topics once one exists', () => {
    expect(getNextRuleResourceType([])).toBe(ResourceTypeCluster);
    expect(getNextRuleResourceType([createRule(1, ResourceTypeCluster)])).toBe(ResourceTypeTopic);
  });
});

describe('createAllowAllRules', () => {
  test('adds Schema Registry resource types only when the API is available', () => {
    expect(createAllowAllRules(false, 10).map((rule) => rule.resourceType)).not.toContain(ResourceTypeSubject);
    expect(createAllowAllRules(true, 10).map((rule) => rule.id)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  test('allows every operation of each rule', () => {
    for (const rule of createAllowAllRules(true, 1)) {
      expect(rule.mode).toBe(ModeAllowAll);
      expect(new Set(Object.values(rule.operations))).toEqual(new Set([OperationTypeAllow]));
    }
  });
});

describe('single-rule resource types', () => {
  const rules = [createRule(1, ResourceTypeCluster), createRule(2, ResourceTypeTopic)];

  test('keeps a resource type selectable on the rule that already uses it', () => {
    expect(isClusterDisabledForRule(rules, 1)).toBe(false);
    expect(isClusterDisabledForRule(rules, 2)).toBe(true);
  });

  test('disables Schema Registry types when the API is unavailable', () => {
    expect(isSchemaRegistryDisabledForRule(rules, 2, false)).toBe(true);
    expect(isSubjectDisabledForRule(rules, 2, false)).toBe(true);
    expect(isSchemaRegistryDisabledForRule(rules, 2, true)).toBe(false);
  });

  test('never disables an unknown rule', () => {
    expect(isSubjectDisabledForRule(rules, 99, false)).toBe(false);
    expect(isSchemaRegistryDisabledForRule([createRule(3, ResourceTypeSchemaRegistry)], 3, false)).toBe(false);
  });
});

describe('permission edits', () => {
  test('a mode sets every operation of the rule', () => {
    const change = getPermissionModeChange(createRule(1, ResourceTypeTopic), ModeDenyAll);
    expect(change.mode).toBe(ModeDenyAll);
    expect(new Set(Object.values(change.operations ?? {}))).toEqual(new Set([OperationTypeDeny]));
  });

  test('an operation that breaks the mode turns the rule custom', () => {
    const rule = {
      ...createRule(1, ResourceTypeTopic),
      ...getPermissionModeChange(createRule(1, ResourceTypeTopic), ModeAllowAll),
    };
    expect(getOperationChange(rule, 'READ', OperationTypeAllow).mode).toBe(ModeAllowAll);
    expect(getOperationChange(rule, 'READ', OperationTypeDeny).mode).toBe(ModeCustom);
  });
});
