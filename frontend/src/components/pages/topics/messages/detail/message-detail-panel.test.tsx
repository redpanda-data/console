import { expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TopicMessage } from 'state/rest-interfaces';

import { MessageDetailPanel } from './message-detail-panel';

const message: TopicMessage = {
  partitionID: 0,
  offset: 42,
  timestamp: 0,
  compression: 'uncompressed',
  isTransactional: false,
  headers: [],
  key: { payload: null, isPayloadNull: true, encoding: 'null', schemaId: 0, size: 0 },
  value: { payload: null, isPayloadNull: true, encoding: 'null', schemaId: 0, size: 0 },
  keyJson: '',
  valueJson: '',
  keyBinHexPreview: '',
  valueBinHexPreview: '',
};

test('expanding focuses the sheet controls and does not steal focus when the message changes', async () => {
  const user = userEvent.setup();
  const props = {
    msg: message,
    expanded: true,
    onClose: rs.fn(),
    onExpandedChange: rs.fn(),
    loadLargeMessage: rs.fn().mockResolvedValue(undefined),
  };
  const { rerender } = render(<MessageDetailPanel {...props} />);
  expect(screen.getByRole('button', { name: 'Collapse back to panel' })).toHaveFocus();

  await user.tab();
  const close = screen.getByRole('button', { name: 'Close' });
  expect(close).toHaveFocus();
  rerender(<MessageDetailPanel {...props} msg={{ ...message, offset: 43 }} />);
  expect(close).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(props.onExpandedChange).toHaveBeenCalledWith(false);
});

test('opening a docked panel does not steal focus from the message table', () => {
  render(
    <MessageDetailPanel
      expanded={false}
      loadLargeMessage={rs.fn().mockResolvedValue(undefined)}
      msg={message}
      onClose={rs.fn()}
      onExpandedChange={rs.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'Expand' })).not.toHaveFocus();
});
