import { expect, type Page, step } from './e2e';

export type CreateSchemaOptions = {
  subjectName: string;
  schemaFormat?: 'AVRO' | 'PROTOBUF' | 'JSON';
  schemaText: string;
  strategy?: 'TOPIC_NAME' | 'RECORD_NAME' | 'TOPIC_RECORD_NAME' | 'CUSTOM';
  keyOrValue?: 'KEY' | 'VALUE';
};

const replaceEditorText = async (page: Page, text: string) => {
  const editor = page.locator('.monaco-editor').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
};

const validateSchemaText = async (page: Page) => {
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('Schema is valid')).toBeVisible({ timeout: 5000 });
};

const selectFormatAndSubject = async (
  page: Page,
  {
    subjectName,
    schemaFormat,
    strategy,
    keyOrValue,
  }: Required<Omit<CreateSchemaOptions, 'schemaText' | 'keyOrValue'>> & Pick<CreateSchemaOptions, 'keyOrValue'>
) => {
  if (schemaFormat !== 'AVRO') {
    await page.getByTestId('schema-format-select').click();
    await page.getByText(schemaFormat).click();
  }

  await page.getByTestId('naming-strategy-select').click();
  await page.getByText(strategy).click();

  if (strategy !== 'CUSTOM' && keyOrValue) {
    await page.getByLabel(keyOrValue === 'KEY' ? 'Key' : 'Value').check();
  }

  if (strategy === 'CUSTOM') {
    await page.getByTestId('subject-name-input').fill(subjectName);
  }
};

export const createSchema = async (
  page: Page,
  { subjectName, schemaFormat = 'AVRO', schemaText, strategy = 'CUSTOM', keyOrValue }: CreateSchemaOptions
) =>
  await step(`Create schema: ${subjectName}`, async () => {
    await page.goto('/schema-registry');
    await page.getByRole('button', { name: 'Create new schema' }).click();

    await expect(page).toHaveURL('/schema-registry/create');

    await selectFormatAndSubject(page, { subjectName, schemaFormat, strategy, keyOrValue });

    await replaceEditorText(page, schemaText);
    await validateSchemaText(page);

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Schema created successfully')).toBeVisible({ timeout: 5000 });
  });

export const deleteSchema = async (
  page: Page,
  { subjectName, permanent = false }: { subjectName: string; permanent?: boolean }
) =>
  await step(`Delete schema: ${subjectName} (${permanent ? 'permanent' : 'soft'})`, async () => {
    await page.goto('/schema-registry');

    const row = page.getByTestId('schema-registry-table-name').filter({ hasText: subjectName });
    await expect(row).toBeVisible();

    await page.getByTestId(`schema-list-actions-trigger-${subjectName}`).click();
    await page.getByTestId(`schema-list-delete-btn-${subjectName}`).dispatchEvent('click');

    const confirmButton = page.getByRole('button', { name: permanent ? 'Permanently Delete' : 'Delete' });
    await confirmButton.click();

    await expect(page.getByText(permanent ? 'Subject permanently deleted' : 'Subject soft-deleted')).toBeVisible();
  });

export const addSchemaVersion = async (
  page: Page,
  { subjectName, schemaText }: { subjectName: string; schemaText: string }
) =>
  await step(`Add version to schema: ${subjectName}`, async () => {
    await page.goto(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=latest`);

    await page.getByRole('button', { name: 'Add version' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/schema-registry/subjects/${encodeURIComponent(subjectName)}/add-version`, 'u')
    );

    await replaceEditorText(page, schemaText);
    await validateSchemaText(page);

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Schema version created successfully')).toBeVisible({ timeout: 5000 });
  });

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
