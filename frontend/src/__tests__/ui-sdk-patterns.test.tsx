import { afterEach, expect, test } from '@rstest/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tabs } from '@ui-sdk/core/tabs';
import { checkDirection, checkServer } from '@ui-sdk/core/testing';
import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/redpanda-ui/components/tabs';
import { editorSurface } from '../components/redpanda-ui/lib/primitives/editor-surface';
import { sortable } from '../components/redpanda-ui/lib/primitives/sortable';

const tabsMarkup =
  '<root><list aria-label="Draft sections"><tab value="a">Source</tab><tab value="b">Review</tab></list><panel value="a">Source form</panel><panel value="b">Review form</panel></root>';
afterEach(cleanup);
function DraftTabs({ direction = 'ltr' }: { direction?: 'ltr' | 'rtl' }) {
  const [value, setValue] = useState('a');
  return (
    <div dir={direction}>
      <Tabs onValueChange={setValue} value={value}>
        <TabsList aria-label="Draft sections">
          <TabsTrigger value="a">Source</TabsTrigger>
          <TabsTrigger value="b">Review</TabsTrigger>
        </TabsList>
        <TabsContent keepMounted value="a">
          Source form
        </TabsContent>
        <TabsContent keepMounted value="b">
          Review form
        </TabsContent>
      </Tabs>
    </div>
  );
}
test('horizontal core navigation mirrors in both directions, and Console RTL tabs keep focus', async () => {
  await checkDirection(tabs, { defaultValue: 'a' }, tabsMarkup);
  render(<DraftTabs direction="rtl" />);
  await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Review' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true');
});
test('console-owned editor and reorder primitives render deterministic server attributes', () => {
  const editorHtml = checkServer(
    editorSurface,
    { value: 'private config', disabled: true, onValueChange: () => undefined },
    '<root aria-label="Pipeline source"></root>'
  );
  expect(editorHtml).toContain('aria-disabled="true"');
  expect(editorHtml).not.toContain('private config');
  const html = checkServer(
    sortable,
    { value: ['a', 'b'], onValueChange: () => undefined },
    '<root><item value="a"><handle value="a">A</handle></item><item value="b"><handle value="b">B</handle></item></root>'
  );
  expect(html).toContain('role="listitem"');
  expect(html).toContain('role="list"');
});
