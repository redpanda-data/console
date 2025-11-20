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
  | { type: 'toggleExcludeDefault' };

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
  // Expand advanced options if not already expanded
  const advancedContent = scr.queryByTestId('advanced-options-content');
  if (!advancedContent) {
    const advancedOptionsToggle = scr.getByTestId('advanced-options-toggle');
    await user.click(advancedOptionsToggle);

    await waitFor(() => {
      expect(scr.getByTestId('advanced-options-content')).toBeInTheDocument();
    });
  }

  // Get the field container and find the input within it
  const fieldContainer = scr.getByTestId(`${field}-field`);
  const fieldInput = fieldContainer.querySelector('input');
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
  const shadowingTab = scr.getByTestId('tab-shadowing');
  await user.click(shadowingTab);

  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });

  // Expand topics section
  const topicsToggle = scr.getByTestId('topics-toggle-button');
  await user.click(topicsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('topics-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const topicsSpecifyTab = scr.getByTestId('topics-specify-tab');
  await user.click(topicsSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-topic-filter-button')).toBeInTheDocument();
  });

  // Find the first empty filter and fill it
  await waitFor(() => {
    expect(scr.getByTestId('topic-filter-0-name')).toBeInTheDocument();
  });

  const topicFilterInput = scr.getByTestId('topic-filter-0-name');
  await user.type(topicFilterInput, name);
};

/**
 * Add a consumer filter (edit form - with tab navigation)
 */
export const addConsumerFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  // Navigate to Shadowing tab (may already be there)
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('consumers-toggle-button')).toBeInTheDocument();
  });

  // Expand consumers section
  const consumersToggle = scr.getByTestId('consumers-toggle-button');
  await user.click(consumersToggle);

  await waitFor(() => {
    expect(scr.getByTestId('consumers-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const consumersSpecifyTab = scr.getByTestId('consumers-specify-tab');
  await user.click(consumersSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-consumer-filter-button')).toBeInTheDocument();
  });

  // Add a consumer filter
  const addConsumerFilterButton = scr.getByTestId('add-consumer-filter-button');
  await user.click(addConsumerFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('consumer-filter-0-name')).toBeInTheDocument();
  });

  const consumerFilterInput = scr.getByTestId('consumer-filter-0-name');
  await user.type(consumerFilterInput, name);
};

/**
 * Add an ACL filter (edit form - with tab navigation)
 */
