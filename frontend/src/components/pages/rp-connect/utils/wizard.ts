import { toast } from 'sonner';
import { useRpcnWizardStore } from 'state/rpcn-wizard-store';

import { getConnectTemplate } from './yaml';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';
import type { ConnectComponentSpec } from '../types/schema';
import type { StepSubmissionResult } from '../types/wizard';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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

/** Regenerates YAML for components needing topic/user data, at the ADD_TOPIC and ADD_USER steps. */
export const regenerateYamlForTopicUserComponents = (components: ConnectComponentSpec[]): void => {
  const { setWizardData: _, ...wizardData } = useRpcnWizardStore.getState();

  const inputNeedsTopicUser =
    wizardData.input?.connectionName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(wizardData.input.connectionName);
  const outputNeedsTopicUser =
    wizardData.output?.connectionName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(wizardData.output.connectionName);

  if (inputNeedsTopicUser || outputNeedsTopicUser) {
    let yamlContent = useRpcnWizardStore.getState().yamlContent || '';

    if (inputNeedsTopicUser && wizardData.input?.connectionName && wizardData.input?.connectionType) {
      yamlContent =
        getConnectTemplate({
          connectionName: wizardData.input.connectionName,
          connectionType: wizardData.input.connectionType,
          components,
          existingYaml: yamlContent,
        }) || yamlContent;
    }

    if (outputNeedsTopicUser && wizardData.output?.connectionName && wizardData.output?.connectionType) {
      yamlContent =
        getConnectTemplate({
          connectionName: wizardData.output.connectionName,
          connectionType: wizardData.output.connectionType,
          components,
          existingYaml: yamlContent,
        }) || yamlContent;
    }

    useRpcnWizardStore.getState().setYamlContent({ yamlContent });
  }
};

/** Matches 'topic' (outputs/cache) or 'topics' (inputs). */
export const isTopicField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return normalizedName === 'topic' || normalizedName === 'topics';
};

/** Matches 'user' (kafka sasl) or 'username' (redpanda sasl). */
export const isUserField = (fieldName: string): boolean => {
  const normalized = fieldName.toLowerCase();
  return normalized === 'user' || normalized === 'username';
};

export const isPasswordField = (fieldName: string): boolean => fieldName.toLowerCase() === 'password';

export const isConsumerGroupField = (fieldName: string): boolean => fieldName.toLowerCase() === 'consumer_group';

/** True for schema_registry.url, which should use REDPANDA_SCHEMA_REGISTRY_URL. */
export const isSchemaRegistryUrlField = (fieldName: string, parentName?: string): boolean => {
  const isUrl = fieldName.toLowerCase() === 'url';
  const parentIsSchemaRegistry = parentName?.toLowerCase() === 'schema_registry';
  return isUrl && !!parentIsSchemaRegistry;
};
