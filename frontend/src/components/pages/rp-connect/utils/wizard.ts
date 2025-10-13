import { toast } from 'sonner';
import { CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from 'state/connect/state';

import { REDPANDA_SECRET_COMPONENTS } from '../types/constants';
import type { RawFieldSpec } from '../types/schema';
import type { AddTopicFormData, AddUserFormData, StepSubmissionResult } from '../types/wizard';

export const handleStepResult = <T>(result: StepSubmissionResult<T> | undefined, onSuccess: () => void): boolean => {
  if (result?.success) {
    if (result.message) {
      toast.success(result.message);
    }
    onSuccess();
    return true;
  }
  return false;
};

/**
 * Reads persisted wizard data from session storage
 */
export const getPersistedWizardData = () => {
  let topicData: AddTopicFormData | undefined;
  let userData: AddUserFormData | undefined;

  const topicJson = sessionStorage.getItem(CONNECT_WIZARD_TOPIC_KEY);
  if (topicJson) {
    topicData = JSON.parse(topicJson);
  }

  const userJson = sessionStorage.getItem(CONNECT_WIZARD_USER_KEY);
  if (userJson) {
    userData = JSON.parse(userJson);
  }

  return { topicData, userData };
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
 * Checks if a RawFieldSpec or its children have wizard-relevant fields
 * Used to determine if advanced/optional fields should be shown
 */
export const hasWizardRelevantFields = (spec: RawFieldSpec, componentName?: string): boolean => {
  if (!(componentName && REDPANDA_SECRET_COMPONENTS.includes(componentName))) {
    return false;
  }

  const { topicData, userData } = getPersistedWizardData();

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
