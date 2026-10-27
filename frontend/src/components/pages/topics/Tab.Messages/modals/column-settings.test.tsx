import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from 'test-utils';

import { ColumnSettings } from './column-settings';

describe('column settings', () => {
  test('names the group of column visibility checkboxes', () => {
    render(<ColumnSettings getShowDialog={() => true} setShowDialog={rs.fn()} topicName="column-labels-test" />);

    expect(screen.getByRole('group', { name: 'Columns shown' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Timestamp format' })).toBeVisible();
  });
});
