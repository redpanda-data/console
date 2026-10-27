import { useState } from 'react';

import {
  createAllowAllRules,
  createRule,
  getInitialRules,
  getNextRuleResourceType,
  getOperationChange,
  getPermissionModeChange,
  getResourceTypeChange,
  isClusterDisabledForRule,
  isSchemaRegistryDisabledForRule,
  isSubjectDisabledForRule,
} from '../acls/acl-rule-editing';
import { getInitialRuleIdCounter, type ResourceType, type Rule } from '../shared/acl-model';

/** Owns the ACL rule list of the create/edit form and the per-rule edits it offers. */
export function useAclRulesEditor(initialRules: Rule[] | undefined, schemaRegistryEnabled: boolean) {
  const [nextRuleId, setNextRuleId] = useState(() => getInitialRuleIdCounter(initialRules));
  const [rules, setRules] = useState<Rule[]>(() => getInitialRules(initialRules));

  const updateRule = (id: number, updates: Partial<Rule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const updateExistingRule = (id: number, getUpdates: (rule: Rule) => Partial<Rule>) => {
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      updateRule(id, getUpdates(rule));
    }
  };

  const addRule = () => {
    setNextRuleId(nextRuleId + 1);
    setRules([...rules, createRule(nextRuleId, getNextRuleResourceType(rules))]);
  };

  return {
    rules,
    addRule,
    updateRule,
    addAllowAllOperations: () => setRules(createAllowAllRules(schemaRegistryEnabled, Date.now())),
    removeRule: (id: number) => setRules(rules.filter((rule) => rule.id !== id)),
    handleResourceTypeChange: (ruleId: number, resourceType: ResourceType) =>
      updateRule(ruleId, getResourceTypeChange(resourceType)),
    handlePermissionModeChange: (ruleId: number, mode: string) =>
      updateExistingRule(ruleId, (rule) => getPermissionModeChange(rule, mode)),
    handleOperationChange: (ruleId: number, operation: string, value: string) =>
      updateExistingRule(ruleId, (rule) => getOperationChange(rule, operation, value)),
    isClusterDisabledForRule: (ruleId: number) => isClusterDisabledForRule(rules, ruleId),
    isSchemaRegistryDisabledForRule: (ruleId: number) =>
      isSchemaRegistryDisabledForRule(rules, ruleId, schemaRegistryEnabled),
    isSubjectDisabledForRule: (ruleId: number) => isSubjectDisabledForRule(rules, ruleId, schemaRegistryEnabled),
  };
}
