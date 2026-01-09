import { expect, type Page, test } from '@playwright/test';

export type CreateSchemaOptions = {
  subjectName: string;
  schemaFormat?: 'AVRO' | 'PROTOBUF' | 'JSON';
  schemaText: string;
  strategy?: 'TOPIC_NAME' | 'RECORD_NAME' | 'TOPIC_RECORD_NAME' | 'CUSTOM';
  keyOrValue?: 'KEY' | 'VALUE';
};

export const createSchema = async (
  page: Page,
  { subjectName, schemaFormat = 'AVRO', schemaText, strategy = 'CUSTOM', keyOrValue }: CreateSchemaOptions
) => {
  return await test.step(`Create schema: ${subjectName}`, async () => {
    await page.goto('/schema-registry');
    await page.getByRole('button', { name: 'Create new schema' }).click();

    // Wait for create page to load
    await expect(page).toHaveURL('/schema-registry/create');

    // Select schema format
    if (schemaFormat !== 'AVRO') {
      await page.getByTestId('schema-format-select').click();
      await page.getByText(schemaFormat).click();
    }

    // Select naming strategy
    await page.getByTestId('naming-strategy-select').click();
    await page.getByText(strategy).click();

    // If strategy requires key/value selection
    if (strategy !== 'CUSTOM' && keyOrValue) {
      await page.getByLabel(keyOrValue === 'KEY' ? 'Key' : 'Value').check();
    }

    // Fill subject name for CUSTOM strategy
    if (strategy === 'CUSTOM') {
      await page.getByTestId('subject-name-input').fill(subjectName);
    }

    // Fill schema text in Monaco editor
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Meta+A'); // For Mac
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(schemaText);

    // Validate schema
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('Schema is valid')).toBeVisible({ timeout: 5000 });

    // Create schema
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Schema created successfully')).toBeVisible({ timeout: 5000 });
  });
};

export const deleteSchema = async (
  page: Page,
  { subjectName, permanent = false }: { subjectName: string; permanent?: boolean }
) => {
  return await test.step(`Delete schema: ${subjectName} (${permanent ? 'permanent' : 'soft'})`, async () => {
    await page.goto('/schema-registry');

    // Find and click delete button for the schema
    const row = page.getByTestId('schema-registry-table-name').filter({ hasText: subjectName });
    await expect(row).toBeVisible();

    const deleteButton = row.locator('..').locator('button[aria-label*="delete"], button:has(svg)').last();
    await deleteButton.click();

    // Confirm deletion in modal
    const confirmButton = page.getByRole('button', { name: permanent ? 'Permanently Delete' : 'Delete' });
    await confirmButton.click();

    await expect(page.getByText(permanent ? 'Subject permanently deleted' : 'Subject soft-deleted')).toBeVisible();
  });
};

export const addSchemaVersion = async (
  page: Page,
  { subjectName, schemaText }: { subjectName: string; schemaText: string }
) => {
  return await test.step(`Add version to schema: ${subjectName}`, async () => {
    await page.goto(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=latest`);

    // Click add version button
    await page.getByRole('button', { name: 'Add version' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/schema-registry/subjects/${encodeURIComponent(subjectName)}/add-version`)
    );

    // Update schema text in Monaco editor
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Meta+A'); // For Mac
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(schemaText);

    // Validate schema
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('Schema is valid')).toBeVisible({ timeout: 5000 });

    // Create new version
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Schema version created successfully')).toBeVisible({ timeout: 5000 });
  });
};

export const sampleAvroSchema = (recordName: string) =>
  JSON.stringify(
    {
      type: 'record',
      name: recordName,
      namespace: 'com.example.test',
      fields: [
        { name: 'id', type: 'long' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
      ],
    },
    null,
    2
  );

export const sampleAvroSchemaV2 = (recordName: string) =>
  JSON.stringify(
    {
      type: 'record',
      name: recordName,
      namespace: 'com.example.test',
      fields: [
        { name: 'id', type: 'long' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'phone', type: ['null', 'string'], default: null },
      ],
    },
    null,
    2
  );

export const sampleProtobufSchema = (messageName: string) => `syntax = "proto3";

package com.example.test;

message ${messageName} {
  int64 id = 1;
  string name = 2;
  string email = 3;
}
`;

export const sampleJsonSchema = (title: string) =>
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title,
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
      required: ['id', 'name', 'email'],
    },
    null,
    2
  );
