import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  addConnectorToPipeline,
  createPipeline,
  createPipelineViaWizard,
  createSecret,
  deletePipeline,
  insertSecretIntoEditor,
} from '../rp-connect.utils';

test.describe('Redpanda Connect - Tiles Functionality', () => {
  test('should create pipeline via wizard with input and output', async ({ page }) => {
    const pipelineName = `wizard-pipeline-${randomUUID()}`;

    await createPipelineViaWizard(page, {
      pipelineName,
      inputType: 'stdin',
      outputType: 'stdout',
    });

    // Verify pipeline was created with both input and output
    await page.goto(`/rp-connect/${pipelineName}/edit`);
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('input:');
    expect(editorContent).toContain('stdin');
    expect(editorContent).toContain('output:');
    expect(editorContent).toContain('stdout');

    await deletePipeline(page, { pipelineName });
  });

  test('should add processor connector to existing pipeline', async ({ page }) => {
    const pipelineName = `processor-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Add a log processor
    await addConnectorToPipeline(page, {
      connectorType: 'processor',
      connectorName: 'log',
    });

    // Verify processor was added
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('pipeline:');
    expect(editorContent).toContain('processors:');
    expect(editorContent).toContain('log');

    await deletePipeline(page, { pipelineName });
  });

  test('should add cache connector to existing pipeline', async ({ page }) => {
    const pipelineName = `cache-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Add a memory cache
    await addConnectorToPipeline(page, {
      connectorType: 'cache',
      connectorName: 'memory',
    });

    // Verify cache was added
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('cache_resources:');
    expect(editorContent).toContain('memory');

    await deletePipeline(page, { pipelineName });
  });

  test('should add buffer connector to existing pipeline', async ({ page }) => {
    const pipelineName = `buffer-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Add a memory buffer
    await addConnectorToPipeline(page, {
      connectorType: 'buffer',
      connectorName: 'memory',
    });

    // Verify buffer was added
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('buffer:');
    expect(editorContent).toContain('memory');

    await deletePipeline(page, { pipelineName });
  });

  test('should conditionally show scanner for supported inputs', async ({ page }) => {
    const pipelineName = `scanner-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Initially scanner button should not be visible
    await expect(page.getByTestId('add-connector-scanner')).not.toBeVisible();

    // Add aws_s3 input
    await addConnectorToPipeline(page, {
      connectorType: 'input',
      connectorName: 'aws_s3',
    });

    // Now scanner button should be visible
    await expect(page.getByTestId('add-connector-scanner')).toBeVisible();

    // Add a scanner
    await addConnectorToPipeline(page, {
      connectorType: 'scanner',
      connectorName: 'avro',
    });

    // Verify scanner was embedded in input
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('aws_s3:');
    expect(editorContent).toContain('scanner:');
    expect(editorContent).toContain('avro');

    await deletePipeline(page, { pipelineName });
  });

  test('should detect and create secrets', async ({ page }) => {
    const pipelineName = `secrets-test-${randomUUID()}`;
    const secretName = `TEST_SECRET_${randomUUID().slice(0, 8)}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Manually add a secret reference to the editor
    const monacoEditor = page.locator('.monaco-editor').first();
    await monacoEditor.click();
    await page.keyboard.insertText(`\${secrets.${secretName}}`);

    // Secret should be detected as missing
    await expect(page.getByText(`Missing Secrets:`)).toBeVisible();
    await expect(page.getByText(`Create ${secretName}`)).toBeVisible();

    // Create the secret
    await createSecret(page, {
      secretName,
      secretValue: 'test-value',
    });

    // Secret should now show as existing
    await expect(page.getByText('Existing Secrets:')).toBeVisible();
    await expect(page.getByText(`\${secrets.${secretName}}`)).toBeVisible();

    await deletePipeline(page, { pipelineName });
  });

  test('should show collapsible secrets when more than 3 exist', async ({ page }) => {
    const pipelineName = `collapsible-secrets-test-${randomUUID()}`;
    const secrets = Array.from({ length: 5 }, (_, i) => `SECRET_${i}_${randomUUID().slice(0, 8)}`);

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Create 5 secrets
    for (const secretName of secrets) {
      await createSecret(page, {
        secretName,
        secretValue: `value-${secretName}`,
      });
    }

    // First 3 secrets should be visible
    for (let i = 0; i < 3; i++) {
      await expect(page.getByText(`\${secrets.${secrets[i]}}`)).toBeVisible();
    }

    // Remaining secrets should be hidden initially
    for (let i = 3; i < 5; i++) {
      await expect(page.getByText(`\${secrets.${secrets[i]}}`)).not.toBeVisible();
    }

    // "2 More" button should be visible
    await expect(page.getByText('2 More')).toBeVisible();

    // Click to expand
    await page.getByText('2 More').click();

    // All secrets should now be visible
    for (const secretName of secrets) {
      await expect(page.getByText(`\${secrets.${secretName}}`)).toBeVisible();
    }

    await deletePipeline(page, { pipelineName });
  });

  test('should insert secret into editor on click', async ({ page }) => {
    const pipelineName = `insert-secret-test-${randomUUID()}`;
    const secretName = `TEST_SECRET_${randomUUID().slice(0, 8)}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Create a secret
    await createSecret(page, {
      secretName,
      secretValue: 'test-value',
    });

    // Position cursor in editor
    const monacoEditor = page.locator('.monaco-editor').first();
    await monacoEditor.click();
    await page.keyboard.insertText('\nkey: ');

    // Click unused secret badge to insert
    await insertSecretIntoEditor(page, { secretName });

    await deletePipeline(page, { pipelineName });
  });

  test('should display lint hints on pipeline validation error', async ({ page }) => {
    const pipelineName = `lint-test-${randomUUID()}`;

    await page.goto('/rp-connect/create');
    await page.getByTestId('pipelineName').fill(pipelineName);

    // Add invalid YAML
    const monacoEditor = page.locator('.monaco-editor').first();
    await monacoEditor.click();
    await page.keyboard.insertText('invalid: [unclosed bracket');

    // Try to create pipeline
    await page.getByRole('button', { name: 'Create' }).click();

    // Lint hints should be displayed
    await expect(page.getByText(/error/i)).toBeVisible();
    await expect(page.locator('[class*="lint"]')).toBeVisible();
  });

  test('should add root-level spacing when adding connectors', async ({ page }) => {
    const pipelineName = `spacing-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Add input
    await addConnectorToPipeline(page, {
      connectorType: 'input',
      connectorName: 'stdin',
    });

    // Add output
    await addConnectorToPipeline(page, {
      connectorType: 'output',
      connectorName: 'stdout',
    });

    // Add processor
    await addConnectorToPipeline(page, {
      connectorType: 'processor',
      connectorName: 'log',
    });

    // Get editor content
    const editorContent = await page.locator('.monaco-editor').textContent();

    // Verify proper spacing exists between root-level keys
    // There should be blank lines between major sections
    expect(editorContent).toMatch(/input:[\s\S]+\n\noutput:/);
    expect(editorContent).toMatch(/output:[\s\S]+\n\npipeline:/);

    await deletePipeline(page, { pipelineName });
  });

  test('should show scanner fields when explicitly added', async ({ page }) => {
    const pipelineName = `scanner-fields-test-${randomUUID()}`;

    await createPipeline(page, { pipelineName });
    await page.goto(`/rp-connect/${pipelineName}/edit`);

    // Add aws_s3 input first
    await addConnectorToPipeline(page, {
      connectorType: 'input',
      connectorName: 'aws_s3',
    });

    // Add avro scanner
    await addConnectorToPipeline(page, {
      connectorType: 'scanner',
      connectorName: 'avro',
    });

    // Verify scanner shows its configuration field (raw_json)
    const editorContent = await page.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('avro:');
    expect(editorContent).toContain('raw_json:');

    await deletePipeline(page, { pipelineName });
  });
});
