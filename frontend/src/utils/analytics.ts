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

/**
 * Check if analytics/tracking is enabled based on the backend configuration.
 * This should be used to conditionally load tracking scripts and enable analytics features.
 *
 * @returns true if analytics is enabled, false otherwise
 */
export function isAnalyticsEnabled(): boolean {
  const enabledFeatures = (window as { ENABLED_FEATURES?: string }).ENABLED_FEATURES?.split(',') ?? [];
  return enabledFeatures.includes('ANALYTICS');
}

/**
 * API Onboarding Wizard
 */
export const serverlessApiOnboardingWizardExistingTopicChangeEvent =
  'fe_serverless_api_onboarding_wizard_existing_topic_change';
export const serverlessApiOnboardingWizardExistingUserChangeEvent =
  'fe_serverless_api_onboarding_wizard_existing_user_change';
export const serverlessApiOnboardingWizardNewTopicChangeEvent = 'fe_serverless_api_onboarding_wizard_new_topic_change';
export const serverlessApiOnboardingWizardNewUserChangeEvent = 'fe_serverless_api_onboarding_wizard_new_user_change';

/**
 * Redpanda Connect Onboarding Wizard
 */
export const rpcnOnboardingWizardInputConnectorChangeEvent = 'fe_rpcn_onboarding_wizard_input_connector_change';
export const rpcnOnboardingWizardOutputConnectorChangeEvent = 'fe_rpcn_onboarding_wizard_output_connector_change';
export const rpcnOnboardingWizardExistingTopicChangeEvent = 'fe_rpcn_onboarding_wizard_existing_topic_change';
export const rpcnOnboardingWizardExistingUserChangeEvent = 'fe_rpcn_onboarding_wizard_existing_user_change';
export const rpcnOnboardingWizardNewTopicChangeEvent = 'fe_rpcn_onboarding_wizard_new_topic_change';
export const rpcnOnboardingWizardNewUserChangeEvent = 'fe_rpcn_onboarding_wizard_new_user_change';