export const addACLFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  principal: string
) => {
  // Navigate to Shadowing tab (may already be there)
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('acls-toggle-button')).toBeInTheDocument();
  });

  // Expand ACLs section
  const aclsToggle = scr.getByTestId('acls-toggle-button');
  await user.click(aclsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('acls-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const aclsSpecifyTab = scr.getByTestId('acls-specify-tab');
  await user.click(aclsSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-acl-filter-button')).toBeInTheDocument();
  });

  // Add an ACL filter
  const addAclFilterButton = scr.getByTestId('add-acl-filter-button');
  await user.click(addAclFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('acl-filter-0-principal')).toBeInTheDocument();
  });

  const aclPrincipalInput = scr.getByTestId('acl-filter-0-principal');
  await user.type(aclPrincipalInput, principal);
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

  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });

  // Expand topics section if not already expanded
  const topicsContent = scr.queryByTestId('topics-filters-container');
  if (!topicsContent) {
    const topicsToggle = scr.getByTestId('topics-toggle-button');
    await user.click(topicsToggle);
  }

  await waitFor(() => {
    expect(scr.getByTestId('topics-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode if not already in it
  const specifyTab = scr.getByTestId('topics-specify-tab');
  if (specifyTab.getAttribute('data-state') !== 'active') {
    await user.click(specifyTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('add-topic-filter-button')).toBeInTheDocument();
  });

  // Count existing filters and determine if we need to add a new one
  const existingNameInputs = scr.queryAllByTestId(TOPIC_FILTER_NAME_PATTERN);
  let filterIndex = 0;

  // Check if filter 0 exists and is empty (from mode switch)
  if (existingNameInputs.length > 0) {
    const firstFilter = existingNameInputs[0];
    const firstValue = (firstFilter as HTMLInputElement).value;

    if (firstValue) {
      // First filter is filled, add a new one
      const addButton = scr.getByTestId('add-topic-filter-button');
      await user.click(addButton);
      filterIndex = existingNameInputs.length;

      await waitFor(() => {
        expect(scr.getByTestId(`topic-filter-${filterIndex}-name`)).toBeInTheDocument();
      });
    }
  }

  // Fill in name
  const nameInput = scr.getByTestId(`topic-filter-${filterIndex}-name`);
  await user.type(nameInput, name);

  // Set pattern and filter type if not default
  if (patternType !== PatternType.LITERAL || filterType !== FilterType.INCLUDE) {
    let tabTestId = `topic-filter-${filterIndex}-`;
    if (filterType === FilterType.INCLUDE && patternType === PatternType.LITERAL) {
      tabTestId += 'include-specific';
    } else if (filterType === FilterType.INCLUDE && patternType === PatternType.PREFIX) {
      tabTestId += 'include-prefix';
    } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.LITERAL) {
      tabTestId += 'exclude-specific';
    } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.PREFIX) {
      tabTestId += 'exclude-prefix';
    }

    const patternTab = scr.getByTestId(tabTestId);
    await user.click(patternTab);
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
  await waitFor(() => {
    expect(scr.getByTestId('consumers-toggle-button')).toBeInTheDocument();
  });

  // Expand consumers section
  const consumersToggle = scr.getByTestId('consumers-toggle-button');
  await user.click(consumersToggle);

  await waitFor(() => {
    expect(scr.getByTestId('consumers-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const consumersSpecifyTab = scr.getByTestId('consumers-specify-tab');
  await user.click(consumersSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-consumer-filter-button')).toBeInTheDocument();
  });

  // Add a consumer filter
  const addConsumerFilterButton = scr.getByTestId('add-consumer-filter-button');
  await user.click(addConsumerFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('consumer-filter-0-name')).toBeInTheDocument();
  });

  const consumerFilterInput = scr.getByTestId('consumer-filter-0-name');
  await user.type(consumerFilterInput, name);
};

/**
 * Add an ACL filter (create form - without tab navigation)
 */
export const addACLFilterCreate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  principal: string
) => {
  await waitFor(() => {
    expect(scr.getByTestId('acls-toggle-button')).toBeInTheDocument();
  });

  // Expand ACLs section
  const aclsToggle = scr.getByTestId('acls-toggle-button');
  await user.click(aclsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('acls-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const aclsSpecifyTab = scr.getByTestId('acls-specify-tab');
  await user.click(aclsSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-acl-filter-button')).toBeInTheDocument();
  });

  // Add an ACL filter
  const addAclFilterButton = scr.getByTestId('add-acl-filter-button');
  await user.click(addAclFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('acl-filter-0-principal')).toBeInTheDocument();
  });

  const aclPrincipalInput = scr.getByTestId('acl-filter-0-principal');
  await user.type(aclPrincipalInput, principal);
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

  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });

  // Expand topics section if not already expanded
  const topicsContent = scr.queryByTestId('topics-filters-container');
  if (!topicsContent) {
    const topicsToggle = scr.getByTestId('topics-toggle-button');
    await user.click(topicsToggle);
  }

  await waitFor(() => {
    expect(scr.getByTestId('topics-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode if not already in it
  const specifyTab = scr.getByTestId('topics-specify-tab');
  if (specifyTab.getAttribute('data-state') !== 'active') {
    await user.click(specifyTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('add-topic-filter-button')).toBeInTheDocument();
  });

  // Count existing filters and determine if we need to add a new one or fill an empty one
  const existingNameInputs = scr.queryAllByTestId(TOPIC_FILTER_NAME_PATTERN);
  let filterIndex = 0;

  // Check if filter 0 exists and is empty (from mode switch)
  if (existingNameInputs.length > 0) {
    const firstFilter = existingNameInputs[0];
    const firstValue = (firstFilter as HTMLInputElement).value;

    if (firstValue) {
      // First filter is filled, add a new one
      const addButton = scr.getByTestId('add-topic-filter-button');
      await user.click(addButton);
      filterIndex = existingNameInputs.length;

      await waitFor(() => {
        expect(scr.getByTestId(`topic-filter-${filterIndex}-name`)).toBeInTheDocument();
      });
    }
  }

  // Fill in name
  const nameInput = scr.getByTestId(`topic-filter-${filterIndex}-name`);
  await user.type(nameInput, name);

  // Set pattern and filter type
  let tabTestId = `topic-filter-${filterIndex}-`;
  if (filterType === FilterType.INCLUDE && patternType === PatternType.LITERAL) {
    tabTestId += 'include-specific';
  } else if (filterType === FilterType.INCLUDE && patternType === PatternType.PREFIX) {
    tabTestId += 'include-prefix';
  } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.LITERAL) {
    tabTestId += 'exclude-specific';
  } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.PREFIX) {
    tabTestId += 'exclude-prefix';
  }

  const patternTab = scr.getByTestId(tabTestId);
  await user.click(patternTab);
};
