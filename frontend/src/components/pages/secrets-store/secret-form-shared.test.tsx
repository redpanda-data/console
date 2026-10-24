/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { beforeAll, describe, expect, it, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from 'components/redpanda-ui/components/multi-select';
import { useControllableState } from 'components/redpanda-ui/lib/use-controllable-state';

import { labelsToMap, SCOPE_OPTIONS } from './secret-form-shared';

// cmdk calls scrollIntoView which is not available in Happy DOM
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

const EMPTY_SCOPES: string[] = [];

/**
 * Helper component that mirrors the scope MultiSelect usage in the
 * secret create / edit pages, but without any form or routing wiring.
 */
function ScopeMultiSelect({ defaultValue = EMPTY_SCOPES }: { defaultValue?: string[] }) {
  const [value, setValue] = useControllableState({ defaultProp: defaultValue });

  return (
    <MultiSelect onValueChange={setValue} value={value}>
      <MultiSelectTrigger data-testid="scope-trigger">
        <MultiSelectValue placeholder="Select scopes" />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectList>
          {SCOPE_OPTIONS.map((option) => (
            <MultiSelectItem key={option.value} label={option.label} value={option.value}>
              <span className="flex items-center gap-2">
                <option.icon className="size-4" />
                {option.label}
              </span>
            </MultiSelectItem>
          ))}
        </MultiSelectList>
        <MultiSelectEmpty>No items found</MultiSelectEmpty>
      </MultiSelectContent>
    </MultiSelect>
  );
}

type ScopeOption = (typeof SCOPE_OPTIONS)[number];

const [FIRST_SCOPE, SECOND_SCOPE] = SCOPE_OPTIONS;

/** The trigger shows the human-readable label, and not the raw enum value as standalone text. */
function expectLabelWithoutRawValue(trigger: HTMLElement, option: ScopeOption) {
  expect(trigger).toHaveTextContent(option.label);
  const triggerText = trigger.textContent ?? '';
  const rawNumberPattern = new RegExp(`(^|\\s)${option.value}(\\s|$)`);
  if (!option.label.includes(option.value)) {
    expect(triggerText).not.toMatch(rawNumberPattern);
  }
}

describe('labelsToMap', () => {
  test('maps complete label rows by key', () => {
    expect(
      labelsToMap([
        { key: 'env', value: 'production' },
        { key: 'team', value: 'data' },
      ])
    ).toEqual({ env: 'production', team: 'data' });
  });

  test('skips rows with an empty key or value', () => {
    expect(
      labelsToMap([
        { key: '', value: '' },
        { key: 'env', value: '' },
        { key: '', value: 'orphan' },
        { key: 'team', value: 'data' },
      ])
    ).toEqual({ team: 'data' });
  });
});

describe('the SCOPE_OPTIONS labels', () => {
  it('all labels are plain strings, not JSX or raw enum numbers', () => {
    for (const option of SCOPE_OPTIONS) {
      expect(typeof option.label).toBe('string');
      // The label should not be a stringified number (raw enum value)
      expect(Number.isNaN(Number(option.label))).toBe(true);
    }
  });

  it('each option has a string label and a renderable icon component', () => {
    const expectedLabels = ['AI Gateway', 'MCP Server', 'AI Agent', 'Redpanda Connect', 'Redpanda Cluster'];

    expect(SCOPE_OPTIONS.map((o) => o.label)).toEqual(expectedLabels);

    for (const option of SCOPE_OPTIONS) {
      // Icons can be functions (lucide) or objects (forwardRef components)
      expect(['function', 'object']).toContain(typeof option.icon);
    }
  });

  it('each option value is a numeric string matching a Scope enum value', () => {
    for (const option of SCOPE_OPTIONS) {
      expect(Number.isNaN(Number(option.value))).toBe(false);
      expect(Number(option.value)).toBeGreaterThan(0);
    }
  });
});

describe('scope MultiSelect trigger', () => {
  it('shows placeholder when no scopes are selected', () => {
    render(<ScopeMultiSelect />);

    expect(screen.getByText('Select scopes')).toBeInTheDocument();
  });

  it('displays plain text label after selecting a scope from the dropdown', async () => {
    const user = userEvent.setup();

    render(<ScopeMultiSelect />);

    const trigger = screen.getByTestId('scope-trigger');

    // Open the dropdown by clicking the trigger
    await user.click(trigger);

    // Click the first option ("AI Gateway")
    await user.click(await screen.findByText(FIRST_SCOPE.label));

    // The trigger should now show the human-readable label text, not the raw enum value
    expectLabelWithoutRawValue(trigger, FIRST_SCOPE);
  });

  it('displays plain text labels for multiple selected scopes', async () => {
    const user = userEvent.setup();

    render(<ScopeMultiSelect />);

    const trigger = screen.getByTestId('scope-trigger');

    // Open dropdown and select two options
    await user.click(trigger);

    await user.click(await screen.findByText(FIRST_SCOPE.label));
    await user.click(await screen.findByText(SECOND_SCOPE.label));

    // Close the dropdown
    await user.keyboard('{Escape}');

    // Both labels should appear in the trigger, and raw numeric enum values should not appear as standalone text
    expectLabelWithoutRawValue(trigger, FIRST_SCOPE);
    expectLabelWithoutRawValue(trigger, SECOND_SCOPE);
  });
});
