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

import { waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { Feature, useSupportedFeaturesStore } from 'state/supported-features';

/**
 * Seed the real supported-features store the way the app does at boot, so the
 * shadow link feature gates exercise the actual endpoint-compatibility
 * fail-closed logic instead of a mock: a supported endpoint opens its gate,
 * anything else (unsupported, absent, or a never-loaded null store) closes it.
 *
 * setEndpointCompatibility replaces the whole endpoints array, so seed every
 * gate a test needs in one call — sequential per-gate calls would clobber
 * each other.
 */
export const setShadowLinkGatesSupported = ({
  schemaRegistrySync = false,
  roleSync = false,
}: {
  schemaRegistrySync?: boolean;
  roleSync?: boolean;
}) => {
  useSupportedFeaturesStore.getState().setEndpointCompatibility({
    kafkaVersion: 'v26.2.0',
    endpoints: [
      {
        endpoint: Feature.ShadowLinkSchemaRegistrySync.endpoint,
        method: Feature.ShadowLinkSchemaRegistrySync.method,
        isSupported: schemaRegistrySync,
      },
      {
        endpoint: Feature.ShadowLinkRoleSync.endpoint,
        method: Feature.ShadowLinkRoleSync.method,
        isSupported: roleSync,
      },
    ],
  });
};

export const setSchemaRegistrySyncGateSupported = (isSupported: boolean) => {
  setShadowLinkGatesSupported({ schemaRegistrySync: isSupported });
};

/**
 * Regex patterns for test IDs
 */
export const BOOTSTRAP_SERVER_INPUT_PATTERN = /bootstrap-server-input-\d+/;
export const TOPIC_FILTER_NAME_PATTERN = /topic-filter-\d+-name/;

/**
 * Action types for table-driven tests
 */
export type Action =
  | { type: 'addBootstrapServer'; value: string }
  | { type: 'enableTLS' }
  | { type: 'enableMTLS' }
  | { type: 'uploadCACertificate'; pemContent: string }
  | { type: 'uploadClientCertificates'; certPem: string; keyPem: string }
  | { type: 'updateMetadataMaxAge'; value: number }
  | { type: 'updateAdvancedOption'; field: string; value: number }
  | { type: 'addTopicFilter'; name: string }
  | { type: 'addTopicFilterWithPattern'; options: { name: string; patternType: PatternType; filterType: FilterType } }
  | { type: 'addConsumerFilter'; name: string }
  | { type: 'addACLFilter'; principal: string }
  | { type: 'toggleExcludeDefault' }
  | { type: 'enableSchemaRegistrySync' };

/**
 * Wait until the element with this test ID renders
 */
const waitForTestId = async (scr: typeof import('@testing-library/react').screen, testId: string) => {
  await waitFor(() => {
    expect(scr.getByTestId(testId)).toBeInTheDocument();
  });
};

/**
 * Wait for an input to render, then type into it
 */
const typeIntoTestId = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  testId: string,
  text: string
) => {
  await waitForTestId(scr, testId);
  await user.type(scr.getByTestId(testId), text);
};

/**
 * Navigate to the Shadowing tab (edit form; may already be there)
 */
const clickShadowingTabIfPresent = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }
};

/**
 * Expand a filter section (topics, consumers, acls) and switch it to specify mode
 */
const expandSectionInSpecifyMode = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  section: 'topics' | 'consumers' | 'acls'
) => {
  await waitForTestId(scr, `${section}-toggle-button`);

  // Expand the section
  await user.click(scr.getByTestId(`${section}-toggle-button`));
  await waitForTestId(scr, `${section}-specify-tab`);

  // Switch to specify mode
  await user.click(scr.getByTestId(`${section}-specify-tab`));
};

/**
 * Expand advanced options if not already expanded
 */
const expandAdvancedOptions = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  if (!scr.queryByTestId('advanced-options-content')) {
    await user.click(scr.getByTestId('advanced-options-toggle'));
    await waitForTestId(scr, 'advanced-options-content');
  }
};

