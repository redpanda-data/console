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

import userEvent from '@testing-library/user-event';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useForm, useWatch } from 'react-hook-form';
import { render, screen } from 'test-utils';
import { beforeAll } from 'vitest';

import type { FormValues } from './schemas';
import { initialValues } from './schemas';

vi.mock('components/ui/yaml/yaml-editor-card', () => ({
  YamlEditorCard: ({ value }: { value: string }) => <pre data-testid="yaml-editor-value">{value}</pre>,
}));

import { ToolCard } from './tool-card';

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  }
});

const CACHE_DESCRIPTION = 'Cache is a key/value store used for data deduplication, joins, and temporary storage.';
const HTTP_TEMPLATE_DESCRIPTION = 'Fetch data from HTTP endpoints';
const MEMORY_CACHE_TEMPLATE_DESCRIPTION = 'In-memory cache for storing user data, configuration, and temporary values';

const ToolCardHarness = () => {
  const form = useForm<FormValues>({
    defaultValues: initialValues,
  });
  const toolState = useWatch({
    control: form.control,
    name: 'tools.0',
  });

  return (
    <>
      <ToolCard
        canRemove={false}
        form={form}
        isLintConfigPending={false}
        lintHints={{}}
        onExpand={vi.fn()}
        onLint={vi.fn()}
        onRemove={vi.fn()}
        toolIndex={0}
      />
      <pre data-testid="tool-state">{JSON.stringify(toolState)}</pre>
    </>
  );
};

function getToolState() {
  const rawValue = screen.getByTestId('tool-state').textContent;
  if (!rawValue) {
    throw new Error('Tool state probe did not render');
  }

  return JSON.parse(rawValue) as FormValues['tools'][number];
}

async function selectTemplate(user: ReturnType<typeof userEvent.setup>, templateName: string) {
  await user.click(screen.getByLabelText(/template \(optional\)/i));
  await user.click(await screen.findByRole('option', { name: new RegExp(templateName, 'i') }));
}

describe('ToolCard', () => {
  test('prefills YAML and UI immediately when selecting HTTP Request', async () => {
    const user = userEvent.setup();

    render(<ToolCardHarness />);

    await selectTemplate(user, 'HTTP Request');

    expect(screen.getByLabelText(/tool name/i)).toHaveValue('weather-by-city');
    expect(screen.getByLabelText(/template \(optional\)/i)).toHaveTextContent('HTTP Request');
    expect(screen.getByText(HTTP_TEMPLATE_DESCRIPTION, { selector: '[data-slot="field-description"]' })).toBeVisible();
    expect(screen.getByTestId('yaml-editor-value')).toHaveTextContent('label: weather-by-city');

    expect(getToolState()).toMatchObject({
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      name: 'weather-by-city',
      selectedTemplate: 'HTTP Request',
    });
  });

  test('switches component type and YAML immediately when selecting Memory Cache', async () => {
    const user = userEvent.setup();

    render(<ToolCardHarness />);

    await selectTemplate(user, 'Memory Cache');

    expect(screen.getByLabelText(/tool name/i)).toHaveValue('memory_cache');
    expect(screen.getByLabelText(/template \(optional\)/i)).toHaveTextContent('Memory Cache');
    expect(
      screen.getByText(MEMORY_CACHE_TEMPLATE_DESCRIPTION, { selector: '[data-slot="field-description"]' })
    ).toBeVisible();
    expect(screen.getByText(CACHE_DESCRIPTION)).toBeVisible();
    expect(screen.getByTestId('yaml-editor-value')).toHaveTextContent('label: memory_cache');
    expect(screen.getByTestId('yaml-editor-value')).toHaveTextContent('memory:');

    expect(getToolState()).toMatchObject({
      componentType: MCPServer_Tool_ComponentType.CACHE,
      name: 'memory_cache',
      selectedTemplate: 'Memory Cache',
    });
  });
});
