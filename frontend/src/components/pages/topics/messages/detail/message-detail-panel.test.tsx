import { expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { Button } from 'components/redpanda-ui/components/button';
import { useRef, useState } from 'react';
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

/** Renders the expanded sheet, returning its props alongside the render result. */
function renderExpandedPanel() {
  const props = {
    msg: message,
    expanded: true,
    onClose: rs.fn(),
    onExpandedChange: rs.fn(),
    loadLargeMessage: rs.fn().mockResolvedValue(undefined),
  };
  return { props, ...render(<MessageDetailPanel {...props} />) };
}

test('expanding focuses the sheet controls and does not steal focus when the message changes', async () => {
  const user = userEvent.setup();
  const { props, rerender } = renderExpandedPanel();
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

function DetailPresentationHarness() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackFocusRef = useRef<HTMLButtonElement>(null);
  const props = {
    msg: message,
    onClose: () => setOpen(false),
    onExpandedChange: setExpanded,
    loadLargeMessage: async () => undefined,
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
const expandButton = () => screen.getByRole('button', { name: 'Expand', exact: true });
const collapseButton = () => screen.getByRole('button', { name: 'Collapse back to panel' });

/** Opens the docked panel from the opener, then expands it into the sheet. */
async function openExpandedSheet(user: UserEvent) {
  await user.click(openerButton());
  await user.click(expandButton());
}

/** From the docked panel with focus on Expand: Enter re-expands it, then one of the sheet's buttons is clicked. */
async function reExpandThenClick(user: UserEvent, name: string) {
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name, exact: true }));
}

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