/**
 * Expand the topics section and switch it to specify mode, skipping steps that are already done
 */
const openTopicFiltersInSpecifyMode = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  await waitForTestId(scr, 'topics-toggle-button');

  // Expand topics section if not already expanded
  if (!scr.queryByTestId('topics-filters-container')) {
    await user.click(scr.getByTestId('topics-toggle-button'));
  }

  await waitForTestId(scr, 'topics-specify-tab');

  // Switch to specify mode if not already in it
  const specifyTab = scr.getByTestId('topics-specify-tab');
  if (specifyTab.getAttribute('data-state') !== 'active') {
    await user.click(specifyTab);
  }

  await waitForTestId(scr, 'add-topic-filter-button');
};

/**
 * The topic filter to fill: filter 0 while it is the empty one seeded by the mode switch,
 * otherwise a newly added filter
 */
const nextTopicFilterIndex = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const existingNameInputs = scr.queryAllByTestId(TOPIC_FILTER_NAME_PATTERN);
  const firstValue = (existingNameInputs[0] as HTMLInputElement | undefined)?.value;
  if (!firstValue) {
    return 0;
  }

  // First filter is filled, add a new one
  await user.click(scr.getByTestId('add-topic-filter-button'));
  const filterIndex = existingNameInputs.length;
  await waitForTestId(scr, `topic-filter-${filterIndex}-name`);
  return filterIndex;
};

const TOPIC_FILTER_TAB_SUFFIX: Record<string, string> = {
  [`${FilterType.INCLUDE}-${PatternType.LITERAL}`]: 'include-specific',
  [`${FilterType.INCLUDE}-${PatternType.PREFIX}`]: 'include-prefix',
  [`${FilterType.EXCLUDE}-${PatternType.LITERAL}`]: 'exclude-specific',
  [`${FilterType.EXCLUDE}-${PatternType.PREFIX}`]: 'exclude-prefix',
};

/**
 * Pick the filter type tab matching the pattern and filter type
 */
const selectTopicFilterType = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  filterIndex: number,
  { patternType, filterType }: { patternType: PatternType; filterType: FilterType }
) => {
  const tabSuffix = TOPIC_FILTER_TAB_SUFFIX[`${filterType}-${patternType}`] ?? '';
  await user.click(scr.getByTestId(`topic-filter-${filterIndex}-${tabSuffix}`));
};

/**
 * Add a bootstrap server to the form
 */
export const addBootstrapServer = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  value: string
) => {
  const addButton = scr.getByTestId('add-bootstrap-server-button');
  await user.click(addButton);

  const inputs = scr.getAllByTestId(BOOTSTRAP_SERVER_INPUT_PATTERN);
  const newInput = inputs.at(-1);
  if (!newInput) {
    throw new Error('No bootstrap server input found after clicking add button');
  }
  await user.type(newInput, value);
};

/**
 * Enable TLS toggle
 */
export const enableTLS = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const tlsToggle = scr.getByTestId('tls-toggle');
  await user.click(tlsToggle);
};

/**
 * Enable mTLS toggle
 */
export const enableMTLS = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const mtlsToggle = scr.getByTestId('mtls-toggle');
  await user.click(mtlsToggle);
};

/**
 * Upload CA certificate (uses file path for easier testing)
 */
export const uploadCACertificate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  filePath: string
) => {
  // Wait for the CA button to appear after TLS is enabled
  const addCaButton = await waitFor(() => scr.getByTestId('add-ca-button'));
  await user.click(addCaButton);

  // Wait for dialog to open and be interactive
  const filePathTab = await waitFor(
    () => {
      const tab = scr.getByTestId('mtls-mode-file-path-tab');
      // Ensure it's visible and not disabled
      expect(tab).toBeVisible();
      return tab;
    },
    { timeout: 5000 }
  );

  // Switch to file path mode (from default PEM mode)
  await user.click(filePathTab);

  // Wait for file path input to appear
  await waitFor(() => {
    expect(scr.getByTestId('ca-file-path-input')).toBeInTheDocument();
  });

  // Type the file path
  const filePathInput = scr.getByTestId('ca-file-path-input');
  await user.type(filePathInput, filePath);

  // Save the certificate
  const saveButton = scr.getByTestId('save-certificate-button');
  await user.click(saveButton);

  // Wait for dialog to close
  await waitFor(() => {
    expect(scr.queryByTestId('certificate-dialog-ca')).not.toBeInTheDocument();
  });
};

