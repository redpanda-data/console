import { afterEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mount } from '@ui-sdk/core/testing';
import { createAgent } from '@ui-sdk/react/agent';
import { createRef, useState } from 'react';

import { Button, type ButtonProps } from '../components/redpanda-ui/components/button';
import { Checkbox } from '../components/redpanda-ui/components/checkbox';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from '../components/redpanda-ui/components/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/redpanda-ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/redpanda-ui/components/tabs';
import { ToggleGroup, ToggleGroupItem } from '../components/redpanda-ui/components/toggle-group';
import { type BaseValueDetails, baseMultiSelectAgent } from '../components/redpanda-ui/lib/primitives/base-value-agent';

const agent = createAgent();
afterEach(cleanup);
function Plan({
  onChange,
  cancel = false,
  readOnly = false,
}: {
  onChange: (value: string, details: BaseValueDetails) => void;
  cancel?: boolean;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState('one');
  return (
    <Select
      onValueChange={(next, details) => {
        if (cancel) {
          details.cancel();
          return;
        }
        setValue(next);
        onChange(next, details);
      }}
      readOnly={readOnly}
      value={value}
    >
      <SelectTrigger aria-label="Plan">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one">One</SelectItem>
        <SelectItem value="two">Two</SelectItem>
        <SelectItem disabled value="three">
          Three
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
async function selectWithAgent(value: string) {
  await act(() => agent.act({ steps: [{ ref: 'Plan', action: 'setValue', args: [value] }] }));
}
test('human input and SDK writes share one source-aware selection callback', async () => {
  const onChange = rs.fn<(value: string, details: BaseValueDetails) => void>();
  render(<Plan onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox', { name: 'Plan' }));
  await userEvent.click(screen.getByRole('option', { name: 'Two' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]?.[1].source).not.toBe('agent');
  await selectWithAgent('One');
  expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('One');
  expect(onChange.mock.calls[1]?.[1].source).toBe('agent');
});
test.each([{ cancel: true }, { readOnly: true }])(
  'agent changes respect cancellation and read-only state: %j',
  async (props) => {
    const onChange = rs.fn();
    render(<Plan {...props} onChange={onChange} />);
    await selectWithAgent('Two');
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('One');
    expect(onChange).not.toHaveBeenCalled();
  }
);
test.each(['Three', 'Missing'])(
  'an SDK action opens the Base UI popup without accepting unavailable item %s',
  async (value) => {
    const onChange = rs.fn();
    render(<Plan onChange={onChange} />);
    await act(() => agent.act({ steps: [{ ref: 'Plan', action: 'open' }] }));
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeVisible();
    await selectWithAgent(value);
    expect(onChange).not.toHaveBeenCalled();
  }
);

test.each(['button', 'toolbar-save'])('styled Base UI button roots keep SDK actions discoverable: %s', async (slot) => {
  const onClick = rs.fn<NonNullable<ButtonProps['onClick']>>();
  render(
    <Button data-slot={slot} onClick={onClick}>
      Save draft
    </Button>
  );
  expect(agent.snapshot()).toContainEqual(expect.objectContaining({ label: 'Save draft' }));
  await act(() => agent.act({ steps: [{ ref: 'Save draft', action: 'press' }] }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick.mock.calls[0]?.[1].source).toBe('agent');
});

test.each(['as', 'render'])('link composition preserves native attributes and activation: %s', async (mode) => {
  const onClick = rs.fn<NonNullable<ButtonProps['onClick']>>((event) => event.preventDefault());
  const linkProps =
    mode === 'as'
      ? { as: 'a' as const, href: '#draft', rel: 'noreferrer', target: '_blank' }
      : {
          render: (
            <a href="#draft" rel="noreferrer" target="_blank">
              Docs
            </a>
          ),
        };
  render(
    <Button {...linkProps} onClick={onClick} variant="unstyled">
      Docs
    </Button>
  );
  const link = screen.getByRole('link', { name: 'Docs' });
  expect(link).toHaveAttribute('href', '#draft');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
  await userEvent.click(link);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick.mock.calls[0]?.[1].source).not.toBe('agent');
});

function Sections({
  onChange,
  controlled = false,
  disabledSource = false,
}: {
  onChange?: (value: string) => void;
  controlled?: boolean;
  disabledSource?: boolean;
}) {
  return (
    <Tabs aria-label="Sections" onValueChange={onChange} value={controlled ? 'source' : undefined}>
      <TabsList>
        <TabsTrigger disabled={disabledSource} value="source">
          Source
        </TabsTrigger>
        <TabsTrigger disabled value="review">
          Review
        </TabsTrigger>
      </TabsList>
      <TabsContent value="source">Source form</TabsContent>
      <TabsContent value="review">Review form</TabsContent>
    </Tabs>
  );
}
test('uncontrolled Base UI tabs initially select their first enabled tab', () => {
  render(<Sections />);
  expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Source form')).toBeVisible();
});
test('tabs preserve a caller data-testid on the Base UI root', () => {
  render(
    <Tabs data-testid="schema-details-tabs" defaultValue="definition">
      <TabsList>
        <TabsTrigger value="definition">Definition</TabsTrigger>
      </TabsList>
      <TabsContent value="definition">Schema definition</TabsContent>
    </Tabs>
  );
  expect(screen.getByTestId('schema-details-tabs')).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Definition' })).toHaveAttribute('aria-selected', 'true');
});
test.each(['review', 'Review form'])('panel metadata cannot enable a disabled Base UI tab: %s', async (value) => {
  const onChange = rs.fn();
  render(<Sections controlled onChange={onChange} />);
  await act(() => agent.act({ steps: [{ ref: 'Sections', action: 'setValue', args: [value] }] }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
});

test('tab panels cannot supply an initial selection when all Base UI tabs are disabled', () => {
  render(<Sections disabledSource />);
  expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'false');
});

test('agent multiselection runs the same item callbacks as human selection', async () => {
  const onSelect = rs.fn();
  const onChange = rs.fn();
  render(
    <MultiSelect onValueChange={onChange}>
      <MultiSelectTrigger aria-label="Roles">
        <MultiSelectValue />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectList>
          <MultiSelectItem onSelect={onSelect} value="reader">
            Reader
          </MultiSelectItem>
        </MultiSelectList>
      </MultiSelectContent>
    </MultiSelect>
  );
  await act(async () => {
    expect(await agent.act({ steps: [{ ref: 'Roles', action: 'setValue', args: [['Reader']] }] })).toMatchObject({
      ok: true,
    });
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledTimes(1);
});
test('human multiselection invokes item callbacks once per selection and removal', async () => {
  const onSelect = rs.fn();
  const onDeselect = rs.fn();
  render(
    <MultiSelect>
      <MultiSelectTrigger aria-label="Roles">
        <MultiSelectValue />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectList>
          <MultiSelectItem onDeselect={onDeselect} onSelect={onSelect} value="reader">
            Reader
          </MultiSelectItem>
        </MultiSelectList>
      </MultiSelectContent>
    </MultiSelect>
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Roles' }));
  await userEvent.click(screen.getByRole('option', { name: 'Reader' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('option', { name: 'Reader' }));
  expect(onDeselect).toHaveBeenCalledTimes(1);
});
test('mixed checkbox writes respect callback cancellation', async () => {
  const onChange = rs.fn((_next, details) => details.cancel());
  render(<Checkbox aria-label="Select all rows" defaultChecked="indeterminate" onCheckedChange={onChange} />);
  await act(() => agent.act({ steps: [{ ref: 'Select all rows', action: 'setChecked', args: [false] }] }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute('aria-checked', 'mixed');
});
function MixedSelection({ onChange }: { onChange: (value: boolean | 'indeterminate') => void }) {
  const [checked, setChecked] = useState<boolean | 'indeterminate'>('indeterminate');
  return (
    <Checkbox
      aria-label="Select all rows"
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next);
        onChange(next);
      }}
    />
  );
}
test('an agent can clear a mixed Base UI checkbox with one callback', async () => {
  const onChange = rs.fn();
  render(<MixedSelection onChange={onChange} />);
  await act(async () => {
    const result = await agent.act({ steps: [{ ref: 'Select all rows', action: 'setChecked', args: [false] }] });
    expect(result).toMatchObject({ ok: true });
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute('aria-checked', 'false');
});
test('forwarded refs keep uncontrolled mixed checkboxes discoverable to agents', async () => {
  const ref = createRef<HTMLButtonElement>();
  const onChange = rs.fn();
  render(<Checkbox aria-label="Select rows" defaultChecked="indeterminate" onCheckedChange={onChange} ref={ref} />);
  await act(async () => {
    expect(await agent.act({ steps: [{ ref: 'Select rows', action: 'setChecked', args: [false] }] })).toMatchObject({
      ok: true,
    });
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(ref.current).toHaveAttribute('aria-checked', 'false');
});
test('agent writes preserve the Base UI single-selection toggle-group constraint', async () => {
  const onChange = rs.fn();
  render(
    <ToggleGroup aria-label="Mode" multiple={false} onValueChange={onChange}>
      <ToggleGroupItem value="one">One</ToggleGroupItem>
      <ToggleGroupItem value="two">Two</ToggleGroupItem>
    </ToggleGroup>
  );
  await act(() => agent.act({ steps: [{ ref: 'Mode', action: 'setValue', args: [['one', 'two']] }] }));
  expect(onChange).not.toHaveBeenCalled();
});

test.each([
  { next: ['retired', 'reader'], accepted: true },
  { next: ['retired', 'missing'], accepted: false },
  { next: ['retired', 'disabled'], accepted: false },
  { next: [], accepted: true },
])('filtered multiselect validates additions, not retained values: %j', ({ next, accepted }) => {
  const onChange = rs.fn();
  const bridge = mount(
    baseMultiSelectAgent,
    {
      defaultValue: ['retired'],
      items: [
        { value: 'reader', label: 'Reader' },
        { value: 'disabled', label: 'Disabled', disabled: true },
      ],
      valid: (value) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
      onValueChange: onChange,
    },
    '<root />'
  );
  try {
    bridge.api.setValue(next);
    expect(onChange).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (accepted) {
      expect(onChange.mock.calls[0]?.[0]).toEqual(next);
    }
  } finally {
    bridge.unmount();
  }
});
