import { toast } from 'sonner';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';

import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';
import type { RawFieldSpec } from '../types/schema';
import type { StepSubmissionResult } from '../types/wizard';

export const handleStepResult = <T>(result: StepSubmissionResult<T> | undefined, onSuccess: () => void): boolean => {
  if (!result) {
    return false;
  }

  if (result.operations && result.operations.length > 0) {
    for (const operation of result.operations) {
      if (operation.success && operation.message) {
        toast.success(operation.message, {
          description: operation.operation,
        });
      } else if (!operation.success && operation.error) {
        toast.error(operation.error, {
          description: operation.operation,
        });
      }
    }
  }

  if (result.success) {
    if ((!result.operations || result.operations.length === 0) && result.message) {
      toast.success(result.message);
    }
    onSuccess();
    return true;
  }

  if (result.error && (!result.operations || result.operations.length === 0)) {
    toast.error(result.error);
  }

  return false;
};

/**
 * Checks if a field name is topic-related
 * Matches: 'topic' (outputs/cache) or 'topics' (inputs)
 */
export const isTopicField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return normalizedName === 'topic' || normalizedName === 'topics';
};

/**
 * Checks if a field name is user/authentication-related
 * Matches: 'user' (kafka sasl) or 'username' (redpanda sasl)
 */
export const isUserField = (fieldName: string): boolean => {
  const normalized = fieldName.toLowerCase();
  return normalized === 'user' || normalized === 'username';
};

/**
 * Checks if a field name is password-related
 * Matches: 'password' (nested in sasl object)
 */
export const isPasswordField = (fieldName: string): boolean => fieldName.toLowerCase() === 'password';

/**
 * Checks if a field should be prepopulated with REDPANDA_BROKERS contextual variable
 * Matches: 'seed_brokers', 'addresses', 'brokers'
 */
export const isBrokerField = (fieldName: string): boolean => {
  const normalized = fieldName.toLowerCase();
  return normalized === 'seed_brokers' || normalized === 'addresses' || normalized === 'brokers';
};

/**
 * Checks if a field is schema_registry.url that should use REDPANDA_SCHEMA_REGISTRY_URL
 * Requires checking both field name and parent context
 */
export const isSchemaRegistryUrlField = (fieldName: string, parentName?: string): boolean => {
  const isUrl = fieldName.toLowerCase() === 'url';
  const parentIsSchemaRegistry = parentName?.toLowerCase() === 'schema_registry';
  return isUrl && !!parentIsSchemaRegistry;
};

/**
 * Checks if a RawFieldSpec or its children have wizard-relevant fields
 * Used to determine if advanced/optional fields should be shown
 */
export const hasWizardRelevantFields = (spec: RawFieldSpec, componentName?: string): boolean => {
  if (!(componentName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName))) {
    return false;
  }

  const topicData = onboardingWizardStore.getTopicData();
  const userData = onboardingWizardStore.getUserData();

  if (spec.name && isTopicField(spec.name) && topicData?.topicName) {
    return true;
  }
  if (spec.name && isUserField(spec.name) && userData?.username) {
    return true;
  }
  if (spec.name && isPasswordField(spec.name) && userData?.username) {
    return true;
  }

  if (spec.children && spec.children.length > 0) {
    for (const child of spec.children) {
      if (hasWizardRelevantFields(child, componentName)) {
        return true;
      }
    }
  }

  return false;
};
