import { expect, type Page, test } from '@playwright/test';

export const createPipeline = async (
  page: Page,
  { pipelineName, description }: { pipelineName: string; description?: string },
) => {
  return await test.step('Create pipeline', async () => {
    await page.goto('/rp-connect/create');
    await page.getByTestId('pipelineName').fill(pipelineName);
    if (description) {
      await page.getByTestId('pipelineDescription').fill(description);
    }
    await page.getByRole('button', { name: 'Create' }).click();
    // Wait for redirect to pipeline detail page
    await page.waitForURL(`/rp-connect/${pipelineName}`);
    await expect(page.getByText(pipelineName)).toBeVisible();
  });
};

export const deletePipeline = async (page: Page, { pipelineName }: { pipelineName: string }) => {
  return await test.step('Delete pipeline', async () => {
    await page.goto('/connect-clusters');
    await expect(page.getByRole('link', { name: pipelineName })).toBeVisible();
    await page.getByTestId(`delete-pipeline-button-${pipelineName}`).click();
    await page.getByTestId('delete-pipeline-confirm-button').click();
    await expect(page.getByText('Pipeline Deleted')).toBeVisible();
    await expect(page.getByRole('link', { name: pipelineName })).not.toBeVisible();
  });
};

export const createPipelineViaWizard = async (
  page: Page,
  { pipelineName, inputType, outputType }: { pipelineName: string; inputType: string; outputType: string },
) => {
  return await test.step('Create pipeline via wizard', async () => {
    await page.goto('/rp-connect/wizard');

    // Step 1: Select input
    await page.getByTestId(`connector-tile-${inputType}`).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Select output
    await page.getByTestId(`connector-tile-${outputType}`).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Skip topic creation (or add if needed)
    await page.getByRole('button', { name: 'Skip' }).click();

    // Step 4: Skip user creation (or add if needed)
    await page.getByRole('button', { name: 'Skip' }).click();

    // Should redirect to create page with pre-populated config
    await page.waitForURL('/rp-connect/create');

    // Fill in pipeline name and create
    await page.getByTestId('pipelineName').fill(pipelineName);
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for redirect to pipeline detail page
    await page.waitForURL(`/rp-connect/${pipelineName}`);
    await expect(page.getByText(pipelineName)).toBeVisible();
  });
};

export const addConnectorToPipeline = async (
  page: Page,
  { connectorType, connectorName }: { connectorType: string; connectorName: string },
) => {
  return await test.step(`Add ${connectorType} connector`, async () => {
    // Click the connector type badge
    await page.getByTestId(`add-connector-${connectorType}`).click();

    // Select the specific connector from the dialog
    await page.getByTestId(`connector-dialog-tile-${connectorName}`).click();

    // Close the dialog (connector should be added to editor)
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Verify connector was added by checking editor content contains the connector name
    await expect(page.locator('.monaco-editor').getByText(new RegExp(connectorName, 'i'))).toBeVisible();
  });
};

export const createSecret = async (
  page: Page,
  { secretName, secretValue }: { secretName: string; secretValue: string },
) => {
  return await test.step('Create secret', async () => {
    await page.getByRole('button', { name: 'Add Secret' }).click();
    await page.getByTestId(`secret-name-input-${secretName}`).fill(secretName);
    await page.getByTestId(`secret-value-input-${secretName}`).fill(secretValue);
    await page.getByRole('button', { name: 'Create Secrets' }).click();
    await expect(page.getByText(`\${secrets.${secretName}}`)).toBeVisible();
  });
};

export const insertSecretIntoEditor = async (page: Page, { secretName }: { secretName: string }) => {
  return await test.step('Insert secret into editor', async () => {
    // Click the secret badge in the sidebar
    await page.getByText(`\${secrets.${secretName}}`).click();

    // Secret should be inserted at cursor position in editor
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain(`\${secrets.${secretName}}`);
  });
};