/**
 * Upload client certificates (cert + key)
 */
export const uploadClientCertificates = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certPem: string,
  keyPem: string
) => {
  // Upload client certificate
  const addClientCertButton = scr.getByTestId('add-clientCert-button');
  await user.click(addClientCertButton);

  await waitFor(() => {
    expect(scr.getByTestId('clientCert-pem-input')).toBeInTheDocument();
  });

  const certInput = scr.getByTestId('clientCert-pem-input');
  await user.type(certInput, certPem);

  // Upload client key
  const addClientKeyButton = scr.getByTestId('add-clientKey-button');
  await user.click(addClientKeyButton);

  await waitFor(() => {
    expect(scr.getByTestId('clientKey-pem-input')).toBeInTheDocument();
  });

  const keyInput = scr.getByTestId('clientKey-pem-input');
  await user.type(keyInput, keyPem);
};

/**
 * Update metadata max age in advanced options
 */
export const updateMetadataMaxAge = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  value: number
) => {
  const advancedOptionsToggle = scr.getByTestId('advanced-options-toggle');
  await user.click(advancedOptionsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('advanced-options-content')).toBeInTheDocument();
  });

  const metadataMaxAgeInput = scr.getByTestId('metadata-max-age-field');
  await user.clear(metadataMaxAgeInput);
  await user.type(metadataMaxAgeInput, value.toString());
};

/**
 * Update any advanced client option
 */
export const updateAdvancedOption = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  field: string,
  value: number
) => {
  await expandAdvancedOptions(user, scr);

  // Get the field container and find the input within it
  const fieldInput = scr.getByTestId(`${field}-field`).querySelector('input');
  if (!fieldInput) {
    throw new Error(`No input found in field container: ${field}`);
  }
  await user.clear(fieldInput);
  await user.type(fieldInput, value.toString());
};

/**
 * Add a topic filter (edit form - with tab navigation)
 */
export const addTopicFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  // Navigate to Shadowing tab
  await user.click(scr.getByTestId('tab-shadowing'));

  await expandSectionInSpecifyMode(user, scr, 'topics');
  await waitForTestId(scr, 'add-topic-filter-button');

  // Find the first empty filter and fill it
  await typeIntoTestId(user, scr, 'topic-filter-0-name', name);
};

/**
 * Add a consumer filter (edit form - with tab navigation)
 */
export const addConsumerFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  await clickShadowingTabIfPresent(user, scr);
  await expandSectionInSpecifyMode(user, scr, 'consumers');
  await waitForTestId(scr, 'add-consumer-filter-button');

  // Add a consumer filter
  await user.click(scr.getByTestId('add-consumer-filter-button'));
  await typeIntoTestId(user, scr, 'consumer-filter-0-name', name);
};

/**
 * Add an ACL filter (edit form - with tab navigation)
 */
export const addACLFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  principal: string
) => {
  await clickShadowingTabIfPresent(user, scr);
  await expandSectionInSpecifyMode(user, scr, 'acls');
  await waitForTestId(scr, 'add-acl-filter-button');

  // Add an ACL filter
  await user.click(scr.getByTestId('add-acl-filter-button'));
  await typeIntoTestId(user, scr, 'acl-filter-0-principal', principal);
};

/**
 * Toggle exclude default setting (edit form - with tab navigation)
 */
