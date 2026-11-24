import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { Button } from 'components/redpanda-ui/components/button';
import { useRef, useState } from 'react';
import type { TopicMessage } from 'state/rest-interfaces';

import { MessageDetailPanel } from './message-detail-panel';
import { useMessageSearch } from '../hooks/use-message-search';

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

function DetailPresentationHarness({ msg = message }: { msg?: TopicMessage }) {
  const search = useMessageSearch('orders');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackFocusRef = useRef<HTMLButtonElement>(null);
  const props = {
    msg,
    onClose: () => setOpen(false),
    onExpandedChange: setExpanded,
    loadLargeMessage: () => search.loadLargeMessage(msg.partitionID, msg.offset),
    expandButtonRef,
    fallbackFocusRef,
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} ref={fallbackFocusRef}>
        Open message
      </Button>
      <div>{open && !expanded && <MessageDetailPanel {...props} expanded={false} />}</div>
      {open && expanded ? <MessageDetailPanel {...props} expanded /> : null}
    </>
  );
}

const openerButton = () => screen.getByRole('button', { name: 'Open message' });
const expandButton = () => screen.getByRole('button', { name: 'Expand' });
const collapseButton = () => screen.getByRole('button', { name: 'Collapse back to panel' });
const closeButton = () => screen.getByRole('button', { name: 'Close' });

async function openExpandedSheet(user: UserEvent) {
  await user.click(openerButton());
  await user.click(expandButton());
}

async function reExpandThenClick(user: UserEvent, name: string) {
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name }));
}

test('docking keeps opener focus and changing messages keeps sheet control focus', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<DetailPresentationHarness />);
  await user.click(openerButton());
  expect(openerButton()).toHaveFocus();

  await user.click(expandButton());
  expect(collapseButton()).toHaveFocus();
  await user.tab();
  expect(closeButton()).toHaveFocus();

  rerender(<DetailPresentationHarness msg={{ ...message, offset: 43 }} />);
  expect(closeButton()).toHaveFocus();
});

test('restores focus to Expand across separate docked and expanded mounts on Escape and Collapse', async () => {
  const user = userEvent.setup();
  render(<DetailPresentationHarness />);
  await openExpandedSheet(user);
  await user.keyboard('{Escape}');
  expect(expandButton()).toHaveFocus();
  await reExpandThenClick(user, 'Collapse back to panel');
  expect(expandButton()).toHaveFocus();
});

test('restores focus to the opener on Close, and reopening resumes the expanded sheet', async () => {
  const user = userEvent.setup();
  render(<DetailPresentationHarness />);
  await openExpandedSheet(user);
  await user.keyboard('{Escape}');
  await reExpandThenClick(user, 'Close');
  expect(openerButton()).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(collapseButton()).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(expandButton()).toHaveFocus();
});