export const toggleExcludeDefault = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  // Navigate to Topic Config tab
  const topicConfigTab = scr.getByTestId('tab-topic-config');
  await user.click(topicConfigTab);

  await waitFor(() => {
    expect(scr.getByTestId('exclude-default-switch')).toBeInTheDocument();
  });

  const excludeDefaultSwitch = scr.getByTestId('exclude-default-switch');
  await user.click(excludeDefaultSwitch);
};

/**
 * Navigate to configuration step (create form - stepper navigation)
 */
export const navigateToConfigurationStep = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const nextButton = scr.getByText('Next');
  await user.click(nextButton);

  // Wait for configuration step to be visible
  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });
};

/**
 * Add a topic filter (create form - without tab navigation)
 */

export const addTopicFilterCreate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string,
  options?: { patternType?: PatternType; filterType?: FilterType }
) => {
  const { patternType = PatternType.LITERAL, filterType = FilterType.INCLUDE } = options || {};

  await openTopicFiltersInSpecifyMode(user, scr);
  const filterIndex = await nextTopicFilterIndex(user, scr);

  // Fill in name
  await user.type(scr.getByTestId(`topic-filter-${filterIndex}-name`), name);

  // Set pattern and filter type if not default
  if (patternType !== PatternType.LITERAL || filterType !== FilterType.INCLUDE) {
    await selectTopicFilterType(user, scr, filterIndex, { patternType, filterType });
  }

  return filterIndex;
};

/**
 * Add a consumer filter (create form - without tab navigation)
 */
export const addConsumerFilterCreate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  await expandSectionInSpecifyMode(user, scr, 'consumers');
  await waitForTestId(scr, 'add-consumer-filter-button');

  // Add a consumer filter
  await user.click(scr.getByTestId('add-consumer-filter-button'));
  await typeIntoTestId(user, scr, 'consumer-filter-0-name', name);
};

/**
 * Add an ACL filter (create form - without tab navigation)
 */
export const addACLFilterCreate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  principal: string
) => {
  // Switching to specify mode auto-expands the card and seeds an empty filter
  await expandSectionInSpecifyMode(user, scr, 'acls');
  await waitForTestId(scr, 'add-acl-filter-button');

  // Only add a filter when the mode switch did not seed one already
  if (!scr.queryByTestId('acl-filter-0-principal')) {
    await user.click(scr.getByTestId('add-acl-filter-button'));
  }

  await typeIntoTestId(user, scr, 'acl-filter-0-principal', principal);
};

/**
 * Add a role filter (create form - without tab navigation)
 */
export const addRoleFilterCreate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  await waitFor(() => {
    expect(scr.getByTestId('roles-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode (auto-expands the card and seeds an empty filter)
  const rolesSpecifyTab = scr.getByTestId('roles-specify-tab');
  await user.click(rolesSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('role-filter-0-name')).toBeInTheDocument();
  });

  const roleFilterInput = scr.getByTestId('role-filter-0-name');
  await user.type(roleFilterInput, name);
};

/**
 * Add a topic filter with pattern options
 */
export const addTopicFilterWithPattern = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  options: { name: string; patternType: PatternType; filterType: FilterType }
) => {
  const { name, patternType, filterType } = options;
  // Navigate to Shadowing tab if not already there
  const currentTab = scr.queryByTestId('tab-shadowing');
  if (currentTab && currentTab.getAttribute('data-state') !== 'active') {
    await user.click(currentTab);
  }

  await openTopicFiltersInSpecifyMode(user, scr);
  const filterIndex = await nextTopicFilterIndex(user, scr);

  // Fill in name
  await user.type(scr.getByTestId(`topic-filter-${filterIndex}-name`), name);

  // Set pattern and filter type
  await selectTopicFilterType(user, scr, filterIndex, { patternType, filterType });
};

/**
 * Enable schema registry sync (edit form - with tab navigation)
 */
export const enableSchemaRegistrySync = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  // Navigate to Shadowing tab (may already be there)
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('sr-enable-switch')).toBeInTheDocument();
  });

  const schemaRegistrySwitch = scr.getByTestId('sr-enable-switch');
  await user.click(schemaRegistrySwitch);
};
